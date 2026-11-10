import { internalMutation, mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  requireCustomer,
  requireRestaurantAccess,
  requireRestaurantManager,
  requireUser,
} from "./lib/auth";
import { recordCustomerAction } from "./lib/staffNotifications";
import {
  closeSessionIfAllOrdersCancelled,
  closeSessionWhenSettled,
} from "./lib/sessionLifecycle";
import {
  isTableSessionHost,
  requireTableSessionHost,
} from "./lib/tableSessionAccess";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  createDeliveryPin,
  decryptDeliveryPin,
  generateDeliveryTrackingToken,
  hashDeliveryTrackingToken,
  matchesDeliveryPin,
} from "./lib/deliveryPin";
import schema from "./schema";

const orderStatusValidator = v.union(
  v.literal("PENDING"),
  v.literal("CONFIRMED"),
  v.literal("PREPARING"),
  v.literal("READY"),
  v.literal("OUT_FOR_DELIVERY"),
  v.literal("DELIVERED"),
  v.literal("CANCELLED"),
);

const deliveryLineValidator = v.object({
  menuItemId: v.id("menuItems"),
  quantity: v.number(),
  notes: v.optional(v.string()),
});

const deliveryAddressValidator = v.object({
  name: v.string(),
  phone: v.string(),
  street: v.string(),
  area: v.string(),
  city: v.string(),
  pincode: v.string(),
});

const savedOrderItemValidator = v.object({
  menuItemId: v.id("menuItems"),
  name: v.string(),
  price: v.number(),
  quantity: v.number(),
  notes: v.optional(v.string()),
});

const customerOrderValidator = v.object({
  _id: v.id("orders"),
  _creationTime: v.number(),
  restaurantName: v.string(),
  restaurantSlug: v.string(),
  currency: v.string(),
  orderType: v.literal("DELIVERY"),
  status: orderStatusValidator,
  paymentStatus: v.optional(
    v.union(
      v.literal("UNPAID"),
      v.literal("PENDING"),
      v.literal("PAID"),
      v.literal("FAILED"),
    ),
  ),
  deliveryPaymentMethod: v.optional(
    v.union(v.literal("ONLINE"), v.literal("COD")),
  ),
  items: v.array(savedOrderItemValidator),
  subtotal: v.number(),
  tax: v.optional(v.number()),
  deliveryCharge: v.optional(v.number()),
  discount: v.optional(v.number()),
  total: v.number(),
  placedAt: v.string(),
  deliveryAddress: v.optional(
    v.object({
      name: v.string(),
      phone: v.string(),
      street: v.string(),
      area: v.string(),
      city: v.string(),
      pincode: v.string(),
    }),
  ),
});

/** Place an order from the current cart (clears cart after) */
export const placeOrder = mutation({
  args: {
    sessionId: v.id("sessions"),
    customerId: v.string(),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.status !== "ACTIVE") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }
    await requireTableSessionHost(ctx, session, args.customerId);

    const cartItems = (
      await ctx.db
        .query("cartItems")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect()
    ).filter((item) => item.addedBy === args.customerId);

    if (cartItems.length === 0) {
      throw new ConvexError({ message: "Cart is empty", code: "BAD_REQUEST" });
    }

    // Snapshot menu items at time of order
    const orderItems = await Promise.all(
      cartItems.map(async (ci) => {
        const menuItem = await ctx.db.get("menuItems", ci.menuItemId);
        if (
          !menuItem ||
          !menuItem.isAvailable ||
          menuItem.restaurantId !== session.restaurantId
        ) {
          throw new ConvexError({
            message: "A menu item is no longer available",
            code: "BAD_REQUEST",
          });
        }
        return {
          menuItemId: ci.menuItemId,
          name: menuItem.name,
          price: menuItem.price,
          quantity: ci.quantity,
          notes: ci.notes,
        };
      }),
    );

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const now = new Date().toISOString();
    const orderId = await ctx.db.insert("orders", {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      orderType: "DINE_IN",
      status: "PENDING",
      customerId: args.customerId,
      items: orderItems,
      subtotal,
      total: subtotal,
      placedAt: now,
    });
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      orderId,
      eventType: "ORDER_PLACED",
      message: `New order: ${orderItems.length} item type${orderItems.length === 1 ? "" : "s"}.`,
    });

    // Clear cart after placing order
    for (const item of cartItems) {
      await ctx.db.delete("cartItems", item._id);
    }

    // Update session totalAmount
    const currentTotal = session.totalAmount ?? 0;
    await ctx.db.patch("sessions", args.sessionId, {
      totalAmount: currentTotal + subtotal,
    });

    return orderId;
  },
});

