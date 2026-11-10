import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireRestaurantManager } from "./lib/auth";

const reportOrderType = v.union(
  v.literal("DINE_IN"),
  v.literal("DELIVERY"),
);

export const dailyRevenue = query({
  args: {
    restaurantId: v.id("restaurants"),
    days: v.number(),
    orderType: reportOrderType,
  },
  returns: v.array(
    v.object({ date: v.string(), revenue: v.number() }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ date: string; revenue: number }>> => {
    await requireRestaurantManager(ctx, args.restaurantId);

    const since = new Date();
    since.setDate(since.getDate() - args.days);
    since.setHours(0, 0, 0, 0);

    const [orders, payments] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_restaurant", (q) =>
          q.eq("restaurantId", args.restaurantId),
        )
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_restaurant", (q) =>
          q.eq("restaurantId", args.restaurantId),
        )
        .collect(),
    ]);
    const orderTypes = new Map(
      orders.map((order) => [
        order._id,
        order.orderType ?? (order.sessionId ? "DINE_IN" : undefined),
      ]),
    );

    const paid = payments.filter(
      (p) =>
        p.status === "PAID" &&
        p.completedAt &&
        new Date(p.completedAt) >= since &&
        (p.orderId
          ? orderTypes.get(p.orderId) === args.orderType
          : args.orderType === "DINE_IN" && Boolean(p.sessionId)),
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
  args: {
    restaurantId: v.id("restaurants"),
    limit: v.number(),
    orderType: reportOrderType,
  },
  returns: v.array(
    v.object({
      name: v.string(),
      count: v.number(),
      revenue: v.number(),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<Array<{ name: string; count: number; revenue: number }>> => {
    await requireRestaurantManager(ctx, args.restaurantId);

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .collect();

    const itemMap: Record<string, { count: number; revenue: number }> = {};
    for (const order of orders) {
      if (
        order.status === "CANCELLED" ||
        (order.orderType ?? (order.sessionId ? "DINE_IN" : undefined)) !==
          args.orderType
      ) {
        continue;
      }
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
  args: {
    restaurantId: v.id("restaurants"),
    orderType: reportOrderType,
  },
  returns: v.object({
    avgDurationMinutes: v.number(),
    avgOrderValue: v.number(),
    totalOrdersToday: v.number(),
    totalRevenueToday: v.number(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    avgDurationMinutes: number;
    avgOrderValue: number;
    totalOrdersToday: number;
    totalRevenueToday: number;
  }> => {
    await requireRestaurantManager(ctx, args.restaurantId);

    const todayStr = new Date().toISOString().slice(0, 10);

    const [allSessions, todayOrders] = await Promise.all([
      args.orderType === "DINE_IN"
        ? ctx.db
            .query("sessions")
            .withIndex("by_restaurant", (q) =>
              q.eq("restaurantId", args.restaurantId),
            )
            .collect()
        : Promise.resolve([]),
      ctx.db
        .query("orders")
        .withIndex("by_restaurant", (q) =>
          q.eq("restaurantId", args.restaurantId),
        )
        .collect(),
    ]);

    const avgDuration =
      args.orderType === "DINE_IN"
        ? (() => {
            const closedSessions = allSessions.filter(
              (session) => session.status === "CLOSED" && session.closedAt,
            );
            return closedSessions.length > 0
              ? closedSessions.reduce((sum, session) => {
                  const minutes =
                    (new Date(session.closedAt!).getTime() -
                      new Date(session.openedAt).getTime()) /
                    60000;
                  return sum + minutes;
                }, 0) / closedSessions.length
              : 0;
          })()
        : (() => {
            const deliveredOrders = todayOrders.filter(
              (order) =>
                order.orderType === "DELIVERY" &&
                order.status === "DELIVERED" &&
                order.deliveredAt,
            );
            return deliveredOrders.length > 0
              ? deliveredOrders.reduce(
                  (sum, order) =>
                    sum +
                    (new Date(order.deliveredAt!).getTime() -
                      new Date(order.placedAt).getTime()) /
                      60000,
                  0,
                ) / deliveredOrders.length
              : 0;
          })();

    const todayFiltered = todayOrders.filter(
      (order) =>
        order.placedAt.slice(0, 10) === todayStr &&
        order.status !== "CANCELLED" &&
        (order.orderType ??
          (order.sessionId ? "DINE_IN" : undefined)) === args.orderType,
    );

    const totalToday = todayFiltered.length;
    const revenueToday = todayFiltered.reduce((s, o) => s + o.total, 0);
    const avgOrderValue = totalToday > 0 ? revenueToday / totalToday : 0;

    return {
      avgDurationMinutes: Math.round(avgDuration),
      avgOrderValue: Math.round(avgOrderValue),
      totalOrdersToday: totalToday,
      totalRevenueToday: revenueToday,
    };
  },
});
