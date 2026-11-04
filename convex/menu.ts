import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRestaurantAccess, requireRestaurantManager } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

async function withImageUrl(ctx: QueryCtx, item: Doc<"menuItems">) {
  const imageUrl = item.imageStorageId
    ? await ctx.storage.getUrl(item.imageStorageId)
    : item.imageUrl;
  return { ...item, imageUrl: imageUrl ?? undefined };
}

// ─────────────────────────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────────────────────────

export const listCategories = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return await ctx.db
      .query("menuCategories")
      .withIndex("by_restaurant_sort", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .collect();
  },
});

/** Public: list categories for customer view */
export const listCategoriesPublic = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menuCategories")
      .withIndex("by_restaurant_sort", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .collect();
  },
});

const onlineCategoryValidator = v.object({
  _id: v.id("menuCategories"),
  name: v.string(),
  description: v.optional(v.string()),
  sortOrder: v.number(),
});

const onlineItemValidator = v.object({
  _id: v.id("menuItems"),
  categoryId: v.id("menuCategories"),
  name: v.string(),
  description: v.optional(v.string()),
  price: v.number(),
  imageUrl: v.optional(v.string()),
  isVeg: v.optional(v.boolean()),
  sortOrder: v.number(),
  tags: v.optional(v.array(v.string())),
});

/** Public online menu, addressed by the restaurant's stable public slug. */
export const getOnlineMenu = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      restaurant: v.object({
        _id: v.id("restaurants"),
        name: v.string(),
        slug: v.string(),
        description: v.optional(v.string()),
        logoUrl: v.optional(v.string()),
        address: v.optional(v.string()),
        phone: v.optional(v.string()),
        currency: v.optional(v.string()),
      }),
      onlinePaymentEnabled: v.boolean(),
      categories: v.array(onlineCategoryValidator),
      menuItems: v.array(onlineItemValidator),
    }),
  ),
  handler: async (ctx, args) => {
    const restaurant = await ctx.db
      .query("restaurants")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!restaurant || !restaurant.isActive) return null;

    const onlineOrderingFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", restaurant._id).eq("key", "online_ordering"),
      )
      .unique();
    const deliveryEnabled =
      restaurant.deliveryEnabledBySuperAdmin ??
      onlineOrderingFlag?.enabled ??
      true;
    if (!deliveryEnabled) return null;

    const [categories, items, logoUrl, paymentFlag] = await Promise.all([
      ctx.db
        .query("menuCategories")
        .withIndex("by_restaurant_sort", (q) =>
          q.eq("restaurantId", restaurant._id),
        )
        .take(100),
      ctx.db
        .query("menuItems")
        .withIndex("by_restaurant_available", (q) =>
          q.eq("restaurantId", restaurant._id).eq("isAvailable", true),
        )
        .take(500),
      restaurant.logoStorageId
        ? ctx.storage.getUrl(restaurant.logoStorageId)
        : Promise.resolve(restaurant.logoUrl),
      ctx.db
        .query("featureFlags")
        .withIndex("by_restaurant_key", (q) =>
          q.eq("restaurantId", restaurant._id).eq("key", "online_payment"),
        )
        .unique(),
    ]);
    const activeCategories = categories.filter((category) => category.isActive);
    const categoryIds = new Set(activeCategories.map((category) => category._id));
    const menuItems = await Promise.all(
      items
        .filter((item) => categoryIds.has(item.categoryId))
        .map((item) => withImageUrl(ctx, item)),
    );

    return {
      restaurant: {
        _id: restaurant._id,
        name: restaurant.name,
        slug: restaurant.slug,
        description: restaurant.description,
        logoUrl: logoUrl ?? undefined,
        address: restaurant.address,
        phone: restaurant.phone,
        currency: restaurant.currency,
      },
      onlinePaymentEnabled: paymentFlag?.enabled ?? true,
      categories: activeCategories.map((category) => ({
        _id: category._id,
        name: category.name,
        description: category.description,
        sortOrder: category.sortOrder,
      })),
      menuItems: menuItems.map((item) => ({
        _id: item._id,
        categoryId: item.categoryId,
        name: item.name,
        description: item.description,
        price: item.price,
        imageUrl: item.imageUrl,
        isVeg: item.isVeg,
        sortOrder: item.sortOrder,
        tags: item.tags,
      })),
    };
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
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
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

