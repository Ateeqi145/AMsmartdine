import { mutation, query } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { requireRestaurantAccess, requireRestaurantManager } from "./lib/auth";
import type { Doc } from "./_generated/dataModel";
import { recordCustomerAction } from "./lib/staffNotifications";
import { closeSessionWhenSettled } from "./lib/sessionLifecycle";

/** List active sessions with table details (for manager dashboard) */
export const listActiveSessions = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (
    ctx,
    args,
  ): Promise<Array<Doc<"sessions"> & { tableNumber: string }>> => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    const [active, billing] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_restaurant_status", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("status", "ACTIVE"),
        )
        .take(200),
      ctx.db
        .query("sessions")
        .withIndex("by_restaurant_status", (q) =>
          q.eq("restaurantId", args.restaurantId).eq("status", "BILLING"),
        )
        .take(200),
    ]);
    const sessions = [...active, ...billing];

    const sessionsWithTables = await Promise.all(
      sessions.map(async (s) => {
        const table = await ctx.db.get("tables", s.tableId);
        if (!table || table.restaurantId !== args.restaurantId) return null;
        return { ...s, tableNumber: table.tableNumber };
      }),
    );
    return sessionsWithTables.filter((session) => session !== null);
  },
});

/** Get active session for a table */
export const getActiveForTable = query({
  args: { tableId: v.id("tables") },
  handler: async (ctx, args) => {
    const active = await ctx.db
      .query("sessions")
      .withIndex("by_table_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE"),
      )
      .first();
    if (active) return active;
    return await ctx.db
      .query("sessions")
      .withIndex("by_table_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "BILLING"),
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
    customerId: v.string(),
  },
  returns: v.object({ sessionId: v.id("sessions"), isNew: v.boolean() }),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.customerCount) || args.customerCount < 1) {
      throw new ConvexError({
        message: "Customer count must be at least one",
        code: "BAD_REQUEST",
      });
    }
    const table = await ctx.db.get("tables", args.tableId);
    const restaurant = await ctx.db.get("restaurants", args.restaurantId);
    if (
      !table ||
      table.restaurantId !== args.restaurantId ||
      !table.isActive ||
      !restaurant?.isActive
    ) {
      throw new ConvexError({
        message: "Table is unavailable",
        code: "BAD_REQUEST",
      });
    }

    const [active, billing] = await Promise.all([
      ctx.db
        .query("sessions")
        .withIndex("by_table_status", (q) =>
          q.eq("tableId", args.tableId).eq("status", "ACTIVE"),
        )
        .first(),
      ctx.db
        .query("sessions")
        .withIndex("by_table_status", (q) =>
          q.eq("tableId", args.tableId).eq("status", "BILLING"),
        )
        .first(),
    ]);
    const existing = active ?? billing;

    if (existing) {
      const alreadyJoined = await ctx.db
        .query("sessionVisitors")
        .withIndex("by_session_and_customer", (q) =>
          q.eq("sessionId", existing._id).eq("customerId", args.customerId),
        )
        .first();
      if (!alreadyJoined) {
        throw new ConvexError({
          message:
            "This table is occupied. Please ask the staff for assistance.",
          code: "FORBIDDEN",
        });
      }
      return { sessionId: existing._id, isNew: false };
    }

    const sessionId = await ctx.db.insert("sessions", {
      restaurantId: args.restaurantId,
      tableId: args.tableId,
      status: "ACTIVE",
      customerCount: args.customerCount,
      openedAt: new Date().toISOString(),
    });
    await ctx.db.insert("sessionVisitors", {
      sessionId,
      customerId: args.customerId,
      joinedAt: new Date().toISOString(),
    });
    await recordCustomerAction(ctx, {
      restaurantId: args.restaurantId,
      sessionId,
      tableId: args.tableId,
      eventType: "TABLE_SESSION_OPENED",
      message: `A customer opened a table session at ${table.displayName ?? table.tableNumber}.`,
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

/** Staff: confirm payment and immediately close the table session. */
export const markBillPaid = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);
    const session = await ctx.db.get("sessions", args.sessionId);
    if (
      !session ||
      session.restaurantId !== args.restaurantId ||
      session.status === "CLOSED"
    ) {
      throw new ConvexError({
        message: "This table session is no longer active.",
        code: "BAD_REQUEST",
      });
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const activeOrders = orders.filter((order) => order.status !== "CANCELLED");
    if (
      activeOrders.length === 0 ||
      activeOrders.some(
        (order) =>
          order.status === "PENDING" ||
          order.status === "CONFIRMED" ||
          order.status === "PREPARING",
      )
    ) {
      throw new ConvexError({
        message:
          "All orders must be ready before the bill can be marked paid.",
        code: "BAD_REQUEST",
      });
    }

    const totalAmount = activeOrders.reduce(
      (total, order) => total + order.total,
      0,
    );
    const now = new Date().toISOString();
    await ctx.db.patch("sessions", args.sessionId, {
      status: "CLOSED",
      totalAmount,
      paidAmount: totalAmount,
      closedAt: now,
      billClosedAt: now,
      billClosedBy: user._id,
    });
    return null;
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
    const user = await requireRestaurantManager(ctx, args.restaurantId);
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.restaurantId !== args.restaurantId) {
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    }
    if ((session.paidAmount ?? 0) < (session.totalAmount ?? 0)) {
      throw new ConvexError({
        message: "The bill must be fully paid before closing the session",
        code: "BAD_REQUEST",
      });
    }
    if (!(await closeSessionWhenSettled(ctx, args.sessionId, user._id))) {
      throw new ConvexError({
        message:
          "All non-cancelled orders must be delivered before closing the session",
        code: "BAD_REQUEST",
      });
    }
    return null;
  },
});

/** Customer or manager: request bill */
export const requestBill = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (
      !session ||
      session.restaurantId !== args.restaurantId ||
      session.status !== "ACTIVE"
    ) {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }
    const now = new Date().toISOString();
    await ctx.db.patch("sessions", args.sessionId, {
      status: "BILLING",
      billRequestedAt: now,
    });
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      eventType: "BILL_REQUESTED",
      message: "Customer requested the bill.",
    });
    return null;
  },
});