/** Customer cancellation is allowed until preparation begins. */
export const cancelOrder = mutation({
  args: {
    orderId: v.id("orders"),
    customerId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order)
      throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    if (!order.sessionId || !order.tableId || order.orderType === "DELIVERY") {
      throw new ConvexError({
        message: "This order cannot be cancelled from the table ordering flow.",
        code: "FORBIDDEN",
      });
    }
    const session = await ctx.db.get("sessions", order.sessionId);
    if (!session) {
      throw new ConvexError({
        message: "The table session for this order no longer exists.",
        code: "NOT_FOUND",
      });
    }
    await requireTableSessionHost(ctx, session, args.customerId);
    if (order.customerId !== args.customerId) {
      throw new ConvexError({
        message: "This order belongs to another customer",
        code: "FORBIDDEN",
      });
    }

    if (
      order.status === "PREPARING" ||
      order.status === "READY" ||
      order.status === "DELIVERED" ||
      order.status === "CANCELLED"
    ) {
      throw new ConvexError({
        message: "Cannot cancel — order is already being prepared or completed",
        code: "BAD_REQUEST",
      });
    }

    if ((session?.paidAmount ?? 0) > 0) {
      throw new ConvexError({
        message:
          "This order cannot be cancelled after payment has been recorded",
        code: "BAD_REQUEST",
      });
    }

    const now = new Date().toISOString();
    await ctx.db.patch("orders", args.orderId, {
      status: "CANCELLED",
      cancelledAt: now,
      cancelledBy: args.customerId,
      cancelReason: args.reason,
    });

    // Subtract from session totalAmount
    if (session) {
      const newTotal = Math.max(0, (session.totalAmount ?? 0) - order.total);
      await ctx.db.patch("sessions", order.sessionId, {
        totalAmount: newTotal,
      });
      await recordCustomerAction(ctx, {
        restaurantId: order.restaurantId,
        sessionId: order.sessionId,
        tableId: order.tableId,
        orderId: order._id,
        eventType: "ORDER_CANCELLED",
        message: `Customer cancelled order #${order._id.slice(-5).toUpperCase()}.`,
      });
      await closeSessionIfAllOrdersCancelled(ctx, order.sessionId);
    }
    return null;
  },
});

/** Get all orders for a session (realtime) */
export const listBySession = query({
  args: { sessionId: v.id("sessions"), customerId: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("orders"),
      _creationTime: v.number(),
      status: orderStatusValidator,
      customerId: v.optional(v.string()),
      items: v.array(savedOrderItemValidator),
      total: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (
      !session ||
      !(await isTableSessionHost(ctx, session, args.customerId))
    ) {
      return [];
    }
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
    return orders
      .filter((order) => order.customerId === args.customerId)
      .map((order) => ({
        _id: order._id,
        _creationTime: order._creationTime,
        status: order.status,
        customerId: order.customerId,
        items: order.items,
        total: order.total,
      }));
  },
});

