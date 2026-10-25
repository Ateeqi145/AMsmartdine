/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("table session access", () => {
  it("lets the opening device resume but blocks a different device", async () => {
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

    expect(resumedVisit).toEqual({ ...firstVisit, isNew: false });
    await expect(
      t.mutation(api.sessions.openOrJoinSession, {
        ...args,
        customerId: "device-b",
      }),
    ).rejects.toThrow(/occupied/i);
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

    await t.run((ctx) => ctx.db.patch("sessions", sessionId, { status: "BILLING" }));
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
