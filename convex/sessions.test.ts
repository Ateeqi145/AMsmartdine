/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("table session access", () => {
  it("lets the opening device resume and gives later scans read-only access", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const restaurantId = await t.run((ctx) =>
      ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const tableId = await t.run((ctx) =>
      ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "test-qr",
        createdAt: now,
      }),
    );
    const args = {
      tableId,
      restaurantId,
      customerCount: 1,
    };

    const firstVisit = await t.mutation(api.sessions.openOrJoinSession, {
      ...args,
      customerId: "device-a",
    });
    const resumedVisit = await t.mutation(api.sessions.openOrJoinSession, {
      ...args,
      customerId: "device-a",
    });

    expect(firstVisit.isHost).toBe(true);
    expect(resumedVisit).toEqual({ ...firstVisit, isNew: false });
    await expect(
      t.mutation(api.sessions.openOrJoinSession, {
        ...args,
        customerId: "device-b",
      }),
    ).resolves.toEqual({
      sessionId: null,
      isNew: false,
      isHost: false,
    });
    const privateSession = await t.query(api.sessions.getById, {
      sessionId: firstVisit.sessionId!,
      customerId: "device-b",
    });
    expect(privateSession).toMatchObject({ isHost: false });
    expect(privateSession?.session).not.toHaveProperty("hostCustomerId");
  });

  it("resolves legacy session ownership by the earliest visitor timestamp", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, tableId, sessionId } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Test Cafe",
        slug: "test-cafe-legacy-owner",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const tableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "legacy-owner-qr",
        createdAt: now,
      });
      const sessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 2,
        openedAt: now,
      });
      await ctx.db.insert("sessionVisitors", {
        sessionId,
        customerId: "z-first",
        joinedAt: "2025-01-01T10:00:00.000Z",
      });
      await ctx.db.insert("sessionVisitors", {
        sessionId,
        customerId: "a-later",
        joinedAt: "2025-01-01T10:01:00.000Z",
      });
      return { restaurantId, tableId, sessionId };
    });

    await expect(
      t.mutation(api.sessions.openOrJoinSession, {
        tableId,
        restaurantId,
        customerCount: 1,
        customerId: "a-later",
      }),
    ).resolves.toMatchObject({ isHost: false, sessionId: null });
    await expect(
      t.mutation(api.sessions.openOrJoinSession, {
        tableId,
        restaurantId,
        customerCount: 1,
        customerId: "z-first",
      }),
    ).resolves.toMatchObject({ isHost: true, sessionId });
  });

  it("restricts cart and order access to the table session host", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const {
      restaurantId,
      sessionId,
      menuItemId,
      orderId,
      secondOrderId,
      staffId,
    } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Test Cafe",
        slug: "test-cafe-host-access",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const tableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "host-access-qr",
        createdAt: now,
      });
      const categoryId = await ctx.db.insert("menuCategories", {
        restaurantId,
        name: "Food",
        sortOrder: 0,
        isActive: true,
        createdAt: now,
      });
      const menuItemId = await ctx.db.insert("menuItems", {
        restaurantId,
        categoryId,
        name: "Soup",
        price: 500,
        isAvailable: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      const sessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 1,
        openedAt: now,
        hostCustomerId: "host-device",
      });
      const staffId = await ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId,
        isActive: true,
      });
      await ctx.db.insert("sessionVisitors", {
        sessionId,
        customerId: "host-device",
        joinedAt: now,
      });
      await ctx.db.insert("cartItems", {
        restaurantId,
        sessionId,
        menuItemId,
        quantity: 1,
        addedBy: "host-device",
        addedAt: now,
        updatedAt: now,
      });
      const orderId = await ctx.db.insert("orders", {
        restaurantId,
        sessionId,
        tableId,
        orderType: "DINE_IN",
        status: "PENDING",
        customerId: "host-device",
        items: [{ menuItemId, name: "Soup", price: 500, quantity: 1 }],
        subtotal: 500,
        total: 500,
        placedAt: now,
      });
      const secondOrderId = await ctx.db.insert("orders", {
        restaurantId,
        sessionId,
        tableId,
        orderType: "DINE_IN",
        status: "PENDING",
        customerId: "host-device",
        items: [{ menuItemId, name: "Soup", price: 500, quantity: 1 }],
        subtotal: 500,
        total: 500,
        placedAt: now,
      });
      return {
        restaurantId,
        sessionId,
        menuItemId,
        orderId,
        secondOrderId,
        staffId,
      };
    });

    await expect(
      t.query(api.cart.getCart, { sessionId, customerId: "host-device" }),
    ).resolves.toHaveLength(1);
    await expect(
      t.query(api.cart.getCart, { sessionId, customerId: "guest-device" }),
    ).resolves.toEqual([]);
    await expect(
      t.query(api.orders.listBySession, {
        sessionId,
        customerId: "host-device",
      }),
    ).resolves.toHaveLength(2);
    await expect(
      t.query(api.orders.listBySession, {
        sessionId,
        customerId: "guest-device",
      }),
    ).resolves.toEqual([]);
    await expect(
      t.mutation(api.cart.addToCart, {
        sessionId,
        menuItemId,
        quantity: 1,
        customerId: "guest-device",
      }),
    ).rejects.toThrow(/only the customer who opened/i);
    await expect(
      t.mutation(api.orders.cancelOrder, {
        orderId,
        customerId: "guest-device",
      }),
    ).rejects.toThrow(/only the customer who opened/i);
    await t.mutation(api.orders.cancelOrder, {
      orderId,
      customerId: "host-device",
    });
    await expect(
      t.run((ctx) => ctx.db.get("sessions", sessionId)),
    ).resolves.toMatchObject({ status: "ACTIVE" });

    await t
      .withIdentity({ subject: staffId })
      .mutation(api.orders.updateStatus, {
        orderId: secondOrderId,
        restaurantId,
        status: "CANCELLED",
      });
    await expect(
      t.run((ctx) => ctx.db.get("sessions", sessionId)),
    ).resolves.toMatchObject({ status: "CLOSED" });
  });

  it("prevents deleting a table with an active or billing session and hides orphaned sessions", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const restaurantId = await t.run((ctx) =>
      ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe-delete",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const tableId = await t.run((ctx) =>
      ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "test-qr-delete",
        createdAt: now,
      }),
    );
    const managerId = await t.run((ctx) =>
      ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      }),
    );
    const sessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 1,
        openedAt: now,
      }),
    );
    const asManager = t.withIdentity({ subject: managerId });

    await expect(
      asManager.mutation(api.tables.remove, { tableId, restaurantId }),
    ).rejects.toThrow(/active or billing session/i);

    await t.run((ctx) =>
      ctx.db.patch("sessions", sessionId, { status: "BILLING" }),
    );
    await expect(
      asManager.mutation(api.tables.remove, { tableId, restaurantId }),
    ).rejects.toThrow(/active or billing session/i);

    await t.run((ctx) => ctx.db.delete("tables", tableId));
    await expect(
      asManager.query(api.sessions.listActiveSessions, { restaurantId }),
    ).resolves.toEqual([]);
  });

  it("lets staff close only unused sessions", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const restaurantId = await t.run((ctx) =>
      ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe-unused",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const tableId = await t.run((ctx) =>
      ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "test-qr-unused",
        createdAt: now,
      }),
    );
    const staffId = await t.run((ctx) =>
      ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId,
        isActive: true,
      }),
    );
    const unusedSessionId = await t.run((ctx) =>
      ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 1,
        openedAt: now,
      }),
    );
    const asStaff = t.withIdentity({ subject: staffId });

    await asStaff.mutation(api.sessions.closeUnusedSession, {
      sessionId: unusedSessionId,
      restaurantId,
    });
    await expect(
      t.run((ctx) => ctx.db.get("sessions", unusedSessionId)),
    ).resolves.toMatchObject({ status: "CLOSED" });

    const categoryId = await t.run((ctx) =>
      ctx.db.insert("menuCategories", {
        restaurantId,
        name: "Drinks",
        sortOrder: 0,
        isActive: true,
        createdAt: now,
      }),
    );
    const menuItemId = await t.run((ctx) =>
      ctx.db.insert("menuItems", {
        restaurantId,
        categoryId,
        name: "Tea",
        price: 100,
        isAvailable: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const sessionWithCartId = await t.run(async (ctx) => {
      const sessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 1,
        openedAt: now,
      });
      await ctx.db.insert("cartItems", {
        restaurantId,
        sessionId,
        menuItemId,
        quantity: 1,
        addedAt: now,
        updatedAt: now,
      });
      return sessionId;
    });

    await expect(
      asStaff.mutation(api.sessions.closeUnusedSession, {
        sessionId: sessionWithCartId,
        restaurantId,
      }),
    ).rejects.toThrow(/order or items in the cart/i);
    await expect(
      t.run((ctx) => ctx.db.get("sessions", sessionWithCartId)),
    ).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it("allows only the host to exit an unused table session", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { sessionId } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe-customer-exit",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const tableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "test-qr-customer-exit",
        createdAt: now,
      });
      const categoryId = await ctx.db.insert("menuCategories", {
        restaurantId,
        name: "Drinks",
        sortOrder: 0,
        isActive: true,
        createdAt: now,
      });
      const menuItemId = await ctx.db.insert("menuItems", {
        restaurantId,
        categoryId,
        name: "Tea",
        price: 100,
        isAvailable: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      const sessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 2,
        openedAt: now,
        hostCustomerId: "visitor-a",
      });
      await ctx.db.insert("sessionVisitors", {
        sessionId,
        customerId: "visitor-a",
        joinedAt: now,
      });
      await ctx.db.insert("sessionVisitors", {
        sessionId,
        customerId: "visitor-b",
        joinedAt: now,
      });
      await ctx.db.insert("cartItems", {
        restaurantId,
        sessionId,
        menuItemId,
        quantity: 1,
        addedBy: "visitor-a",
        addedAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("cartItems", {
        restaurantId,
        sessionId,
        menuItemId,
        quantity: 2,
        addedBy: "visitor-b",
        addedAt: now,
        updatedAt: now,
      });
      return { restaurantId, tableId, menuItemId, sessionId };
    });

    await expect(
      t.mutation(api.sessions.exitUnusedSession, {
        sessionId,
        customerId: "visitor-b",
      }),
    ).rejects.toThrow(/only the customer who opened/i);
    await expect(
      t.run((ctx) => ctx.db.get("sessions", sessionId)),
    ).resolves.toMatchObject({ status: "ACTIVE" });
    await expect(
      t.mutation(api.sessions.exitUnusedSession, {
        sessionId,
        customerId: "visitor-a",
      }),
    ).resolves.toBe(true);
    await expect(
      t.run((ctx) => ctx.db.get("sessions", sessionId)),
    ).resolves.toMatchObject({ status: "CLOSED" });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("cartItems")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect(),
      ),
    ).resolves.toEqual([]);
  });

  it("refreshes and closes the host's unused session and clears stale carts", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const sessionId = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Test Restaurant",
        slug: "refresh-unordered-session",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const tableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "refresh-unordered-qr",
        createdAt: now,
      });
      const categoryId = await ctx.db.insert("menuCategories", {
        restaurantId,
        name: "Food",
        sortOrder: 0,
        isActive: true,
        createdAt: now,
      });
      const menuItemId = await ctx.db.insert("menuItems", {
        restaurantId,
        categoryId,
        name: "Soup",
        price: 500,
        isAvailable: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      const id = await ctx.db.insert("sessions", {
        restaurantId,
        tableId,
        status: "ACTIVE",
        customerCount: 2,
        openedAt: now,
        hostCustomerId: "visitor-a",
      });
      await ctx.db.insert("orders", {
        restaurantId,
        sessionId: id,
        tableId,
        orderType: "DINE_IN",
        status: "CANCELLED",
        customerId: "visitor-a",
        items: [{ menuItemId, name: "Soup", price: 500, quantity: 1 }],
        subtotal: 500,
        total: 500,
        placedAt: now,
        cancelledAt: now,
        cancelledBy: "visitor-a",
      });
      for (const customerId of ["visitor-a", "visitor-b"]) {
        await ctx.db.insert("sessionVisitors", {
          sessionId: id,
          customerId,
          joinedAt: now,
        });
        await ctx.db.insert("cartItems", {
          restaurantId,
          sessionId: id,
          menuItemId,
          quantity: 1,
          addedBy: customerId,
          addedAt: now,
          updatedAt: now,
        });
      }
      return id;
    });

    await expect(
      t.mutation(api.sessions.refreshUnorderedSession, {
        sessionId,
        customerId: "visitor-a",
      }),
    ).resolves.toEqual({ closed: true });
    await expect(
      t.run((ctx) =>
        ctx.db
          .query("cartItems")
          .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
          .collect(),
      ),
    ).resolves.toEqual([]);
    await expect(
      t.run((ctx) => ctx.db.get("sessions", sessionId)),
    ).resolves.toMatchObject({ status: "CLOSED" });
  });

  it("counts open order actions and unused sessions for navigation badges", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const restaurantId = await t.run((ctx) =>
      ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe-action-counts",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const managerId = await t.run((ctx) =>
      ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      }),
    );
    await t.run(async (ctx) => {
      const orderedTableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "action-order-qr",
        createdAt: now,
      });
      const unusedTableId = await ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T2",
        isActive: true,
        qrCodeToken: "action-unused-qr",
        createdAt: now,
      });
      const categoryId = await ctx.db.insert("menuCategories", {
        restaurantId,
        name: "Food",
        sortOrder: 0,
        isActive: true,
        createdAt: now,
      });
      const menuItemId = await ctx.db.insert("menuItems", {
        restaurantId,
        categoryId,
        name: "Soup",
        price: 500,
        isAvailable: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
      const activeSessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId: orderedTableId,
        status: "ACTIVE",
        customerCount: 1,
        openedAt: now,
      });
      await ctx.db.insert("sessions", {
        restaurantId,
        tableId: unusedTableId,
        status: "ACTIVE",
        customerCount: 1,
        openedAt: now,
      });
      const closedSessionId = await ctx.db.insert("sessions", {
        restaurantId,
        tableId: orderedTableId,
        status: "CLOSED",
        customerCount: 1,
        openedAt: now,
        closedAt: now,
      });
      for (const sessionId of [activeSessionId, closedSessionId]) {
        await ctx.db.insert("orders", {
          restaurantId,
          sessionId,
          tableId: orderedTableId,
          status: "PENDING",
          items: [{ menuItemId, name: "Soup", price: 500, quantity: 1 }],
          subtotal: 500,
          total: 500,
          placedAt: now,
        });
      }
    });

    await expect(
      t
        .withIdentity({ subject: managerId })
        .query(api.sessions.getManagerActionCounts, { restaurantId }),
    ).resolves.toEqual({ orders: 1, unusedSessions: 1 });
  });
});