/** Manager: update order status */
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    restaurantId: v.id("restaurants"),
    status: v.union(
      v.literal("CONFIRMED"),
      v.literal("PREPARING"),
      v.literal("READY"),
      v.literal("OUT_FOR_DELIVERY"),
      v.literal("DELIVERED"),
      v.literal("CANCELLED"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);
    if (user.role === "DELIVERY_PERSON") {
      throw new ConvexError({
        message: "Delivery personnel cannot change order statuses.",
        code: "FORBIDDEN",
      });
    }
    const order = await ctx.db.get("orders", args.orderId);
    if (!order || order.restaurantId !== args.restaurantId) {
      throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    }
    if (
      args.status === "CANCELLED" &&
      user.role !== "RESTAURANT_MANAGER" &&
      user.role !== "SUPER_ADMIN" &&
      !(user.role === "RESTAURANT_STAFF" && order.orderType === "DINE_IN")
    ) {
      throw new ConvexError({
        message:
          "Only a manager can cancel delivery orders; staff can cancel dine-in orders.",
        code: "FORBIDDEN",
      });
    }
    if (args.status === "OUT_FOR_DELIVERY" && order.orderType !== "DELIVERY") {
      throw new ConvexError({
        message: "Only delivery orders can go out for delivery.",
        code: "BAD_REQUEST",
      });
    }
    if (order.orderType === "DELIVERY" && args.status === "DELIVERED") {
      throw new ConvexError({
        message:
          "Delivery orders can only be completed by the assigned delivery person using the customer PIN.",
        code: "FORBIDDEN",
      });
    }
    if (
      args.status === "CANCELLED" &&
      (order.status === "OUT_FOR_DELIVERY" ||
        order.status === "DELIVERED" ||
        order.status === "CANCELLED")
    ) {
      throw new ConvexError({
        message: "This order can no longer be cancelled.",
        code: "BAD_REQUEST",
      });
    }
    if (
      args.status === "CANCELLED" &&
      (order.paymentStatus === "PAID" ||
        (order.orderType === "DELIVERY" &&
          order.deliveryPaymentMethod === "ONLINE" &&
          order.paymentStatus === "PENDING"))
    ) {
      throw new ConvexError({
        message:
          "This order has a paid or pending online payment and cannot be cancelled here.",
        code: "BAD_REQUEST",
      });
    }
    const cancellationSession =
      args.status === "CANCELLED" && order.sessionId
        ? await ctx.db.get("sessions", order.sessionId)
        : null;
    if ((cancellationSession?.paidAmount ?? 0) > 0) {
      throw new ConvexError({
        message: "This order cannot be cancelled after payment is recorded.",
        code: "BAD_REQUEST",
      });
    }
    if (
      order.orderType === "DELIVERY" &&
      args.status === "OUT_FOR_DELIVERY" &&
      !order.deliveryPersonId
    ) {
      throw new ConvexError({
        message: "Assign a delivery person before dispatching this order.",
        code: "BAD_REQUEST",
      });
    }
    if (
      order.orderType === "DELIVERY" &&
      args.status === "CONFIRMED" &&
      order.status !== "PENDING"
    ) {
      throw new ConvexError({
        message: "Only a pending delivery order can be confirmed.",
        code: "BAD_REQUEST",
      });
    }
    if (order.orderType === "DELIVERY" && args.status !== "CANCELLED") {
      const expectedPreviousStatus = {
        CONFIRMED: "PENDING",
        PREPARING: "CONFIRMED",
        READY: "PREPARING",
        OUT_FOR_DELIVERY: "READY",
      } as const;
      if (
        args.status !== "DELIVERED" &&
        order.status !== expectedPreviousStatus[args.status]
      ) {
        throw new ConvexError({
          message: "Move this delivery through its required order stages.",
          code: "BAD_REQUEST",
        });
      }
    }

    const now = new Date().toISOString();
    const patch: Partial<Doc<"orders">> = { status: args.status };
    if (args.status === "CONFIRMED") patch.confirmedAt = now;
    if (args.status === "PREPARING") patch.preparingAt = now;
    if (args.status === "READY") patch.readyAt = now;
    if (args.status === "OUT_FOR_DELIVERY") patch.outForDeliveryAt = now;
    if (args.status === "DELIVERED") patch.deliveredAt = now;
    if (args.status === "CANCELLED") {
      patch.cancelledAt = now;
      patch.cancelledBy = user._id.toString();
      patch.cancelReason = "Cancelled by restaurant manager";
      patch.deliveryPinHash = undefined;
      patch.deliveryPinCiphertext = undefined;
      patch.deliveryPinExpiresAt = undefined;
      patch.deliveryPinFailedAttempts = undefined;
      patch.deliveryPinLockedUntil = undefined;
    }

    if (order.orderType === "DELIVERY" && args.status === "CONFIRMED") {
      const configuredTtl = Number(
        process.env.DELIVERY_PIN_TTL_MINUTES ?? "1440",
      );
      if (
        !Number.isInteger(configuredTtl) ||
        configuredTtl < 5 ||
        configuredTtl > 10_080
      ) {
        throw new ConvexError({
          message:
            "Delivery PIN timeout configuration must be between 5 minutes and 7 days.",
          code: "INTERNAL",
        });
      }
      const { pinHash, pinCiphertext } = await createDeliveryPin(order._id);
      const expiresAt = Date.now() + configuredTtl * 60_000;
      patch.deliveryPinHash = pinHash;
      patch.deliveryPinCiphertext = pinCiphertext;
      patch.deliveryPinExpiresAt = expiresAt;
      patch.deliveryPinFailedAttempts = 0;
      patch.deliveryPinLockedUntil = undefined;
      await ctx.scheduler.runAt(expiresAt, internal.orders.expireDeliveryPin, {
        orderId: order._id,
        pinHash,
      });
    }

    await ctx.db.patch("orders", args.orderId, patch);
    if (cancellationSession) {
      await ctx.db.patch("sessions", cancellationSession._id, {
        totalAmount: Math.max(
          0,
          (cancellationSession.totalAmount ?? 0) - order.total,
        ),
      });
      await closeSessionIfAllOrdersCancelled(ctx, cancellationSession._id);
    }
    if (args.status === "DELIVERED" && order.sessionId) {
      await closeSessionWhenSettled(ctx, order.sessionId, user._id);
    }
    return null;
  },
});

export const listDeliveryPeople = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    v.object({
      _id: v.id("users"),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const users = (
      await Promise.all(
        (["RESTAURANT_STAFF", "DELIVERY_PERSON"] as const).map((role) =>
          ctx.db
            .query("users")
            .withIndex("by_role_and_restaurant", (q) =>
              q.eq("role", role).eq("restaurantId", args.restaurantId),
            )
            .take(100),
        ),
      )
    ).flat();
    return users
      .filter((user) => user.isActive !== false)
      .map((user) => ({
        _id: user._id,
        name: user.name ?? null,
        email: user.email ?? null,
      }));
  },
});

export const assignDeliveryPerson = mutation({
  args: {
    orderId: v.id("orders"),
    restaurantId: v.id("restaurants"),
    deliveryPersonId: v.union(v.id("users"), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.restaurantId !== args.restaurantId ||
      order.orderType !== "DELIVERY"
    ) {
      throw new ConvexError({
        message: "Delivery order not found.",
        code: "NOT_FOUND",
      });
    }
    if (order.status === "DELIVERED" || order.status === "CANCELLED") {
      throw new ConvexError({
        message: "A completed delivery cannot be reassigned.",
        code: "BAD_REQUEST",
      });
    }

    if (args.deliveryPersonId !== null) {
      const deliveryPerson = await ctx.db.get("users", args.deliveryPersonId);
      if (
        !deliveryPerson ||
        (deliveryPerson.role !== "RESTAURANT_STAFF" &&
          deliveryPerson.role !== "DELIVERY_PERSON") ||
        deliveryPerson.restaurantId !== args.restaurantId ||
        deliveryPerson.isActive === false
      ) {
        throw new ConvexError({
          message: "Choose an active staff member from this restaurant.",
          code: "BAD_REQUEST",
        });
      }
    }

    await ctx.db.patch("orders", args.orderId, {
      deliveryPersonId: args.deliveryPersonId ?? undefined,
    });
    return null;
  },
});

