/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("restaurant order history", () => {
  it("lists recent delivered and cancelled orders, including hidden deliveries", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, managerId, hiddenDeliveryId, cancelledOrderId } =
      await t.run(async (ctx) => {
        const restaurantId = await ctx.db.insert("restaurants", {
          name: "History Restaurant",
          slug: "history-restaurant",
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
          name: "History Meal",
          price: 1500,
          isAvailable: true,
          sortOrder: 0,
          createdAt: now,
          updatedAt: now,
        });
        const baseOrder = {
          restaurantId,
          items: [
            { menuItemId, name: "History Meal", price: 1500, quantity: 1 },
          ],
          subtotal: 1500,
          total: 1500,
        };
        const hiddenDeliveryId = await ctx.db.insert("orders", {
          ...baseOrder,
          orderType: "DELIVERY",
          status: "DELIVERED",
          placedAt: now,
          hiddenFromOrdersAt: now,
          deliveryPinHash: "private-pin-hash",
          deliveryAddress: {
            name: "Customer",
            phone: "1234567890",
            street: "1 Main Street",
            area: "Central",
            city: "Test City",
            pincode: "123456",
          },
        });
        const cancelledOrderId = await ctx.db.insert("orders", {
          ...baseOrder,
          orderType: "DINE_IN",
          status: "CANCELLED",
          placedAt: new Date(Date.now() - 60_000).toISOString(),
          cancelReason: "Customer requested",
        });
        await ctx.db.insert("orders", {
          ...baseOrder,
          orderType: "DINE_IN",
          status: "PREPARING",
          placedAt: now,
        });
        return { restaurantId, managerId, hiddenDeliveryId, cancelledOrderId };
      });

    const history = await t
      .withIdentity({ subject: managerId })
      .query(api.orders.listHistoryForRestaurant, { restaurantId });

    expect(history.map((order) => order._id)).toEqual([
      hiddenDeliveryId,
      cancelledOrderId,
    ]);
    expect(history[0]).toMatchObject({
      status: "DELIVERED",
      orderType: "DELIVERY",
      hiddenFromOrdersAt: now,
      tableDisplayName: `Delivery · ${hiddenDeliveryId.slice(-5).toUpperCase()}`,
    });
    expect(history[0]).not.toHaveProperty("deliveryPinHash");
    expect(history[0]).toHaveProperty("deliveryAddress");
    expect(history[1]).toMatchObject({
      status: "CANCELLED",
      cancelReason: "Customer requested",
      tableDisplayName: "Table",
    });
  });
});
