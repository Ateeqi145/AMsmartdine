import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { requireRestaurantAccess, requireSuperAdmin } from "./lib/auth";
import { assertRoleSlotAvailable } from "./lib/roleLimits";

/** Get current user with role info */
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    return userId ? await ctx.db.get("users", userId) : null;
  },
});

/** Get current user's restaurant (for managers/staff) */
export const getCurrentUserRestaurant = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    const user = userId ? await ctx.db.get("users", userId) : null;
    if (!user?.restaurantId) return null;
    const restaurant = await ctx.db.get("restaurants", user.restaurantId);
    if (!restaurant) return null;
    const logoUrl = restaurant.logoStorageId
      ? await ctx.storage.getUrl(restaurant.logoStorageId)
      : restaurant.logoUrl;
    const paymentQrUrl = restaurant.paymentQrStorageId
      ? await ctx.storage.getUrl(restaurant.paymentQrStorageId)
      : undefined;
    return {
      ...restaurant,
      logoUrl: logoUrl ?? undefined,
      paymentQrUrl: paymentQrUrl ?? undefined,
    };
  },
});

/** SUPER_ADMIN: assign role to a user */
export const assignRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("SUPER_ADMIN"),
      v.literal("RESTAURANT_MANAGER"),
      v.literal("RESTAURANT_STAFF"),
    ),
    restaurantId: v.optional(v.id("restaurants")),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await assertRoleSlotAvailable(ctx, args);
    await ctx.db.patch("users", args.userId, {
      role: args.role,
      restaurantId: args.role === "SUPER_ADMIN" ? undefined : args.restaurantId,
    });
  },
});

/** List users for a restaurant (manager/staff) */
export const listByRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return await ctx.db
      .query("users")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .collect();
  },
});
