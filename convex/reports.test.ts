/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("manager reports", () => {
  it("returns separate report data for dine-in and delivery orders", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, managerId } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Reports Restaurant",
        slug: "reports-restaurant",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      });
      const categoryId = await ctx.db.insert("menuCategories", {
        restaurantId,
        name: "Meals",
        sortOrder: 0,
        isActive: true,
        createdAt: now,
      });
      const menuItemId = await ctx.db.insert("menuItems", {
        restaurantId,
        categoryId,
        name: "Test Meal",
        price: 1000,
        isAvailable: true,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });

      for (const order of [
        {
          orderType: "DINE_IN" as const,
          itemName: "Dine-in Meal",
          total: 1200,
        },
        {
          orderType: "DELIVERY" as const,
          itemName: "Delivery Meal",
          total: 2300,
        },
      ]) {
        const orderId = await ctx.db.insert("orders", {
          restaurantId,
          orderType: order.orderType,
          status: order.orderType === "DELIVERY" ? "DELIVERED" : "CONFIRMED",
          items: [
            {
              menuItemId,
              name: order.itemName,
              price: order.total,
              quantity: 1,
            },
          ],
          subtotal: order.total,
          total: order.total,
          placedAt: now,
          ...(order.orderType === "DELIVERY" ? { deliveredAt: now } : {}),
        });
        await ctx.db.insert("payments", {
          restaurantId,
          orderId,
          amount: order.total,
          method: "UPI",
          status: "PAID",
          initiatedAt: now,
          completedAt: now,
        });
      }

      return { restaurantId, managerId };
    });

    const manager = t.withIdentity({ subject: managerId });
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
    const dineInItems = await manager.query(api.reports.topMenuItems, {
      restaurantId,
      limit: 8,
      orderType: "DINE_IN",
    });
    const deliveryItems = await manager.query(api.reports.topMenuItems, {
      restaurantId,
      limit: 8,
      orderType: "DELIVERY",
    });
    const dineInStats = await manager.query(api.reports.sessionStats, {
      restaurantId,
      orderType: "DINE_IN",
    });
    const deliveryStats = await manager.query(api.reports.sessionStats, {
      restaurantId,
      orderType: "DELIVERY",
    });

    expect(dineInRevenue[dineInRevenue.length - 1]?.revenue).toBe(1200);
    expect(deliveryRevenue[deliveryRevenue.length - 1]?.revenue).toBe(2300);
    expect(dineInItems.map((item) => item.name)).toEqual(["Dine-in Meal"]);
    expect(deliveryItems.map((item) => item.name)).toEqual(["Delivery Meal"]);
    expect(dineInStats).toMatchObject({
      totalOrdersToday: 1,
      totalRevenueToday: 1200,
    });
    expect(deliveryStats).toMatchObject({
      totalOrdersToday: 1,
      totalRevenueToday: 2300,
    });
  });
});
