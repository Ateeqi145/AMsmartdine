import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";

/** Get cart for a session. If shared_cart flag is off, filter by customerId. */
export const getCart = query({
  args: {
    sessionId: v.id("sessions"),
    customerId: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session) return [];

    // Check shared_cart feature flag
    const sharedCartFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "shared_cart"),
      )
      .unique();
    const isShared = sharedCartFlag?.enabled ?? true;

    let cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    if (!isShared) {
      cartItems = cartItems.filter((ci) => ci.addedBy === args.customerId);
    }

    return await Promise.all(
      cartItems.map(async (ci) => {
        const menuItem = await ctx.db.get("menuItems", ci.menuItemId);
        return { ...ci, menuItem };
      }),
    );
  },
});

/** Add or increment an item in the cart */
export const addToCart = mutation({
  args: {
    sessionId: v.id("sessions"),
    menuItemId: v.id("menuItems"),
    quantity: v.number(),
    notes: v.optional(v.string()),
    customerId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.status !== "ACTIVE") {
      throw new ConvexError({ message: "Session is not active", code: "BAD_REQUEST" });
    }

    const menuItem = await ctx.db.get("menuItems", args.menuItemId);
    if (!menuItem || !menuItem.isAvailable || menuItem.restaurantId !== session.restaurantId) {
      throw new ConvexError({ message: "Item is not available", code: "BAD_REQUEST" });
    }
    if (args.quantity <= 0) {
      throw new ConvexError({ message: "Quantity must be greater than zero", code: "BAD_REQUEST" });
    }

    const sharedCartFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "shared_cart"),
      )
      .unique();
    const isShared = sharedCartFlag?.enabled ?? true;

    // Find existing cart entry for this item in this session
    const cartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const existing = cartItems.find(
      (ci) =>
        ci.menuItemId === args.menuItemId &&
        (isShared || ci.addedBy === args.customerId),
    );

    const now = new Date().toISOString();
    if (existing) {
      await ctx.db.patch("cartItems", existing._id, {
        quantity: existing.quantity + args.quantity,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("cartItems", {
        restaurantId: session.restaurantId,
        sessionId: args.sessionId,
        menuItemId: args.menuItemId,
        quantity: args.quantity,
        notes: args.notes,
        addedBy: args.customerId,
        addedAt: now,
        updatedAt: now,
      });
    }
    return null;
  },
});

/** Update quantity of a cart item (0 = remove) */
export const updateCartItem = mutation({
  args: {
    cartItemId: v.id("cartItems"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    if (args.quantity <= 0) {
      await ctx.db.delete("cartItems", args.cartItemId);
    } else {
      await ctx.db.patch("cartItems", args.cartItemId, {
        quantity: args.quantity,
        updatedAt: new Date().toISOString(),
      });
    }
  },
});

/** Remove a specific cart item */
export const removeFromCart = mutation({
  args: { cartItemId: v.id("cartItems") },
  handler: async (ctx, args) => {
    await ctx.db.delete("cartItems", args.cartItemId);
  },
});
