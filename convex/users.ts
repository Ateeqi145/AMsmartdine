import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import {
  requireRestaurantAccess,
  requireRestaurantManager,
  requireSuperAdmin,
  requireUser,
} from "./lib/auth";
import { assertRoleSlotAvailable } from "./lib/roleLimits";
import { deleteUserAccount } from "./lib/deleteUser";

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
    const orderSoundUrl = restaurant.orderSoundStorageId
      ? await ctx.storage.getUrl(restaurant.orderSoundStorageId)
      : undefined;
    return {
      ...restaurant,
      logoUrl: logoUrl ?? undefined,
      paymentQrUrl: paymentQrUrl ?? undefined,
      orderSoundUrl: orderSoundUrl ?? undefined,
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
      v.literal("DELIVERY_PERSON"),
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

/** Restaurant managers can change staff roles within their own restaurant. */
export const updateRestaurantUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("RESTAURANT_STAFF"), v.literal("DELIVERY_PERSON")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    if (!currentUser.restaurantId) {
      throw new ConvexError({
        message: "A restaurant is required to manage restaurant users",
        code: "FORBIDDEN",
      });
    }
    const manager = await requireRestaurantManager(
      ctx,
      currentUser.restaurantId,
    );

    const target = await ctx.db.get("users", args.userId);
    if (
      !target ||
      target.restaurantId !== manager.restaurantId ||
      target._id === manager._id ||
      (target.role !== "RESTAURANT_STAFF" && target.role !== "DELIVERY_PERSON")
    ) {
      throw new ConvexError({
        message: "You can only edit staff roles in your restaurant",
        code: "FORBIDDEN",
      });
    }

    await ctx.db.patch("users", target._id, {
      role: args.role,
      restaurantId: manager.restaurantId,
    });
    return null;
  },
});

/** Restaurant managers can remove staff and delivery accounts in their restaurant. */
export const deleteRestaurantUser = mutation({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const currentUser = await requireUser(ctx);
    if (!currentUser.restaurantId) {
      throw new ConvexError({
        message: "A restaurant is required to manage restaurant users",
        code: "FORBIDDEN",
      });
    }
    const manager = await requireRestaurantManager(
      ctx,
      currentUser.restaurantId,
    );
    const target = await ctx.db.get("users", args.userId);

    if (
      !target ||
      target.restaurantId !== manager.restaurantId ||
      target._id === manager._id ||
      (target.role !== "RESTAURANT_STAFF" && target.role !== "DELIVERY_PERSON")
    ) {
      throw new ConvexError({
        message: "You can only remove staff in your restaurant",
        code: "FORBIDDEN",
      });
    }

    return await deleteUserAccount(ctx, target._id);
  },
});
