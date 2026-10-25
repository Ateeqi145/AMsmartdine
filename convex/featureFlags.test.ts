/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("manager feature controls", () => {
  it("allows a manager to change supported flags and rejects staff", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const restaurantId = await t.run((ctx) =>
      ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe-manager-features",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const [managerId, staffId] = await t.run(async (ctx) => {
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
      return [managerId, staffId] as const;
    });
    const manager = t.withIdentity({ subject: managerId });
    const staff = t.withIdentity({ subject: staffId });

    await manager.mutation(api.featureFlags.setManagerFlag, {
      restaurantId,
      key: "shared_cart",
      enabled: false,
    });
    await expect(
      manager.query(api.featureFlags.listByRestaurant, { restaurantId }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "shared_cart", enabled: false }),
      ]),
    );
    await expect(
      staff.mutation(api.featureFlags.setManagerFlag, {
        restaurantId,
        key: "feedback",
        enabled: false,
      }),
    ).rejects.toThrow(/restaurant manager access required/i);
  });
});