/** Manager: hide completed delivery orders from the active Orders screen. */
export const clearCompletedDeliveryHistory = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    orderIds: v.array(v.id("orders")),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    if (args.orderIds.length > 100) {
      throw new ConvexError({
        message: "Clear at most 100 completed deliveries at a time.",
        code: "BAD_REQUEST",
      });
    }

    let archivedCount = 0;
    for (const orderId of new Set(args.orderIds)) {
      const order = await ctx.db.get("orders", orderId);
      if (
        !order ||
        order.restaurantId !== args.restaurantId ||
        order.orderType !== "DELIVERY" ||
        order.status !== "DELIVERED"
      ) {
        throw new ConvexError({
          message: "Only completed home delivery orders can be cleared.",
          code: "BAD_REQUEST",
        });
      }
      if (!order.hiddenFromOrdersAt) {
        await ctx.db.patch("orders", orderId, {
          hiddenFromOrdersAt: new Date().toISOString(),
        });
        archivedCount += 1;
      }
    }
    return archivedCount;
  },
});

export const listAssignedDeliveries = query({
  args: {},
  returns: v.array(
    schema
      .doc("orders")
      .omit(
        "deliveryTrackingTokenHash",
        "deliveryPinHash",
        "deliveryPinCiphertext",
        "deliveryPinExpiresAt",
        "deliveryPinFailedAttempts",
        "deliveryPinLockedUntil",
      ),
  ),
  handler: async (ctx) => {
    const user = await requireUser(ctx);
    if (user.role !== "DELIVERY_PERSON" || !user.restaurantId) {
      throw new ConvexError({
        message: "Delivery person access required.",
        code: "FORBIDDEN",
      });
    }
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_delivery_person", (q) =>
        q.eq("deliveryPersonId", user._id),
      )
      .order("desc")
      .take(100);
    return orders
      .filter(
        (order) =>
          order.restaurantId === user.restaurantId &&
          order.orderType === "DELIVERY" &&
          order.status !== "CANCELLED",
      )
      .map((order) => {
        const safeOrder = { ...order };
        delete safeOrder.deliveryTrackingTokenHash;
        delete safeOrder.deliveryPinHash;
        delete safeOrder.deliveryPinCiphertext;
        delete safeOrder.deliveryPinExpiresAt;
        delete safeOrder.deliveryPinFailedAttempts;
        delete safeOrder.deliveryPinLockedUntil;
        return safeOrder;
      });
  },
});

export const listDeliverySecurityAlerts = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    v.object({
      _id: v.id("deliverySecurityAlerts"),
      orderId: v.id("orders"),
      deliveryPersonName: v.string(),
      message: v.string(),
      createdAt: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const alerts = await ctx.db
      .query("deliverySecurityAlerts")
      .withIndex("by_restaurant_and_created_at", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .order("desc")
      .take(50);
    return await Promise.all(
      alerts.map(async (alert) => {
        const deliveryPerson = await ctx.db.get(
          "users",
          alert.deliveryPersonId,
        );
        return {
          _id: alert._id,
          orderId: alert.orderId,
          deliveryPersonName:
            deliveryPerson?.name ?? deliveryPerson?.email ?? "Delivery staff",
          message: alert.message,
          createdAt: alert.createdAt,
        };
      }),
    );
  },
});

export const getDeliveryTracking = query({
  args: {
    orderId: v.id("orders"),
    trackingToken: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("orders"),
      restaurantName: v.string(),
      restaurantSlug: v.string(),
      status: orderStatusValidator,
      items: v.array(v.object({ name: v.string(), quantity: v.number() })),
      placedAt: v.string(),
      total: v.number(),
      currency: v.string(),
      canCancel: v.boolean(),
      deliveryAddress: v.optional(
        v.object({
          name: v.string(),
          phone: v.string(),
          street: v.string(),
          area: v.string(),
          city: v.string(),
          pincode: v.string(),
        }),
      ),
      deliveryPin: v.union(v.string(), v.null()),
      deliveryPinExpiresAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    if (args.trackingToken.length < 40 || args.trackingToken.length > 100) {
      return null;
    }
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.orderType !== "DELIVERY" ||
      !order.deliveryTrackingTokenHash
    ) {
      return null;
    }
    const actualHash = await hashDeliveryTrackingToken(args.trackingToken);
    if (
      !constantTimeStringsEqual(actualHash, order.deliveryTrackingTokenHash)
    ) {
      return null;
    }

    const restaurant = await ctx.db.get("restaurants", order.restaurantId);
    const canCancel =
      (order.status === "PENDING" || order.status === "CONFIRMED") &&
      order.paymentStatus !== "PAID" &&
      !(
        order.deliveryPaymentMethod === "ONLINE" &&
        order.paymentStatus === "PENDING"
      );
    const canRevealPin =
      order.status !== "CANCELLED" &&
      order.status !== "DELIVERED" &&
      Boolean(order.deliveryPinCiphertext) &&
      Boolean(order.deliveryPinHash) &&
      Boolean(order.deliveryPinExpiresAt) &&
      order.deliveryPinExpiresAt! > Date.now();
    return {
      _id: order._id,
      restaurantName: restaurant?.name ?? "Restaurant",
      restaurantSlug: restaurant?.slug ?? "",
      status: order.status,
      items: order.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
      })),
      placedAt: order.placedAt,
      total: order.total,
      currency: restaurant?.currency ?? "INR",
      canCancel,
      deliveryAddress: order.deliveryAddress,
      deliveryPin: canRevealPin
        ? await decryptDeliveryPin(order.deliveryPinCiphertext!, order._id)
        : null,
      deliveryPinExpiresAt: canRevealPin ? order.deliveryPinExpiresAt! : null,
    };
  },
});

