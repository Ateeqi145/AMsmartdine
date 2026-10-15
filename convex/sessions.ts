import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRestaurantAccess, requireRestaurantManager } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";

/** List active sessions with table details (for manager dashboard) */
export const listActiveSessions = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args): Promise<Array<Doc<"sessions"> & { tableNumber: string }>> => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_restaurant_status", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("status", "ACTIVE"),
      )
      .collect();

    return await Promise.all(
      sessions.map(async (s) => {
        const table = await ctx.db.get("tables", s.tableId);
        return { ...s, tableNumber: table?.tableNumber ?? s.tableId };
      }),
    );
  },
});

/** Get active session for a table */
export const getActiveForTable = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_table_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE"),
      )
      .first();
  },
});

/** Public: get session by ID (for customer) */
export const getById = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session) return null;
    const table = await ctx.db.get("tables", session.tableId);
    const restaurant = await ctx.db.get("restaurants", session.restaurantId);
    return { session, table, restaurant };
  },
});

/**
 * Public: customer scans QR → opens a new session or joins the existing active one.
 * Returns { sessionId, isNew }
 */
export const openOrJoinSession = mutation({
  args: {
    tableId: v.id("tables"),
    restaurantId: v.id("restaurants"),
    customerCount: v.number(), // number of people joining (used when creating a new session)
  },
  handler: async (ctx, args) => {
    // Enforce one active session per table
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_table_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE"),
      )
      .first();

    if (existing) {
      // Join existing session — increment customer count
      await ctx.db.patch("sessions", existing._id, {
        customerCount: existing.customerCount + args.customerCount,
      });
      return { sessionId: existing._id, isNew: false };
    }

    // Open a new session with daily customer count tracking
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    // Sum all sessions opened today for this restaurant for daily customer count
    const sessionId = await ctx.db.insert("sessions", {
      restaurantId: args.restaurantId,
      tableId: args.tableId,
      status: "ACTIVE",
      customerCount: args.customerCount,
      openedAt: new Date().toISOString(),
    });

    return { sessionId, isNew: true };
  },
});

/** Open a new session for a table (internal — kept for backward compat) */
export const openSession = mutation({
  args: {
    tableId: v.id("tables"),
    restaurantId: v.id("restaurants"),
    customerCount: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_table_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE"),
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("sessions", {
      restaurantId: args.restaurantId,
      tableId: args.tableId,
      status: "ACTIVE",
      customerCount: args.customerCount,
      openedAt: new Date().toISOString(),
    });
  },
});

/** Manager: close a session (table is free, QR reusable) */
export const closeSession = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.restaurantId !== args.restaurantId) {
      throw new ConvexError({ message: "Session not found", code: "NOT_FOUND" });
    }
    if ((session.paidAmount ?? 0) < (session.totalAmount ?? 0)) {
      throw new ConvexError({
        message: "The bill must be fully paid before closing the session",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch("sessions", args.sessionId, {
      status: "CLOSED",
      closedAt: new Date().toISOString(),
    });
    return null;
  },
});

/** Customer or manager: request bill */
export const requestBill = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch("sessions", args.sessionId, {
      status: "BILLING",
      billRequestedAt: new Date().toISOString(),
    });
  },
});
