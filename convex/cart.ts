import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { recordCustomerAction } from "./lib/staffNotifications";

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
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }

    const menuItem = await ctx.db.get("menuItems", args.menuItemId);
    if (
      !menuItem ||
      !menuItem.isAvailable ||
      menuItem.restaurantId !== session.restaurantId
    ) {
      throw new ConvexError({
        message: "Item is not available",
        code: "BAD_REQUEST",
      });
    }
    if (args.quantity <= 0) {
      throw new ConvexError({
        message: "Quantity must be greater than zero",
        code: "BAD_REQUEST",
      });
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
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      eventType: "CART_CHANGED",
      message: `Customer added ${args.quantity} × ${menuItem.name} to the cart.`,
    });
    return null;
  },
});

/** Update quantity of a cart item (0 = remove) */
export const updateCartItem = mutation({
  args: {
    cartItemId: v.id("cartItems"),
    quantity: v.number(),
    customerId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cartItem = await ctx.db.get("cartItems", args.cartItemId);
    if (!cartItem) return null;
    const session = await ctx.db.get("sessions", cartItem.sessionId);
    if (!session || session.status !== "ACTIVE") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }
    const sharedCartFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "shared_cart"),
      )
      .unique();
    if (
      sharedCartFlag?.enabled === false &&
      cartItem.addedBy !== args.customerId
    ) {
      throw new ConvexError({
        message: "Cart item belongs to another customer",
        code: "FORBIDDEN",
      });
    }
    const menuItem = await ctx.db.get("menuItems", cartItem.menuItemId);
    if (args.quantity <= 0) {
      await ctx.db.delete("cartItems", cartItem._id);
    } else {
      await ctx.db.patch("cartItems", cartItem._id, {
        quantity: args.quantity,
        updatedAt: new Date().toISOString(),
      });
    }
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: session._id,
      tableId: session.tableId,
      eventType: "CART_CHANGED",
      message:
        args.quantity <= 0
          ? `Customer removed ${menuItem?.name ?? "an item"} from the cart.`
          : `Customer changed ${menuItem?.name ?? "an item"} quantity to ${args.quantity}.`,
    });
    return null;
  },
});

/** Remove a specific cart item */
export const removeFromCart = mutation({
  args: { cartItemId: v.id("cartItems"), customerId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cartItem = await ctx.db.get("cartItems", args.cartItemId);
    if (!cartItem) return null;
    const session = await ctx.db.get("sessions", cartItem.sessionId);
    if (!session || session.status !== "ACTIVE") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }
    const sharedCartFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "shared_cart"),
      )
      .unique();
    if (
      sharedCartFlag?.enabled === false &&
      cartItem.addedBy !== args.customerId
    ) {
      throw new ConvexError({
        message: "Cart item belongs to another customer",
        code: "FORBIDDEN",
      });
    }
    const menuItem = await ctx.db.get("menuItems", cartItem.menuItemId);
    await ctx.db.delete("cartItems", cartItem._id);
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: session._id,
      tableId: session.tableId,
      eventType: "CART_CHANGED",
      message: `Customer removed ${menuItem?.name ?? "an item"} from the cart.`,
    });
    return null;
  },
});