/** Cancel an unpaid delivery order using its private tracking credential. */
export const cancelDeliveryOrder = mutation({
  args: {
    orderId: v.id("orders"),
    trackingToken: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.trackingToken.length < 40 || args.trackingToken.length > 100) {
      throw new ConvexError({
        message: "This tracking link is invalid.",
        code: "FORBIDDEN",
      });
    }
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.orderType !== "DELIVERY" ||
      !order.deliveryTrackingTokenHash
    ) {
      throw new ConvexError({
        message: "Delivery order not found.",
        code: "NOT_FOUND",
      });
    }
    const actualHash = await hashDeliveryTrackingToken(args.trackingToken);
    if (
      !constantTimeStringsEqual(actualHash, order.deliveryTrackingTokenHash)
    ) {
      throw new ConvexError({
        message: "This tracking link is invalid.",
        code: "FORBIDDEN",
      });
    }
    if (order.status !== "PENDING" && order.status !== "CONFIRMED") {
      throw new ConvexError({
        message: "This order can no longer be cancelled.",
        code: "BAD_REQUEST",
      });
    }
    if (
      order.paymentStatus === "PAID" ||
      (order.deliveryPaymentMethod === "ONLINE" &&
        order.paymentStatus === "PENDING")
    ) {
      throw new ConvexError({
        message:
          "This order has a paid or pending online payment. Contact the restaurant for help.",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.patch("orders", order._id, {
      status: "CANCELLED",
      cancelledAt: new Date().toISOString(),
      cancelledBy: order.customerUserId?.toString() ?? "CUSTOMER",
      cancelReason: "Cancelled by customer",
      deliveryPinHash: undefined,
      deliveryPinCiphertext: undefined,
      deliveryPinExpiresAt: undefined,
      deliveryPinFailedAttempts: undefined,
      deliveryPinLockedUntil: undefined,
    });
    return null;
  },
});

export const verifyDeliveryPin = mutation({
  args: {
    orderId: v.id("orders"),
    pin: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    remainingAttempts: v.number(),
    lockedUntil: v.union(v.number(), v.null()),
    expired: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.orderType !== "DELIVERY" ||
      order.deliveryPersonId !== user._id ||
      (user.role !== "RESTAURANT_STAFF" && user.role !== "DELIVERY_PERSON") ||
      user.restaurantId !== order.restaurantId
    ) {
      throw new ConvexError({
        message: "Only the assigned delivery person can verify this order.",
        code: "FORBIDDEN",
      });
    }
    if (order.status !== "OUT_FOR_DELIVERY") {
      throw new ConvexError({
        message: "This order is not currently out for delivery.",
        code: "BAD_REQUEST",
      });
    }

    const now = Date.now();
    if (
      !order.deliveryPinHash ||
      !order.deliveryPinCiphertext ||
      !order.deliveryPinExpiresAt ||
      order.deliveryPinExpiresAt <= now
    ) {
      if (order.deliveryPinHash || order.deliveryPinCiphertext) {
        await ctx.db.patch("orders", order._id, {
          deliveryPinHash: undefined,
          deliveryPinCiphertext: undefined,
          deliveryPinExpiresAt: undefined,
          deliveryPinFailedAttempts: undefined,
          deliveryPinLockedUntil: undefined,
        });
      }
      return {
        success: false,
        remainingAttempts: 0,
        lockedUntil: null,
        expired: true,
      };
    }

    if (order.deliveryPinLockedUntil && order.deliveryPinLockedUntil > now) {
      return {
        success: false,
        remainingAttempts: 0,
        lockedUntil: order.deliveryPinLockedUntil,
        expired: false,
      };
    }

    const failedAttempts =
      order.deliveryPinLockedUntil && order.deliveryPinLockedUntil <= now
        ? 0
        : (order.deliveryPinFailedAttempts ?? 0);
    const pinMatches =
      /^\d{4}$/.test(args.pin) &&
      (await matchesDeliveryPin(order._id, args.pin, order.deliveryPinHash));
    if (!pinMatches) {
      const attempts = failedAttempts + 1;
      const lockedUntil = attempts >= 5 ? now + 15 * 60_000 : undefined;
      await ctx.db.patch("orders", order._id, {
        deliveryPinFailedAttempts: attempts,
        deliveryPinLockedUntil: lockedUntil,
      });
      if (lockedUntil) {
        await ctx.db.insert("deliverySecurityAlerts", {
          restaurantId: order.restaurantId,
          orderId: order._id,
          deliveryPersonId: user._id,
          eventType: "DELIVERY_PIN_LOCKED",
          message: `PIN verification was temporarily locked after five incorrect attempts for delivery #${order._id.slice(-5).toUpperCase()}.`,
          createdAt: new Date(now).toISOString(),
        });
        const recentAlerts = await ctx.db
          .query("deliverySecurityAlerts")
          .withIndex("by_restaurant_and_created_at", (q) =>
            q.eq("restaurantId", order.restaurantId),
          )
          .order("desc")
          .take(101);
        for (const oldAlert of recentAlerts.slice(100)) {
          await ctx.db.delete("deliverySecurityAlerts", oldAlert._id);
        }
      }
      return {
        success: false,
        remainingAttempts: Math.max(0, 5 - attempts),
        lockedUntil: lockedUntil ?? null,
        expired: false,
      };
    }

    const existingAudit = await ctx.db
      .query("deliveryHandoverAudits")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .unique();
    if (existingAudit) {
      throw new ConvexError({
        message: "Delivery has already been confirmed.",
        code: "CONFLICT",
      });
    }

    const confirmedAt = new Date(now).toISOString();
    await ctx.db.patch("orders", order._id, {
      status: "DELIVERED",
      deliveredAt: confirmedAt,
      deliveryConfirmedAt: confirmedAt,
      deliveredBy: user._id,
      deliveryPinHash: undefined,
      deliveryPinCiphertext: undefined,
      deliveryPinExpiresAt: undefined,
      deliveryPinFailedAttempts: undefined,
      deliveryPinLockedUntil: undefined,
    });
    await ctx.db.insert("deliveryHandoverAudits", {
      orderId: order._id,
      restaurantId: order.restaurantId,
      deliveryPersonId: user._id,
      confirmedAt,
    });
    return {
      success: true,
      remainingAttempts: 5,
      lockedUntil: null,
      expired: false,
    };
  },
});

