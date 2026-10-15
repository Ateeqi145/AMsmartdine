import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRestaurantAccess } from "./lib/auth";

export const dailyRevenue = query({
  args: { restaurantId: v.id("restaurants"), days: v.number() },
  handler: async (ctx, args): Promise<Array<{ date: string; revenue: number }>> => {
    await requireRestaurantAccess(ctx, args.restaurantId);

    const since = new Date();
    since.setDate(since.getDate() - args.days);
    since.setHours(0, 0, 0, 0);

    const payments = await ctx.db
      .query("payments")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId)
      )
      .collect();

    const paid = payments.filter(
      (p) => p.status === "PAID" && p.completedAt && new Date(p.completedAt) >= since
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

export const topMenuItems = query({
  args: { restaurantId: v.id("restaurants"), limit: v.number() },
  handler: async (
    ctx,
    args
  ): Promise<Array<{ name: string; count: number; revenue: number }>> => {
    await requireRestaurantAccess(ctx, args.restaurantId);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId)
      )
      .collect();

    const itemMap: Record<string, { count: number; revenue: number }> = {};
    for (const order of orders) {
      if (order.status === "CANCELLED") continue;
      for (const item of order.items) {
        const existing = itemMap[item.name] ?? { count: 0, revenue: 0 };
        itemMap[item.name] = {
          count: existing.count + item.quantity,
          revenue: existing.revenue + item.price * item.quantity,
        };
      }
    }

    return Object.entries(itemMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, args.limit);
  },
});

export const sessionStats = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (
    ctx,
    args
  ): Promise<{
    avgDurationMinutes: number;
    avgOrderValue: number;
    totalOrdersToday: number;
    totalRevenueToday: number;
  }> => {
    await requireRestaurantAccess(ctx, args.restaurantId);

    const todayStr = new Date().toISOString().slice(0, 10);

    const allSessions = await ctx.db
      .query("sessions")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId)
      )
      .collect();

    const closedSessions = allSessions.filter(
      (s) => s.status === "CLOSED" && s.closedAt
    );

    const avgDuration =
      closedSessions.length > 0
        ? closedSessions.reduce((sum, s) => {
            const mins =
              (new Date(s.closedAt!).getTime() -
                new Date(s.openedAt).getTime()) /
              60000;
            return sum + mins;
          }, 0) / closedSessions.length
        : 0;

    const todayOrders = await ctx.db
      .query("orders")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId)
      )
      .collect();

    const todayFiltered = todayOrders.filter(
      (o) =>
        o.placedAt.slice(0, 10) === todayStr && o.status !== "CANCELLED"
    );

    const totalToday = todayFiltered.length;
    const revenueToday = todayFiltered.reduce((s, o) => s + o.total, 0);
    const avgOrderValue =
      totalToday > 0 ? revenueToday / totalToday : 0;

    return {
      avgDurationMinutes: Math.round(avgDuration),
      avgOrderValue: Math.round(avgOrderValue),
      totalOrdersToday: totalToday,
      totalRevenueToday: revenueToday,
    };
  },
});
