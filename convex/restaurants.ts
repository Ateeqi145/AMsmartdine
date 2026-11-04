import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireSuperAdmin,
  requireRestaurantAccess,
  requireRestaurantManager,
  generateRequestId,
} from "./lib/auth";

const DEFAULT_FEATURES = [
  "occupied_menu_access",
  "online_payment",
  "call_waiter",
  "feedback",
  "partial_payment",
  "online_ordering",
] as const;

/** SUPER_ADMIN: create a new restaurant */
export const create = mutation({
  args: {
    name: v.string(),
    businessType: v.optional(
      v.union(v.literal("RESTAURANT"), v.literal("CAFE")),
    ),
    slug: v.string(),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    const now = new Date().toISOString();

    // Check slug uniqueness
    const existing = await ctx.db
      .query("restaurants")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) {
      throw new Error("A restaurant with this slug already exists");
    }

    const restaurantId = await ctx.db.insert("restaurants", {
      ...args,
      businessType: args.businessType ?? "RESTAURANT",
      currency: args.currency ?? "INR",
      timezone: args.timezone ?? "Asia/Kolkata",
      isActive: true,
      createdAt: now,
      updatedAt: now,
      createdBy: admin._id,
    });

    // Seed default feature flags (all ON)
    for (const key of DEFAULT_FEATURES) {
      await ctx.db.insert("featureFlags", {
        restaurantId,
        key,
        enabled: true,
        updatedAt: now,
        updatedBy: admin._id,
      });
    }

    // Audit log
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "SUPER_ADMIN",
      restaurantId,
      action: "CREATE_RESTAURANT",
      targetType: "restaurant",
      targetId: restaurantId,
      requestId: generateRequestId(),
      timestamp: now,
    });

    return restaurantId;
  },
});

/** SUPER_ADMIN: update restaurant details */
export const update = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const { restaurantId, ...fields } = args;
    await ctx.db.patch("restaurants", restaurantId, {
      ...fields,
      updatedAt: new Date().toISOString(),
    });
  },
});

/** SUPER_ADMIN: toggle restaurant active status */
export const setActive = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    const now = new Date().toISOString();
    await ctx.db.patch("restaurants", args.restaurantId, {
      isActive: args.isActive,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "SUPER_ADMIN",
      restaurantId: args.restaurantId,
      action: args.isActive ? "ACTIVATE_RESTAURANT" : "DEACTIVATE_RESTAURANT",
      targetType: "restaurant",
      targetId: args.restaurantId,
      requestId: generateRequestId(),
      timestamp: now,
    });
  },
});

/** SUPER_ADMIN: list all restaurants */
export const listAll = query({
  args: {
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{
      _id: string;
      name: string;
      slug: string;
      isActive: boolean;
      createdAt: string;
      updatedAt: string;
      description?: string;
      businessType?: "RESTAURANT" | "CAFE";
      address?: string;
      phone?: string;
      email?: string;
      currency?: string;
      timezone?: string;
      logoUrl?: string;
    }>
  > => {
    await requireSuperAdmin(ctx);
    const all = await ctx.db.query("restaurants").collect();
    if (args.includeInactive) return all;
    return all.filter((r) => r.isActive);
  },
});

/** Get a single restaurant (accessible by its managers/staff) */
export const get = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return await ctx.db.get("restaurants", args.restaurantId);
  },
});

/** Manager: update customer-facing business name and brand assets. */
export const updateSettings = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    name: v.optional(v.string()),
    upiId: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    paymentQrStorageId: v.optional(v.id("_storage")),
    orderSoundStorageId: v.optional(v.id("_storage")),
    removeOrderSound: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    if (args.orderSoundStorageId && args.removeOrderSound) {
      throw new Error("Choose a new alert sound or remove the current one.");
    }
    const { restaurantId, removeOrderSound, upiId, ...fields } = args;
    const current = await ctx.db.get("restaurants", restaurantId);
    if (!current) throw new Error("Business not found");
    const trimmedUpiId = upiId?.trim();
    if (
      trimmedUpiId &&
      !/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9.-]{2,64}$/.test(trimmedUpiId)
    ) {
      throw new Error("Enter a valid UPI ID, for example name@bank.");
    }
    if (fields.logoStorageId && current.logoStorageId) {
      await ctx.storage.delete(current.logoStorageId);
    }
    if (fields.paymentQrStorageId && current.paymentQrStorageId) {
      await ctx.storage.delete(current.paymentQrStorageId);
    }
    if (
      (fields.orderSoundStorageId || removeOrderSound) &&
      current.orderSoundStorageId
    ) {
      await ctx.storage.delete(current.orderSoundStorageId);
    }
    await ctx.db.patch("restaurants", restaurantId, {
      ...fields,
      ...(upiId !== undefined
        ? { upiId: trimmedUpiId || undefined }
        : {}),
      ...(removeOrderSound ? { orderSoundStorageId: undefined } : {}),
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const updateDeliverySettings = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    deliveryFeePaise: v.number(),
    deliveryTaxRatePercent: v.number(),
    deliveryDiscountPaise: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    if (
      !Number.isSafeInteger(args.deliveryFeePaise) ||
      args.deliveryFeePaise < 0 ||
      args.deliveryFeePaise > 100_000_000 ||
      !Number.isFinite(args.deliveryTaxRatePercent) ||
      args.deliveryTaxRatePercent < 0 ||
      args.deliveryTaxRatePercent > 100 ||
      !Number.isSafeInteger(args.deliveryDiscountPaise) ||
      args.deliveryDiscountPaise < 0 ||
      args.deliveryDiscountPaise > 100_000_000
    ) {
      throw new Error("Enter valid delivery fee, tax, and discount settings.");
    }
    await ctx.db.patch("restaurants", args.restaurantId, {
      deliveryFeePaise: args.deliveryFeePaise,
      deliveryTaxRatePercent: args.deliveryTaxRatePercent,
      deliveryDiscountPaise: args.deliveryDiscountPaise,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const setDeliveryOverride = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    enabled: v.union(v.boolean(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireSuperAdmin(ctx);
    const now = new Date().toISOString();
    await ctx.db.patch("restaurants", args.restaurantId, {
      deliveryEnabledBySuperAdmin:
        args.enabled === null ? undefined : args.enabled,
      updatedAt: now,
    });
    await ctx.db.insert("auditLogs", {
      actorId: admin._id,
      actorRole: "SUPER_ADMIN",
      restaurantId: args.restaurantId,
      action: "SET_DELIVERY_OVERRIDE",
      targetType: "restaurant",
      targetId: args.restaurantId,
      details: JSON.stringify({ enabled: args.enabled }),
      requestId: generateRequestId(),
      timestamp: now,
    });
    return null;
  },
});

export const generateBrandAssetUploadUrl = mutation({
  args: { restaurantId: v.id("restaurants") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    return await ctx.storage.generateUploadUrl();
  },
});