export const expireDeliveryPin = internalMutation({
  args: {
    orderId: v.id("orders"),
    pinHash: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.deliveryPinHash !== args.pinHash ||
      order.status === "DELIVERED" ||
      order.status === "CANCELLED"
    ) {
      return null;
    }
    await ctx.db.patch("orders", order._id, {
      deliveryPinHash: undefined,
      deliveryPinCiphertext: undefined,
      deliveryPinExpiresAt: undefined,
      deliveryPinFailedAttempts: undefined,
      deliveryPinLockedUntil: undefined,
    });
    return null;
  },
});

function constantTimeStringsEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/** Manager: get all non-cancelled orders for active sessions */
export const listActiveForRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    schema
      .doc("orders")
      .omit(
        "deliveryTrackingTokenHash",
        "deliveryPinHash",
        "deliveryPinCiphertext",
        "deliveryPinExpiresAt",
        "deliveryPinFailedAttempts",
        "deliveryPinLockedUntil",
      )
      .extend({
        tableDisplayName: v.string(),
        sessionStatus: v.string(),
      }),
  ),
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);
    if (user.role === "DELIVERY_PERSON") {
      throw new ConvexError({
        message: "Use the assigned deliveries view.",
        code: "FORBIDDEN",
      });
    }

    const visibleOrders: Doc<"orders">[] = [];
    let cursor: string | null = null;
    let isDone = false;
    while (!isDone && visibleOrders.length < 100) {
      const page = await ctx.db
        .query("orders")
        .withIndex("by_restaurant", (q) =>
          q.eq("restaurantId", args.restaurantId),
        )
        .order("desc")
        .paginate({ numItems: 100, cursor });
      for (const order of page.page) {
        if (
          !order.hiddenFromOrdersAt &&
          (order.orderType !== "DELIVERY" ||
            order.deliveryPaymentMethod === "COD" ||
            order.paymentStatus === "PAID")
        ) {
          visibleOrders.push(order);
        }
        if (visibleOrders.length === 100) break;
      }
      cursor = page.continueCursor;
      isDone = page.isDone;
    }

    return await Promise.all(
      visibleOrders.map(async (order) => {
        const [table, session] = await Promise.all([
          order.tableId ? ctx.db.get("tables", order.tableId) : null,
          order.sessionId ? ctx.db.get("sessions", order.sessionId) : null,
        ]);
        const safeOrder = { ...order };
        delete safeOrder.deliveryTrackingTokenHash;
        delete safeOrder.deliveryPinHash;
        delete safeOrder.deliveryPinCiphertext;
        delete safeOrder.deliveryPinExpiresAt;
        delete safeOrder.deliveryPinFailedAttempts;
        delete safeOrder.deliveryPinLockedUntil;
        return {
          ...safeOrder,
          tableDisplayName:
            order.orderType === "DELIVERY"
              ? `Delivery · ${order._id.slice(-5).toUpperCase()}`
              : (table?.displayName ?? table?.tableNumber ?? "Table"),
          sessionStatus: session?.status ?? "CLOSED",
        };
      }),
    );
  },
});

