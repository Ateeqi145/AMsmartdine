import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireRestaurantAccess } from "./lib/auth";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
    tableId: v.id("tables"),
    type: v.union(v.literal("CALL"), v.literal("BILL"), v.literal("OTHER")),
    message: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Check call_waiter feature flag
    const flag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("key", "call_waiter")
      )
      .unique();

    if (!flag?.enabled) {
      throw new ConvexError({
        message: "Call waiter feature is not enabled for this restaurant",
        code: "NOT_IMPLEMENTED",
      });
    }

    const session = await ctx.db.get(args.sessionId);
    if (
      !session ||
      session.status !== "ACTIVE" ||
      session.restaurantId !== args.restaurantId ||
      session.tableId !== args.tableId
    ) {
      throw new ConvexError({ message: "Session not active", code: "BAD_REQUEST" });
    }

    return await ctx.db.insert("waiterRequests", {
      sessionId: args.sessionId,
      restaurantId: args.restaurantId,
      tableId: args.tableId,
      requestType:
        args.type === "CALL"
          ? "CALL_WAITER"
          : args.type === "BILL"
            ? "REQUEST_BILL"
            : "OTHER",
      status: "PENDING",
      message: args.message,
      requestedAt: new Date().toISOString(),
    });
  },
});

export const acknowledge = mutation({
  args: {
    requestId: v.id("waiterRequests"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const req = await ctx.db.get(args.requestId);
    if (!req || req.restaurantId !== args.restaurantId) {
      throw new ConvexError({ message: "Request not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.requestId, {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date().toISOString(),
    });
  },
});

export const resolve = mutation({
  args: {
    requestId: v.id("waiterRequests"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);
    const req = await ctx.db.get(args.requestId);
    if (!req || req.restaurantId !== args.restaurantId) {
      throw new ConvexError({ message: "Request not found", code: "NOT_FOUND" });
    }
    await ctx.db.patch(args.requestId, {
      status: "RESOLVED",
      resolvedAt: new Date().toISOString(),
      resolvedBy: user._id,
    });
  },
});

export const listPending = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const requests = await ctx.db
      .query("waiterRequests")
      .withIndex("by_restaurant_status", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("status", "PENDING")
      )
      .order("asc")
      .collect();

    const acknowledged = await ctx.db
      .query("waiterRequests")
      .withIndex("by_restaurant_status", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("status", "ACKNOWLEDGED")
      )
      .order("asc")
      .collect();

    const all = [...requests, ...acknowledged];

    return await Promise.all(
      all.map(async (r) => {
        const table = await ctx.db.get(r.tableId);
        return { ...r, tableDisplayName: table?.displayName ?? r.tableId };
      })
    );
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("waiterRequests")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});
