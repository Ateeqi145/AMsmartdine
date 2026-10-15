import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRestaurantAccess, requireRestaurantManager } from "./lib/auth";

// ─────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────

export const listCategories = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return await ctx.db
      .query("menuCategories")
      .withIndex("by_restaurant_sort", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
  },
});

/** Public: list categories for customer view */
export const listCategoriesPublic = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuCategories")
      .withIndex("by_restaurant_sort", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
  },
});

export const createCategory = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    name: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    // Auto-assign sort order
    const existing = await ctx.db
      .query("menuCategories")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
    const sortOrder = args.sortOrder ?? existing.length;
    return await ctx.db.insert("menuCategories", {
      restaurantId: args.restaurantId,
      name: args.name,
      description: args.description,
      sortOrder,
      isActive: true,
      createdAt: new Date().toISOString(),
    });
  },
});

export const updateCategory = mutation({
  args: {
    categoryId: v.id("menuCategories"),
    restaurantId: v.id("restaurants"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const { categoryId, restaurantId: _rid, ...fields } = args;
    await ctx.db.patch(categoryId, fields);
  },
});

export const deleteCategory = mutation({
  args: {
    categoryId: v.id("menuCategories"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    // Check for items
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .first();
    if (items) throw new Error("Cannot delete a category that has menu items");
    await ctx.db.delete(args.categoryId);
  },
});

// ─────────────────────────────────────────────────────────────────
// MENU ITEMS
// ─────────────────────────────────────────────────────────────────

export const listItems = query({
  args: {
    restaurantId: v.id("restaurants"),
    categoryId: v.optional(v.id("menuCategories")),
  },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    if (args.categoryId) {
      return await ctx.db
        .query("menuItems")
        .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
        .collect();
    }
    return await ctx.db
      .query("menuItems")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
  },
});

/** Public: list available items for customer view */
export const listItemsPublic = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuItems")
      .withIndex("by_restaurant_available", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("isAvailable", true),
      )
      .collect();
  },
});

export const createItem = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    categoryId: v.id("menuCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(),
    isVeg: v.optional(v.boolean()),
    tags: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const existing = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .collect();
    const now = new Date().toISOString();
    return await ctx.db.insert("menuItems", {
      restaurantId: args.restaurantId,
      categoryId: args.categoryId,
      name: args.name,
      description: args.description,
      price: args.price,
      isVeg: args.isVeg,
      tags: args.tags,
      isAvailable: true,
      sortOrder: args.sortOrder ?? existing.length,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateItem = mutation({
  args: {
    itemId: v.id("menuItems"),
    restaurantId: v.id("restaurants"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    price: v.optional(v.number()),
    isVeg: v.optional(v.boolean()),
    isAvailable: v.optional(v.boolean()),
    categoryId: v.optional(v.id("menuCategories")),
    tags: v.optional(v.array(v.string())),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const { itemId, restaurantId: _rid, ...fields } = args;
    await ctx.db.patch(itemId, { ...fields, updatedAt: new Date().toISOString() });
  },
});

export const deleteItem = mutation({
  args: {
    itemId: v.id("menuItems"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    await ctx.db.delete(args.itemId);
  },
});
