import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireSuperAdmin, requireRestaurantAccess, generateRequestId } from "./lib/auth";
import type { Id } from "./_generated/dataModel";

const FEATURE_KEYS = [
  "shared_cart",
  "online_payment",
  "call_waiter",
  "feedback",
  "partial_payment",
] as const;

type FeatureKey = (typeof FEATURE_KEYS)[number];

/** Get all feature flags for a restaurant */
export const listByRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
  },
});

/** Public: get feature flags for a restaurant (for customers via QR session) */
export const listPublic = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
  },
});

/** SUPER_ADMIN: set a feature flag for a restaurant */
export const setFlag = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    key: v.union(
      v.literal("shared_cart"),
      v.literal("online_payment"),
      v.literal("call_waiter"),
      v.literal("feedback"),
      v.literal("partial_payment"),
    ),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    const now = new Date().toISOString();

    const existing = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("key", args.key),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        updatedAt: now,
        updatedBy: admin._id,
      });
    } else {
      await ctx.db.insert("featureFlags", {
        restaurantId: args.restaurantId,
        key: args.key,
        enabled: args.enabled,
        updatedAt: now,
        updatedBy: admin._id,
      });
    }

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "SUPER_ADMIN",
      restaurantId: args.restaurantId,
      action: "TOGGLE_FEATURE",
      targetType: "featureFlag",
      details: JSON.stringify({ key: args.key, enabled: args.enabled }),
      requestId: generateRequestId(),
      timestamp: now,
    });
  },
});

/** SUPER_ADMIN: bulk set all flags for a restaurant */
export const bulkSetFlags = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    flags: v.array(
      v.object({
        key: v.union(
          v.literal("shared_cart"),
          v.literal("online_payment"),
          v.literal("call_waiter"),
          v.literal("feedback"),
          v.literal("partial_payment"),
        ),
        enabled: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    const now = new Date().toISOString();

    for (const flag of args.flags) {
      const existing = await ctx.db
        .query("featureFlags")
        .withIndex("by_restaurant_key", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("key", flag.key),
        )
        .unique();

      if (existing) {
        await ctx.db.patch(existing._id, {
          enabled: flag.enabled,
          updatedAt: now,
          updatedBy: admin._id,
        });
      } else {
        await ctx.db.insert("featureFlags", {
          restaurantId: args.restaurantId,
          key: flag.key,
          enabled: flag.enabled,
          updatedAt: now,
          updatedBy: admin._id,
        });
      }
    }

    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "SUPER_ADMIN",
      restaurantId: args.restaurantId,
      action: "BULK_SET_FEATURES",
      details: JSON.stringify(args.flags),
      requestId: generateRequestId(),
      timestamp: now,
    });
  },
});