/** Manager and staff: list the most recent completed and cancelled orders. */
export const listHistoryForRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  returns: v.array(
    schema
      .doc("orders")
      .omit(
        "deliveryTrackingTokenHash",
        "deliveryPinHash",
        "deliveryPinCiphertext",
        "deliveryPinExpiresAt",
        "deliveryPinFailedAttempts",
        "deliveryPinLockedUntil",
      )
      .extend({ tableDisplayName: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);
    if (user.role === "DELIVERY_PERSON") {
      throw new ConvexError({
        message: "Order history is not available to delivery personnel.",
        code: "FORBIDDEN",
      });
    }

    const [deliveredOrders, cancelledOrders] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_restaurant_status", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("status", "DELIVERED"),
        )
        .order("desc")
        .take(100),
      ctx.db
        .query("orders")
        .withIndex("by_restaurant_status", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("status", "CANCELLED"),
        )
        .order("desc")
        .take(100),
    ]);

    const history = [...deliveredOrders, ...cancelledOrders]
      .sort(
        (left, right) =>
          right.placedAt.localeCompare(left.placedAt) ||
          right._creationTime - left._creationTime,
      )
      .slice(0, 100);

    return await Promise.all(
      history.map(async (order) => {
        const table = order.tableId
          ? await ctx.db.get("tables", order.tableId)
          : null;
        const safeOrder = { ...order };
        delete safeOrder.deliveryTrackingTokenHash;
        delete safeOrder.deliveryPinHash;
        delete safeOrder.deliveryPinCiphertext;
        delete safeOrder.deliveryPinExpiresAt;
        delete safeOrder.deliveryPinFailedAttempts;
        delete safeOrder.deliveryPinLockedUntil;
        return {
          ...safeOrder,
          tableDisplayName:
            order.orderType === "DELIVERY"
              ? `Delivery · ${order._id.slice(-5).toUpperCase()}`
              : (table?.displayName ?? table?.tableNumber ?? "Table"),
        };
      }),
    );
  },
});

/** Place a delivery order using server-owned menu prices and restaurant fees. */
export const createDeliveryOrder = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    addressId: v.optional(v.id("deliveryAddresses")),
    deliveryAddress: v.optional(deliveryAddressValidator),
    items: v.array(deliveryLineValidator),
    paymentMethod: v.union(v.literal("ONLINE"), v.literal("COD")),
  },
  returns: v.object({
    orderId: v.id("orders"),
    trackingToken: v.string(),
    subtotal: v.number(),
    tax: v.number(),
    deliveryCharge: v.number(),
    discount: v.number(),
    total: v.number(),
  }),
  handler: async (ctx, args) => {
    if (Boolean(args.addressId) === Boolean(args.deliveryAddress)) {
      throw new ConvexError({
        message: "Choose a saved address or enter a delivery address.",
        code: "BAD_REQUEST",
      });
    }

    let customer: Doc<"users"> | null;
    let address: NonNullable<Doc<"orders">["deliveryAddress"]>;
    if (args.addressId) {
      customer = await requireCustomer(ctx);
      const savedAddress = await ctx.db.get(
        "deliveryAddresses",
        args.addressId,
      );
      if (!savedAddress || savedAddress.userId !== customer._id) {
        throw new ConvexError({
          message: "Choose one of your saved delivery addresses.",
          code: "FORBIDDEN",
        });
      }
      address = savedAddress;
    } else {
      const guestAddress = args.deliveryAddress;
      if (!guestAddress) {
        throw new ConvexError({
          message: "Enter a delivery address.",
          code: "BAD_REQUEST",
        });
      }
      address = guestAddress;
      if (
        address.name.trim().length < 1 ||
        address.name.trim().length > 100 ||
        !/^\+[1-9]\d{7,14}$/.test(address.phone.trim()) ||
        address.street.trim().length < 3 ||
        address.street.trim().length > 200 ||
        address.area.trim().length < 2 ||
        address.area.trim().length > 100 ||
        address.city.trim().length < 2 ||
        address.city.trim().length > 100 ||
        !/^\d{4,10}$/.test(address.pincode.trim())
      ) {
        throw new ConvexError({
          message: "Enter valid delivery address details.",
          code: "BAD_REQUEST",
        });
      }
      if (args.paymentMethod === "ONLINE") {
        throw new ConvexError({
          message: "Online payment requires a signed-in customer account.",
          code: "UNAUTHENTICATED",
        });
      }
      const userId = await getAuthUserId(ctx);
      customer = userId ? await ctx.db.get("users", userId) : null;
    }
    if (args.items.length === 0 || args.items.length > 50) {
      throw new ConvexError({
        message: "Your cart must contain between 1 and 50 items.",
        code: "BAD_REQUEST",
      });
    }
    const restaurant = await ctx.db.get("restaurants", args.restaurantId);
    if (!restaurant || !restaurant.isActive) {
      throw new ConvexError({
        message: "This restaurant is not available for ordering.",
        code: "BAD_REQUEST",
      });
    }
    const onlineOrderingFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("key", "online_ordering"),
      )
      .unique();
    const deliveryEnabled =
      restaurant.deliveryEnabledBySuperAdmin ??
      onlineOrderingFlag?.enabled ??
      true;
    if (!deliveryEnabled) {
      throw new ConvexError({
        message: "Online ordering is currently unavailable.",
        code: "FORBIDDEN",
      });
    }
    const orderItems = await Promise.all(
      args.items.map(async (line) => {
        if (
          !Number.isInteger(line.quantity) ||
          line.quantity < 1 ||
          line.quantity > 50 ||
          (line.notes?.length ?? 0) > 200
        ) {
          throw new ConvexError({
            message: "Item quantities or notes are invalid.",
            code: "BAD_REQUEST",
          });
        }
        const menuItem = await ctx.db.get("menuItems", line.menuItemId);
        if (
          !menuItem ||
          menuItem.restaurantId !== args.restaurantId ||
          !menuItem.isAvailable
        ) {
          throw new ConvexError({
            message: "A menu item is no longer available.",
            code: "BAD_REQUEST",
          });
        }
        return {
          menuItemId: menuItem._id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: line.quantity,
          ...(line.notes?.trim() ? { notes: line.notes.trim() } : {}),
        };
      }),
    );
    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    if (!Number.isSafeInteger(subtotal) || subtotal <= 0) {
      throw new ConvexError({
        message: "The order amount is invalid.",
        code: "BAD_REQUEST",
      });
    }
    const discount = Math.min(restaurant.deliveryDiscountPaise ?? 0, subtotal);
    const deliveryCharge = restaurant.deliveryFeePaise ?? 0;
    const taxableAmount = subtotal - discount;
    const tax = Math.round(
      (taxableAmount * (restaurant.deliveryTaxRatePercent ?? 0)) / 100,
    );
    const total = taxableAmount + tax + deliveryCharge;
    if (!Number.isSafeInteger(total) || total <= 0) {
      throw new ConvexError({
        message: "The checkout total is invalid.",
        code: "BAD_REQUEST",
      });
    }

    const now = new Date().toISOString();
    const trackingToken = generateDeliveryTrackingToken();
    const deliveryTrackingTokenHash =
      await hashDeliveryTrackingToken(trackingToken);
    const orderId = await ctx.db.insert("orders", {
      restaurantId: args.restaurantId,
      orderType: "DELIVERY",
      status: "PENDING",
      ...(customer?.role === "CUSTOMER" && customer.phone
        ? { customerUserId: customer._id }
        : {}),
      paymentStatus: args.paymentMethod === "COD" ? "UNPAID" : "PENDING",
      deliveryPaymentMethod: args.paymentMethod,
      deliveryAddress: {
        name: address.name.trim(),
        phone: address.phone.trim(),
        street: address.street.trim(),
        area: address.area.trim(),
        city: address.city.trim(),
        pincode: address.pincode.trim(),
      },
      items: orderItems,
      subtotal,
      tax,
      deliveryCharge,
      discount,
      total,
      placedAt: now,
      deliveryTrackingTokenHash,
    });
    if (args.paymentMethod === "COD") {
      await recordCustomerAction(ctx, {
        restaurantId: args.restaurantId,
        orderId,
        eventType: "ORDER_PLACED",
        message: `New home delivery order received #${orderId.slice(-5).toUpperCase()}.`,
      });
    }
    return {
      orderId,
      trackingToken,
      subtotal,
      tax,
      deliveryCharge,
      discount,
      total,
    };
  },
});

