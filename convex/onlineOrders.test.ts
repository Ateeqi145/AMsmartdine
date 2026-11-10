/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

beforeEach(() => {
  vi.stubEnv(
    "DELIVERY_PIN_SECRET",
    "delivery-pin-test-secret-with-at-least-32-characters",
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
});

async function seedOnlineRestaurant(t: ReturnType<typeof convexTest>) {
  const now = new Date().toISOString();
  return await t.run(async (ctx) => {
    const restaurantId = await ctx.db.insert("restaurants", {
      name: "Test Restaurant",
      slug: "test-restaurant",
      isActive: true,
      currency: "INR",
      deliveryFeePaise: 300,
      deliveryTaxRatePercent: 10,
      deliveryDiscountPaise: 100,
      createdAt: now,
      updatedAt: now,
    });
    const categoryId = await ctx.db.insert("menuCategories", {
      restaurantId,
      name: "Mains",
      sortOrder: 0,
      isActive: true,
      createdAt: now,
    });
    const menuItemId = await ctx.db.insert("menuItems", {
      restaurantId,
      categoryId,
      name: "Test Dish",
      price: 1200,
      isAvailable: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    const customerId = await ctx.db.insert("users", {
      name: "Customer One",
      phone: "+919876543210",
      phoneVerificationTime: Date.now(),
      role: "CUSTOMER",
      isActive: true,
    });
    const anotherCustomerId = await ctx.db.insert("users", {
      name: "Customer Two",
      phone: "+919876543211",
      phoneVerificationTime: Date.now(),
      role: "CUSTOMER",
      isActive: true,
    });
    return { restaurantId, menuItemId, customerId, anotherCustomerId };
  });
}

describe("online delivery ordering", () => {
  it("allows a Super Admin to assign an employee the delivery role", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, adminId, employeeId } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Role Test Restaurant",
        slug: "role-test-restaurant",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const adminId = await ctx.db.insert("users", {
        role: "SUPER_ADMIN",
        isActive: true,
      });
      const employeeId = await ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId,
        isActive: true,
      });
      return { restaurantId, adminId, employeeId };
    });

    await t
      .withIdentity({ subject: adminId })
      .mutation(api.admin.assignUserRole, {
        userId: employeeId,
        role: "DELIVERY_PERSON",
        restaurantId,
      });
    await expect(
      t.run((ctx) => ctx.db.get("users", employeeId)),
    ).resolves.toMatchObject({
      role: "DELIVERY_PERSON",
      restaurantId,
    });
  });

  it("applies the Super Admin delivery override ahead of the manager setting", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId } = await seedOnlineRestaurant(t);
    const adminId = await t.run((ctx) =>
      ctx.db.insert("users", {
        role: "SUPER_ADMIN",
        isActive: true,
      }),
    );
    await t.run((ctx) =>
      ctx.db.insert("featureFlags", {
        restaurantId,
        key: "online_ordering",
        enabled: false,
        updatedAt: new Date().toISOString(),
      }),
    );
    const admin = t.withIdentity({ subject: adminId });

    await admin.mutation(api.restaurants.setDeliveryOverride, {
      restaurantId,
      enabled: true,
    });
    await expect(
      t.query(api.menu.getOnlineMenu, { slug: "test-restaurant" }),
    ).resolves.not.toBeNull();
    await expect(
      t.mutation(api.orders.createDeliveryOrder, {
        restaurantId,
        deliveryAddress: {
          name: "Guest Customer",
          phone: "+919876543210",
          street: "1 Main Street",
          area: "Central",
          city: "Delhi",
          pincode: "110001",
        },
        paymentMethod: "COD",
        items: [{ menuItemId, quantity: 1 }],
      }),
    ).resolves.toMatchObject({ orderId: expect.any(String) });

    await admin.mutation(api.restaurants.setDeliveryOverride, {
      restaurantId,
      enabled: false,
    });
    await expect(
      t.query(api.menu.getOnlineMenu, { slug: "test-restaurant" }),
    ).resolves.toBeNull();
    await expect(
      t.mutation(api.orders.createDeliveryOrder, {
        restaurantId,
        deliveryAddress: {
          name: "Guest Customer",
          phone: "+919876543210",
          street: "1 Main Street",
          area: "Central",
          city: "Delhi",
          pincode: "110001",
        },
        paymentMethod: "COD",
        items: [{ menuItemId, quantity: 1 }],
      }),
    ).rejects.toThrow(/unavailable/i);

    await admin.mutation(api.restaurants.setDeliveryOverride, {
      restaurantId,
      enabled: null,
    });
    await expect(
      t.query(api.menu.getOnlineMenu, { slug: "test-restaurant" }),
    ).resolves.toBeNull();
  });

  it("allows guest checkout without authentication and rejects guest online payment", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId } = await seedOnlineRestaurant(t);
    const deliveryAddress = {
      name: "Guest Customer",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    };
    const checkout = await t.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      deliveryAddress,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    const order = await t.run((ctx) => ctx.db.get("orders", checkout.orderId));
    expect(order).toMatchObject({
      orderType: "DELIVERY",
      status: "PENDING",
      deliveryAddress,
      paymentStatus: "UNPAID",
    });
    expect(order).not.toHaveProperty("customerUserId");

    await expect(
      t.mutation(api.orders.createDeliveryOrder, {
        restaurantId,
        deliveryAddress,
        paymentMethod: "ONLINE",
        items: [{ menuItemId, quantity: 1 }],
      }),
    ).rejects.toThrow(/signed-in customer account/i);
  });

  it("notifies managers of new COD deliveries and restricts cancellation to managers", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId } = await seedOnlineRestaurant(t);
    const { managerId, staffId } = await t.run(async (ctx) => {
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      });
      const staffId = await ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId,
        isActive: true,
      });
      return { managerId, staffId };
    });
    const checkout = await t.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      deliveryAddress: {
        name: "Guest Customer",
        phone: "+919876543210",
        street: "1 Main Street",
        area: "Central",
        city: "Delhi",
        pincode: "110001",
      },
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    const manager = t.withIdentity({ subject: managerId });
    const notifications = await manager.query(
      api.waiterRequests.listRecentCustomerActions,
      { restaurantId },
    );
    expect(notifications).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "ORDER_PLACED",
          orderId: checkout.orderId,
          tableDisplayName: `Home delivery · #${checkout.orderId.slice(-5).toUpperCase()}`,
        }),
      ]),
    );

    await expect(
      t.withIdentity({ subject: staffId }).mutation(api.orders.updateStatus, {
        orderId: checkout.orderId,
        restaurantId,
        status: "CANCELLED",
      }),
    ).rejects.toThrow(/only a manager/i);
    await manager.mutation(api.orders.updateStatus, {
      orderId: checkout.orderId,
      restaurantId,
      status: "CANCELLED",
    });
    await expect(
      t.run((ctx) => ctx.db.get("orders", checkout.orderId)),
    ).resolves.toMatchObject({
      status: "CANCELLED",
      cancelReason: "Cancelled by restaurant manager",
    });
  });

  it("calculates delivery totals from server menu and settings and scopes order history", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId, customerId, anotherCustomerId } =
      await seedOnlineRestaurant(t);
    const asCustomer = t.withIdentity({ subject: customerId });
    const addressId = await asCustomer.mutation(api.customers.addAddress, {
      name: "Customer One",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    });

    const checkout = await asCustomer.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      addressId,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 2 }],
    });

    expect(checkout).toEqual({
      orderId: expect.any(String),
      trackingToken: expect.stringMatching(/^[0-9a-f]{64}$/),
      subtotal: 2400,
      tax: 230,
      deliveryCharge: 300,
      discount: 100,
      total: 2830,
    });
    const storedOrder = await t.run((ctx) =>
      ctx.db.get("orders", checkout.orderId),
    );
    expect(storedOrder).toMatchObject({
      orderType: "DELIVERY",
      status: "PENDING",
      subtotal: 2400,
      total: 2830,
      items: [{ price: 1200, quantity: 2 }],
      deliveryAddress: {
        city: "Delhi",
        pincode: "110001",
      },
    });
    expect(storedOrder).not.toHaveProperty("sessionId");
    expect(storedOrder).not.toHaveProperty("tableId");
    expect(storedOrder?.deliveryTrackingTokenHash).toEqual(expect.any(String));
    expect(storedOrder?.deliveryTrackingTokenHash).not.toBe(
      checkout.trackingToken,
    );
    await expect(
      asCustomer.query(api.orders.listMyDeliveryOrders, {}),
    ).resolves.toHaveLength(1);
    await expect(
      t
        .withIdentity({ subject: anotherCustomerId })
        .query(api.orders.listMyDeliveryOrders, {}),
    ).resolves.toEqual([]);
  });

  it("rejects foreign addresses and customer attempts to change order status", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId, customerId, anotherCustomerId } =
      await seedOnlineRestaurant(t);
    const customer = t.withIdentity({ subject: customerId });
    const addressId = await customer.mutation(api.customers.addAddress, {
      name: "Customer One",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    });
    const otherCustomer = t.withIdentity({ subject: anotherCustomerId });

    await expect(
      otherCustomer.mutation(api.orders.createDeliveryOrder, {
        restaurantId,
        addressId,
        paymentMethod: "COD",
        items: [{ menuItemId, quantity: 1 }],
      }),
    ).rejects.toThrow(/address/i);

    const order = await customer.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      addressId,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    await expect(
      customer.mutation(api.orders.updateStatus, {
        orderId: order.orderId,
        restaurantId,
        status: "DELIVERED",
      }),
    ).rejects.toThrow(/restaurant access/i);
    await expect(
      otherCustomer.mutation(api.customers.updateAddress, {
        addressId,
        name: "Stolen",
        phone: "+919876543210",
        street: "2 Wrong Street",
        area: "Central",
        city: "Delhi",
        pincode: "110001",
      }),
    ).rejects.toThrow(/address not found/i);
  });

  it("cancels unpaid guest delivery orders with the tracking token and permits a separate new order", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId } = await seedOnlineRestaurant(t);
    const deliveryAddress = {
      name: "Guest Customer",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    };
    const firstOrder = await t.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      deliveryAddress,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("orders", firstOrder.orderId, {
        status: "CONFIRMED",
        deliveryPinHash: "hashed-pin",
        deliveryPinCiphertext: "encrypted-pin",
        deliveryPinExpiresAt: Date.now() + 60_000,
      });

    });

    await expect(
      t.mutation(api.orders.cancelDeliveryOrder, {
        orderId: firstOrder.orderId,
        trackingToken: "0".repeat(64),
      }),
    ).rejects.toThrow(/tracking link is invalid/i);
    await expect(
      t.mutation(api.orders.cancelDeliveryOrder, {
        orderId: firstOrder.orderId,
        trackingToken: firstOrder.trackingToken,
      }),
    ).resolves.toBeNull();
    const cancelledOrder = await t.run((ctx) =>
      ctx.db.get("orders", firstOrder.orderId),
    );
    expect(cancelledOrder).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Cancelled by customer",
    });
    expect(cancelledOrder).not.toHaveProperty("deliveryPinHash");
    expect(cancelledOrder).not.toHaveProperty("deliveryPinCiphertext");
    await expect(
      t.query(api.orders.getDeliveryTracking, {
        orderId: firstOrder.orderId,
        trackingToken: firstOrder.trackingToken,
      }),
    ).resolves.toMatchObject({
      status: "CANCELLED",
      canCancel: false,
      deliveryPin: null,
    });

    const secondOrder = await t.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      deliveryAddress,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 2 }],
    });
    expect(secondOrder.orderId).not.toBe(firstOrder.orderId);
    await expect(
      t.run((ctx) => ctx.db.get("orders", secondOrder.orderId)),
    ).resolves.toMatchObject({ status: "PENDING", items: [{ quantity: 2 }] });
  });

  it("does not allow cancellation while an online payment is pending", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId, customerId } =
      await seedOnlineRestaurant(t);
    const customer = t.withIdentity({ subject: customerId });
    const addressId = await customer.mutation(api.customers.addAddress, {
      name: "Customer One",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    });
    const checkout = await customer.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      addressId,
      paymentMethod: "ONLINE",
      items: [{ menuItemId, quantity: 1 }],
    });
    await expect(
      t.mutation(api.orders.cancelDeliveryOrder, {
        orderId: checkout.orderId,
        trackingToken: checkout.trackingToken,
      }),
    ).rejects.toThrow(/pending online payment/i);
  });

  it("lets managers hide delivered home delivery orders without deleting report data", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId } = await seedOnlineRestaurant(t);
    const managerId = await t.run((ctx) =>
      ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      }),
    );
    const checkout = await t.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      deliveryAddress: {
        name: "Guest Customer",
        phone: "+919876543210",
        street: "1 Main Street",
        area: "Central",
        city: "Delhi",
        pincode: "110001",
      },
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    await t.run(async (ctx) => {
      await ctx.db.patch("orders", checkout.orderId, {
        status: "DELIVERED",
        deliveredAt: new Date().toISOString(),
      });
    });

    const manager = t.withIdentity({ subject: managerId });
    await expect(
      manager.mutation(api.orders.clearCompletedDeliveryHistory, {
        restaurantId,
        orderIds: [checkout.orderId],
      }),
    ).resolves.toBe(1);
    await expect(
      manager.query(api.orders.listActiveForRestaurant, { restaurantId }),
    ).resolves.toEqual([]);
    await expect(
      t.run((ctx) => ctx.db.get("orders", checkout.orderId)),
    ).resolves.toMatchObject({
      status: "DELIVERED",
      hiddenFromOrdersAt: expect.any(String),
    });
    await expect(
      manager.query(api.reports.topMenuItems, {
        restaurantId,
        limit: 8,
        orderType: "DELIVERY",
      }),
    ).resolves.toEqual([
      { name: "Test Dish", count: 1, revenue: 1200 },
    ]);
  });

  it("separates dine-in and delivery report metrics", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId } = await seedOnlineRestaurant(t);
    const now = new Date().toISOString();
    const today = now.slice(0, 10);
    const managerId = await t.run(async (ctx) => {
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      });
      const tableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "report-test-table",
        createdAt: now,
      });
      const sessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "CLOSED",
        customerCount: 1,
        openedAt: now,
        closedAt: now,
      });
      await ctx.db.insert("orders", {
        restaurantId,
        sessionId,
        tableId,
        orderType: "DINE_IN",
        status: "READY",
        items: [{ menuItemId, name: "Dine-in dish", price: 1000, quantity: 2 }],
        subtotal: 2000,
        total: 2000,
        placedAt: `${today}T10:00:00.000Z`,
      });
      const deliveryOrderId = await ctx.db.insert("orders", {
        restaurantId,
        orderType: "DELIVERY",
        status: "DELIVERED",
        items: [
          { menuItemId, name: "Delivery dish", price: 1500, quantity: 1 },
        ],
        subtotal: 1500,
        total: 1500,
        placedAt: `${today}T11:00:00.000Z`,
        deliveredAt: `${today}T11:30:00.000Z`,
      });
      await ctx.db.insert("payments", {
        restaurantId,
        sessionId,
        amount: 2000,
        method: "CASH",
        status: "PAID",
        initiatedAt: now,
        completedAt: now,
      });
      await ctx.db.insert("payments", {
        restaurantId,
        orderId: deliveryOrderId,
        amount: 1500,
        method: "UPI",
        status: "PAID",
        initiatedAt: now,
        completedAt: now,
      });
      return managerId;
    });
    const manager = t.withIdentity({ subject: managerId });

    await expect(
      manager.query(api.reports.topMenuItems, {
        restaurantId,
        limit: 8,
        orderType: "DINE_IN",
      }),
    ).resolves.toEqual([
      { name: "Dine-in dish", count: 2, revenue: 2000 },
    ]);
    await expect(
      manager.query(api.reports.topMenuItems, {
        restaurantId,
        limit: 8,
        orderType: "DELIVERY",
      }),
    ).resolves.toEqual([
      { name: "Delivery dish", count: 1, revenue: 1500 },
    ]);
    const dineInRevenue = await manager.query(api.reports.dailyRevenue, {
      restaurantId,
      days: 7,
      orderType: "DINE_IN",
    });
    const deliveryRevenue = await manager.query(api.reports.dailyRevenue, {
      restaurantId,
      days: 7,
      orderType: "DELIVERY",
    });
    expect(dineInRevenue.find((day) => day.date === today)?.revenue).toBe(2000);
    expect(deliveryRevenue.find((day) => day.date === today)?.revenue).toBe(
      1500,
    );
  });

  it("reveals the PIN only through the tracking token and permits assigned-person verification once", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId, customerId } =
      await seedOnlineRestaurant(t);
    const { managerId, deliveryPersonId, otherStaffId } = await t.run(
      async (ctx) => {
        const managerId = await ctx.db.insert("users", {
          name: "Restaurant Manager",
          role: "RESTAURANT_MANAGER",
          restaurantId,
          isActive: true,
        });
        const deliveryPersonId = await ctx.db.insert("users", {
          name: "Assigned Driver",
          role: "DELIVERY_PERSON",
          restaurantId,
          isActive: true,
        });
        const otherStaffId = await ctx.db.insert("users", {
          name: "Other Staff",
          role: "RESTAURANT_STAFF",
          restaurantId,
          isActive: true,
        });
        return { managerId, deliveryPersonId, otherStaffId };
      },
    );
    const customer = t.withIdentity({ subject: customerId });
    const addressId = await customer.mutation(api.customers.addAddress, {
      name: "Customer One",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    });
    const checkout = await customer.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      addressId,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    const manager = t.withIdentity({ subject: managerId });
    const deliveryPerson = t.withIdentity({ subject: deliveryPersonId });

    await manager.mutation(api.orders.assignDeliveryPerson, {
      orderId: checkout.orderId,
      restaurantId,
      deliveryPersonId,
    });
    await expect(
      deliveryPerson.query(api.orders.listAssignedDeliveries, {}),
    ).resolves.toHaveLength(1);
    await expect(
      deliveryPerson.query(api.orders.listActiveForRestaurant, {
        restaurantId,
      }),
    ).rejects.toThrow();
    await manager.mutation(api.orders.updateStatus, {
      orderId: checkout.orderId,
      restaurantId,
      status: "CONFIRMED",
    });
    const tracking = await customer.query(api.orders.getDeliveryTracking, {
      orderId: checkout.orderId,
      trackingToken: checkout.trackingToken,
    });
    expect(tracking?.deliveryPin).toMatch(/^\d{4}$/);
    await expect(
      customer.query(api.orders.getDeliveryTracking, {
        orderId: checkout.orderId,
        trackingToken: "0".repeat(64),
      }),
    ).resolves.toBeNull();

    const dashboardOrders = await manager.query(
      api.orders.listActiveForRestaurant,
      { restaurantId },
    );
    const dashboardOrder = dashboardOrders.find(
      (order) => order._id === checkout.orderId,
    );
    expect(dashboardOrder).toBeDefined();
    expect(dashboardOrder).not.toHaveProperty("deliveryTrackingTokenHash");
    expect(dashboardOrder).not.toHaveProperty("deliveryPinHash");
    expect(dashboardOrder).not.toHaveProperty("deliveryPinCiphertext");

    for (const status of ["PREPARING", "READY", "OUT_FOR_DELIVERY"] as const) {
      await manager.mutation(api.orders.updateStatus, {
        orderId: checkout.orderId,
        restaurantId,
        status,
      });
    }

    await expect(
      t
        .withIdentity({ subject: otherStaffId })
        .mutation(api.orders.verifyDeliveryPin, {
          orderId: checkout.orderId,
          pin: tracking!.deliveryPin!,
        }),
    ).rejects.toThrow(/assigned delivery person/i);
    await expect(
      manager.mutation(api.orders.updateStatus, {
        orderId: checkout.orderId,
        restaurantId,
        status: "DELIVERED",
      }),
    ).rejects.toThrow(/assigned delivery person/i);

    await expect(
      deliveryPerson.mutation(api.orders.verifyDeliveryPin, {
        orderId: checkout.orderId,
        pin: tracking!.deliveryPin!,
      }),
    ).resolves.toMatchObject({ success: true });

    const deliveredOrder = await t.run((ctx) =>
      ctx.db.get("orders", checkout.orderId),
    );
    expect(deliveredOrder).toMatchObject({
      status: "DELIVERED",
      deliveredBy: deliveryPersonId,
      deliveryConfirmedAt: expect.any(String),
    });
    expect(deliveredOrder).not.toHaveProperty("deliveryPinHash");
    expect(deliveredOrder).not.toHaveProperty("deliveryPinCiphertext");
    await expect(
      deliveryPerson.mutation(api.orders.verifyDeliveryPin, {
        orderId: checkout.orderId,
        pin: tracking!.deliveryPin!,
      }),
    ).rejects.toThrow(/not currently out for delivery/i);
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("deliveryHandoverAudits")
          .withIndex("by_order", (q) => q.eq("orderId", checkout.orderId))
          .collect(),
      ),
    ).resolves.toHaveLength(1);

    const cancelledCheckout = await customer.mutation(
      api.orders.createDeliveryOrder,
      {
        restaurantId,
        addressId,
        paymentMethod: "COD",
        items: [{ menuItemId, quantity: 1 }],
      },
    );
    await manager.mutation(api.orders.assignDeliveryPerson, {
      orderId: cancelledCheckout.orderId,
      restaurantId,
      deliveryPersonId,
    });
    await manager.mutation(api.orders.updateStatus, {
      orderId: cancelledCheckout.orderId,
      restaurantId,
      status: "CONFIRMED",
    });
    await manager.mutation(api.orders.updateStatus, {
      orderId: cancelledCheckout.orderId,
      restaurantId,
      status: "CANCELLED",
    });
    const cancelledOrder = await t.run((ctx) =>
      ctx.db.get("orders", cancelledCheckout.orderId),
    );
    expect(cancelledOrder).not.toHaveProperty("deliveryPinHash");
    expect(cancelledOrder).not.toHaveProperty("deliveryPinCiphertext");
  });

  it("locks PIN verification after five failures and alerts the manager", async () => {
    const t = convexTest(schema, modules);
    const { restaurantId, menuItemId, customerId } =
      await seedOnlineRestaurant(t);
    const { managerId, deliveryPersonId } = await t.run(async (ctx) => {
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      });
      const deliveryPersonId = await ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId,
        isActive: true,
      });
      return { managerId, deliveryPersonId };
    });
    const customer = t.withIdentity({ subject: customerId });
    const addressId = await customer.mutation(api.customers.addAddress, {
      name: "Customer One",
      phone: "+919876543210",
      street: "1 Main Street",
      area: "Central",
      city: "Delhi",
      pincode: "110001",
    });
    const checkout = await customer.mutation(api.orders.createDeliveryOrder, {
      restaurantId,
      addressId,
      paymentMethod: "COD",
      items: [{ menuItemId, quantity: 1 }],
    });
    const manager = t.withIdentity({ subject: managerId });
    const deliveryPerson = t.withIdentity({ subject: deliveryPersonId });
    await manager.mutation(api.orders.assignDeliveryPerson, {
      orderId: checkout.orderId,
      restaurantId,
      deliveryPersonId,
    });
    for (const status of [
      "CONFIRMED",
      "PREPARING",
      "READY",
      "OUT_FOR_DELIVERY",
    ] as const) {
      await manager.mutation(api.orders.updateStatus, {
        orderId: checkout.orderId,
        restaurantId,
        status,
      });
    }

    const tracking = await customer.query(api.orders.getDeliveryTracking, {
      orderId: checkout.orderId,
      trackingToken: checkout.trackingToken,
    });
    expect(tracking?.deliveryPin).toMatch(/^\d{4}$/);
    const wrongPin = tracking?.deliveryPin === "0000" ? "0001" : "0000";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await deliveryPerson.mutation(
        api.orders.verifyDeliveryPin,
        { orderId: checkout.orderId, pin: wrongPin },
      );
      expect(result.success).toBe(false);
    }
    await expect(
      deliveryPerson.mutation(api.orders.verifyDeliveryPin, {
        orderId: checkout.orderId,
        pin: wrongPin,
      }),
    ).resolves.toMatchObject({
      success: false,
      remainingAttempts: 0,
      lockedUntil: expect.any(Number),
    });
    await expect(
      manager.query(api.orders.listDeliverySecurityAlerts, { restaurantId }),
    ).resolves.toHaveLength(1);

    await t.run(async (ctx) => {
      await ctx.db.patch("orders", checkout.orderId, {
        deliveryPinExpiresAt: Date.now() - 1,
      });
    });
    await expect(
      deliveryPerson.mutation(api.orders.verifyDeliveryPin, {
        orderId: checkout.orderId,
        pin: wrongPin,
      }),
    ).resolves.toMatchObject({ expired: true, success: false });
    const expiredOrder = await t.run((ctx) =>
      ctx.db.get("orders", checkout.orderId),
    );
    expect(expiredOrder).not.toHaveProperty("deliveryPinHash");
    expect(expiredOrder).not.toHaveProperty("deliveryPinCiphertext");
  });
});
