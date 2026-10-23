import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireSuperAdmin } from "./lib/auth";
import { assertRoleSlotAvailable } from "./lib/roleLimits";

export const platformStats = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    const [restaurants, errors, tickets] = await Promise.all([
      ctx.db.query("restaurants").collect(),
      ctx.db
        .query("errorLogs")
        .withIndex("by_status", (q) => q.eq("status", "NEW"))
        .collect(),
      ctx.db
        .query("supportTickets")
        .withIndex("by_status", (q) => q.eq("status", "OPEN"))
        .collect(),
    ]);
    return {
      totalRestaurants: restaurants.length,
      activeRestaurants: restaurants.filter((restaurant) => restaurant.isActive)
        .length,
      newErrorCount: errors.length,
      openTicketCount: tickets.length,
    };
  },
});

export const list = query({
  args: {
    restaurantId: v.optional(v.id("restaurants")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const logs = await ctx.db.query("auditLogs").collect();
    return logs
      .filter(
        (log) => !args.restaurantId || log.restaurantId === args.restaurantId,
      )
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, Math.max(0, args.limit ?? 100));
  },
});

export const listErrors = query({
  args: {
    status: v.optional(
      v.union(v.literal("NEW"), v.literal("REVIEWED"), v.literal("RESOLVED")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const limit = Math.min(200, Math.max(1, Math.floor(args.limit ?? 100)));
    return args.status
      ? await ctx.db
          .query("errorLogs")
          .withIndex("by_status_and_timestamp", (q) =>
            q.eq("status", args.status!),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("errorLogs")
          .withIndex("by_timestamp")
          .order("desc")
          .take(limit);
  },
});

export const updateErrorStatus = mutation({
  args: {
    errorId: v.id("errorLogs"),
    status: v.union(
      v.literal("NEW"),
      v.literal("REVIEWED"),
      v.literal("RESOLVED"),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireSuperAdmin(ctx);
    await ctx.db.patch("errorLogs", args.errorId, {
      status: args.status,
      resolvedAt:
        args.status === "RESOLVED" ? new Date().toISOString() : undefined,
      resolvedBy: args.status === "RESOLVED" ? user._id : undefined,
    });
  },
});

export const listAllUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireSuperAdmin(ctx);
    return ctx.db.query("users").collect();
  },
});

export const assignUserRole = mutation({
  args: {
    userId: v.id("users"),
    role: v.union(
      v.literal("SUPER_ADMIN"),
      v.literal("RESTAURANT_MANAGER"),
      v.literal("RESTAURANT_STAFF"),
    ),
    restaurantId: v.optional(v.id("restaurants")),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    if (args.role !== "SUPER_ADMIN" && !args.restaurantId) {
      throw new Error("A restaurant is required for this role");
    }
    await assertRoleSlotAvailable(ctx, args);
    await ctx.db.patch("users", args.userId, {
      role: args.role,
      restaurantId: args.role === "SUPER_ADMIN" ? undefined : args.restaurantId,
      ...(args.isActive === undefined ? {} : { isActive: args.isActive }),
    });
  },
});

export const setUserActive = mutation({
  args: { userId: v.id("users"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const target = await ctx.db.get("users", args.userId);
    if (args.isActive && target?.role) {
      await assertRoleSlotAvailable(ctx, {
        userId: args.userId,
        role: target.role,
        restaurantId: target.restaurantId,
      });
    }
    if (target?.role === "SUPER_ADMIN" && !args.isActive) {
      const activeAdmins = await ctx.db
        .query("users")
        .withIndex("by_role", (q) => q.eq("role", "SUPER_ADMIN"))
        .take(1000);
      if (
        !activeAdmins.some(
          (user) => user._id !== args.userId && user.isActive !== false,
        )
      ) {
        throw new Error(
          "Assign another Super Admin before deactivating this account",
        );
      }
    }
    await ctx.db.patch("users", args.userId, { isActive: args.isActive });
  },
});

export const listSupportTickets = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("OPEN"),
        v.literal("IN_PROGRESS"),
        v.literal("RESOLVED"),
        v.literal("CLOSED"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    const tickets = args.status
      ? await ctx.db
          .query("supportTickets")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("supportTickets").collect();
    return tickets
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, Math.max(0, args.limit ?? 100));
  },
});

export const updateSupportTicket = mutation({
  args: {
    ticketId: v.id("supportTickets"),
    status: v.union(
      v.literal("OPEN"),
      v.literal("IN_PROGRESS"),
      v.literal("RESOLVED"),
      v.literal("CLOSED"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireSuperAdmin(ctx);
    await ctx.db.patch("supportTickets", args.ticketId, {
      status: args.status,
      notes: args.notes,
      updatedAt: new Date().toISOString(),
      resolvedAt:
        args.status === "RESOLVED" ? new Date().toISOString() : undefined,
    });
  },
});

export const platformRevenue = query({
  args: { days: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ date: string; revenue: number }>> => {
    await requireSuperAdmin(ctx);

    const since = new Date();
    since.setDate(since.getDate() - args.days);

    const payments = await ctx.db.query("payments").collect();
    const paid = payments.filter(
      (p) =>
        p.status === "PAID" &&
        p.completedAt &&
        new Date(p.completedAt) >= since,
    );

    const byDay: Record<string, number> = {};
    for (let i = 0; i < args.days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      byDay[d.toISOString().slice(0, 10)] = 0;
    }
    for (const p of paid) {
      const day = p.completedAt!.slice(0, 10);
      if (day in byDay) byDay[day] = (byDay[day] ?? 0) + p.amount;
    }

    return Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, revenue]) => ({ date, revenue }));
  },
});

export const restaurantGrowth = query({
  args: { months: v.number() },
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ month: string; count: number }>> => {
    await requireSuperAdmin(ctx);

    const restaurants = await ctx.db.query("restaurants").collect();

    const byMonth: Record<string, number> = {};
    for (let i = 0; i < args.months; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      byMonth[d.toISOString().slice(0, 7)] = 0;
    }

    for (const r of restaurants) {
      const month = new Date(r._creationTime).toISOString().slice(0, 7);
      if (month in byMonth) byMonth[month] = (byMonth[month] ?? 0) + 1;
    }

    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count }));
  },
});