/** Customer order history is scoped to the authenticated phone account. */
export const listMyDeliveryOrders = query({
  args: {},
  returns: v.array(customerOrderValidator),
  handler: async (
    ctx,
  ): Promise<
    Array<{
      _id: Doc<"orders">["_id"];
      _creationTime: number;
      restaurantName: string;
      restaurantSlug: string;
      currency: string;
      orderType: "DELIVERY";
      status: Doc<"orders">["status"];
      paymentStatus?: Doc<"orders">["paymentStatus"];
      deliveryPaymentMethod?: Doc<"orders">["deliveryPaymentMethod"];
      items: Doc<"orders">["items"];
      subtotal: number;
      tax?: number;
      deliveryCharge?: number;
      discount?: number;
      total: number;
      placedAt: string;
      deliveryAddress?: Doc<"orders">["deliveryAddress"];
    }>
  > => {
    const customer = await requireCustomer(ctx);
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerUserId", customer._id))
      .order("desc")
      .take(100);
    const deliveryOrders = orders.filter(
      (order) => order.orderType === "DELIVERY",
    );
    return await Promise.all(
      deliveryOrders.map(async (order) => {
        const restaurant = await ctx.db.get("restaurants", order.restaurantId);
        return {
          _id: order._id,
          _creationTime: order._creationTime,
          restaurantName: restaurant?.name ?? "Restaurant",
          restaurantSlug: restaurant?.slug ?? "",
          currency: restaurant?.currency ?? "INR",
          orderType: "DELIVERY" as const,
          status: order.status,
          paymentStatus: order.paymentStatus,
          deliveryPaymentMethod: order.deliveryPaymentMethod,
          items: order.items,
          subtotal: order.subtotal,
          tax: order.tax,
          deliveryCharge: order.deliveryCharge,
          discount: order.discount,
          total: order.total,
          placedAt: order.placedAt,
          deliveryAddress: order.deliveryAddress,
        };
      }),
    );
  },
});
