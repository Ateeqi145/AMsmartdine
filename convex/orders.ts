import { mutation, query } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { requireRestaurantAccess } from "./lib/auth";
import { recordCustomerAction } from "./lib/staffNotifications";
import { closeSessionWhenSettled } from "./lib/sessionLifecycle";

/** Place an order from the current cart (clears cart after) */
export const placeOrder = mutation({
  args: {
    sessionId: v.id("sessions"),
    customerId: v.string(),
    waterRequested: v.optional(v.boolean()),
  },
  returns: v.id("orders"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.status !== "ACTIVE") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }

    const allCartItems = await ctx.db
      .query("cartItems")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const sharedCartFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "shared_cart"),
      )
      .unique();
    const cartItems =
      sharedCartFlag?.enabled === false
        ? allCartItems.filter((item) => item.addedBy === args.customerId)
        : allCartItems;

    if (cartItems.length === 0) {
      throw new ConvexError({ message: "Cart is empty", code: "BAD_REQUEST" });
    }

    // Snapshot menu items at time of order
    const orderItems = await Promise.all(
      cartItems.map(async (ci) => {
        const menuItem = await ctx.db.get("menuItems", ci.menuItemId);
        if (
          !menuItem ||
          !menuItem.isAvailable ||
          menuItem.restaurantId !== session.restaurantId
        ) {
          throw new ConvexError({
            message: "A menu item is no longer available",
            code: "BAD_REQUEST",
          });
        }
        return {
          menuItemId: ci.menuItemId,
          name: menuItem.name,
          price: menuItem.price,
          quantity: ci.quantity,
          notes: ci.notes,
        };
      }),
    );

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    const now = new Date().toISOString();
    const orderId = await ctx.db.insert("orders", {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      status: "PENDING",
      customerId: args.customerId,
      items: orderItems,
      subtotal,
      total: subtotal,
      placedAt: now,
    });
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      orderId,
      eventType: "ORDER_PLACED",
      message: `New order: ${orderItems.length} item type${orderItems.length === 1 ? "" : "s"}.`,
    });

    // Clear cart after placing order
    for (const item of cartItems) {
      await ctx.db.delete("cartItems", item._id);
    }

    if (args.waterRequested) {
      await ctx.db.insert("waiterRequests", {
        restaurantId: session.restaurantId,
        sessionId: args.sessionId,
        tableId: session.tableId,
        requestType: "WATER",
        message: "Customer requested drinking water with this order.",
        status: "PENDING",
        requestedAt: now,
      });
      await recordCustomerAction(ctx, {
        restaurantId: session.restaurantId,
        sessionId: args.sessionId,
        tableId: session.tableId,
        eventType: "WATER_REQUESTED",
        message: "Customer requested drinking water.",
      });
    }

    // Update session totalAmount
    const currentTotal = session.totalAmount ?? 0;
    await ctx.db.patch("sessions", args.sessionId, {
      totalAmount: currentTotal + subtotal,
    });

    return orderId;
  },
});

/** Customer cancellation is allowed until preparation begins. */
export const cancelOrder = mutation({
  args: {
    orderId: v.id("orders"),
    customerId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (!order)
      throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    if (order.customerId && order.customerId !== args.customerId) {
      throw new ConvexError({
        message: "This order belongs to another customer",
        code: "FORBIDDEN",
      });
    }

    if (
      order.status === "PREPARING" ||
      order.status === "READY" ||
      order.status === "DELIVERED" ||
      order.status === "CANCELLED"
    ) {
      throw new ConvexError({
        message: "Cannot cancel — order is already being prepared or completed",
        code: "BAD_REQUEST",
      });
    }

    const session = await ctx.db.get("sessions", order.sessionId);
    if ((session?.paidAmount ?? 0) > 0) {
      throw new ConvexError({
        message:
          "This order cannot be cancelled after payment has been recorded",
        code: "BAD_REQUEST",
      });
    }

    const now = new Date().toISOString();
    await ctx.db.patch("orders", args.orderId, {
      status: "CANCELLED",
      cancelledAt: now,
      cancelledBy: args.customerId,
      cancelReason: args.reason,
    });

    // Subtract from session totalAmount
    if (session) {
      const newTotal = Math.max(0, (session.totalAmount ?? 0) - order.total);
      await ctx.db.patch("sessions", order.sessionId, {
        totalAmount: newTotal,
      });
      await recordCustomerAction(ctx, {
        restaurantId: order.restaurantId,
        sessionId: order.sessionId,
        tableId: order.tableId,
        orderId: order._id,
        eventType: "ORDER_CANCELLED",
        message: `Customer cancelled order #${order._id.slice(-5).toUpperCase()}.`,
      });
    }
    return null;
  },
});

/** Get all orders for a session (realtime) */
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

/** Manager: update order status */
export const updateStatus = mutation({
  args: {
    orderId: v.id("orders"),
    restaurantId: v.id("restaurants"),
    status: v.union(
      v.literal("CONFIRMED"),
      v.literal("PREPARING"),
      v.literal("READY"),
      v.literal("DELIVERED"),
      v.literal("CANCELLED"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);

    const order = await ctx.db.get("orders", args.orderId);
    if (!order || order.restaurantId !== args.restaurantId) {
      throw new ConvexError({ message: "Order not found", code: "NOT_FOUND" });
    }

    const now = new Date().toISOString();
    const patch: Record<string, string> = { status: args.status };
    if (args.status === "CONFIRMED") patch.confirmedAt = now;
    if (args.status === "PREPARING") patch.preparingAt = now;
    if (args.status === "READY") patch.readyAt = now;
    if (args.status === "DELIVERED") patch.deliveredAt = now;
    if (args.status === "CANCELLED") {
      patch.cancelledAt = now;
    }

    await ctx.db.patch("orders", args.orderId, patch);
    if (args.status === "DELIVERED") {
      await closeSessionWhenSettled(ctx, order.sessionId, user._id);
    }
    return null;
  },
});

/** Manager: get all non-cancelled orders for active sessions */
export const listActiveForRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .order("desc")
      .take(100);

    return await Promise.all(
      orders.map(async (order) => {
        const table = await ctx.db.get("tables", order.tableId);
        return {
          ...order,
          tableDisplayName: table?.displayName ?? table?.tableNumber ?? "Table",
        };
      }),
    );
  },
});