export const seedSampleMenu = internalMutation({
  args: { restaurantId: v.id("restaurants") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const [existingCategory, existingItem] = await Promise.all([
      ctx.db
        .query("menuCategories")
        .withIndex("by_restaurant", (q) =>
          q.eq("restaurantId", args.restaurantId),
        )
        .first(),
      ctx.db
        .query("menuItems")
        .withIndex("by_restaurant", (q) =>
          q.eq("restaurantId", args.restaurantId),
        )
        .first(),
    ]);
    if (existingCategory || existingItem) return false;

    const now = new Date().toISOString();
    const sampleCategories = [
      {
        name: "Starters",
        description: "Small plates to start your meal",
        items: [
          {
            name: "Crispy Corn",
            description: "Golden corn tossed with herbs and spices",
            price: 18900,
            isVeg: true,
            tags: ["popular"],
          },
          {
            name: "Chicken Tikka",
            description: "Char-grilled chicken with a smoky marinade",
            price: 28900,
            isVeg: false,
            tags: ["chef's special"],
          },
        ],
      },
      {
        name: "Mains",
        description: "Comforting favourites made to order",
        items: [
          {
            name: "Paneer Butter Masala",
            description: "Paneer in a creamy tomato and cashew gravy",
            price: 32900,
            isVeg: true,
            tags: ["popular"],
          },
          {
            name: "Butter Chicken",
            description: "Tandoori chicken in a rich tomato butter sauce",
            price: 38900,
            isVeg: false,
            tags: ["chef's special"],
          },
        ],
      },
      {
        name: "Drinks & Desserts",
        description: "Something refreshing or sweet",
        items: [
          {
            name: "Mango Lassi",
            description: "Chilled yoghurt drink blended with mango",
            price: 12900,
            isVeg: true,
            tags: ["refreshing"],
          },
          {
            name: "Gulab Jamun",
            description: "Warm milk dumplings with cardamom syrup",
            price: 9900,
            isVeg: true,
            tags: ["dessert"],
          },
        ],
      },
    ];

    for (const [categoryIndex, category] of sampleCategories.entries()) {
      const categoryId = await ctx.db.insert("menuCategories", {
        restaurantId: args.restaurantId,
        name: category.name,
        description: category.description,
        sortOrder: categoryIndex,
        isActive: true,
        createdAt: now,
      });
      for (const [itemIndex, item] of category.items.entries()) {
        await ctx.db.insert("menuItems", {
          restaurantId: args.restaurantId,
          categoryId,
          name: item.name,
          description: item.description,
          price: item.price,
          isVeg: item.isVeg,
          tags: item.tags,
          isAvailable: true,
          sortOrder: itemIndex,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    return true;
  },
});

export const addSampleMenu = mutation({
  args: { restaurantId: v.id("restaurants") },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const seeded: boolean = await ctx.runMutation(
      internal.menu.seedSampleMenu,
      args,
    );
    return seeded;
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
    const category = await ctx.db.get("menuCategories", args.categoryId);
    if (!category || category.restaurantId !== args.restaurantId) {
      throw new Error("Category not found for this restaurant");
    }
    const { categoryId, restaurantId: _rid, ...fields } = args;
    await ctx.db.patch("menuCategories", categoryId, fields);
  },
});

export const deleteCategory = mutation({
  args: {
    categoryId: v.id("menuCategories"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const category = await ctx.db.get("menuCategories", args.categoryId);
    if (!category || category.restaurantId !== args.restaurantId) {
      throw new Error("Category not found for this restaurant");
    }
    // Check for items
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId))
      .first();
    if (items) throw new Error("Cannot delete a category that has menu items");
    await ctx.db.delete("menuCategories", args.categoryId);
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
      const category = await ctx.db.get("menuCategories", args.categoryId);
      if (!category || category.restaurantId !== args.restaurantId) {
        throw new Error("Category not found for this restaurant");
      }
    }
    const items = args.categoryId
      ? await ctx.db
          .query("menuItems")
          .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
          .collect()
      : await ctx.db
          .query("menuItems")
          .withIndex("by_restaurant", (q) =>
            q.eq("restaurantId", args.restaurantId),
          )
          .collect();
    return await Promise.all(items.map((item) => withImageUrl(ctx, item)));
  },
});

/** Public: list available items for customer view */
export const listItemsPublic = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("menuItems")
      .withIndex("by_restaurant_available", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("isAvailable", true),
      )
      .collect();
    return await Promise.all(items.map((item) => withImageUrl(ctx, item)));
  },
});

export const generateItemImageUploadUrl = mutation({
  args: { restaurantId: v.id("restaurants") },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    return await ctx.storage.generateUploadUrl();
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
    imageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.id("menuItems"),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const category = await ctx.db.get("menuCategories", args.categoryId);
    if (!category || category.restaurantId !== args.restaurantId) {
      throw new Error("Category not found for this restaurant");
    }
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
      imageStorageId: args.imageStorageId,
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
    imageStorageId: v.optional(v.id("_storage")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const item = await ctx.db.get("menuItems", args.itemId);
    if (!item || item.restaurantId !== args.restaurantId) {
      throw new Error("Menu item not found for this restaurant");
    }
    if (args.categoryId) {
      const category = await ctx.db.get("menuCategories", args.categoryId);
      if (!category || category.restaurantId !== args.restaurantId) {
        throw new Error("Category not found for this restaurant");
      }
    }
    const { itemId, restaurantId: _rid, ...fields } = args;
    if (
      args.imageStorageId &&
      item.imageStorageId &&
      args.imageStorageId !== item.imageStorageId
    ) {
      await ctx.storage.delete(item.imageStorageId);
    }
    await ctx.db.patch("menuItems", itemId, {
      ...fields,
      updatedAt: new Date().toISOString(),
    });
    return null;
  },
});

export const deleteItem = mutation({
  args: {
    itemId: v.id("menuItems"),
    restaurantId: v.id("restaurants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const item = await ctx.db.get("menuItems", args.itemId);
    if (!item || item.restaurantId !== args.restaurantId) {
      throw new Error("Menu item not found for this restaurant");
    }
    if (item.imageStorageId) await ctx.storage.delete(item.imageStorageId);
    await ctx.db.delete("menuItems", args.itemId);
    return null;
  },
});
