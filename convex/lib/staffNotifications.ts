import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export type CustomerActionType =
  | "TABLE_SESSION_OPENED"
  | "CART_CHANGED"
  | "ORDER_PLACED"
  | "ORDER_CANCELLED"
  | "WAITER_REQUESTED"
  | "BILL_REQUESTED"
  | "CASH_PAYMENT_REQUESTED"
  | "PAYMENT_CONFIRMED"
  | "WATER_REQUESTED"
  | "FEEDBACK_SUBMITTED";

export async function recordCustomerAction(
  ctx: MutationCtx,
  event: {
    restaurantId: Id<"restaurants">;
    sessionId: Id<"sessions">;
    tableId: Id<"tables">;
    eventType: CustomerActionType;
    message: string;
    orderId?: Id<"orders">;
  },
) {
  await ctx.db.insert("staffNotifications", {
    ...event,
    createdAt: new Date().toISOString(),
  });

  const recent = await ctx.db
    .query("staffNotifications")
    .withIndex("by_restaurant_and_created_at", (q) =>
      q.eq("restaurantId", event.restaurantId),
    )
    .order("desc")
    .take(101);
  for (const oldNotification of recent.slice(100)) {
    await ctx.db.delete("staffNotifications", oldNotification._id);
  }
}
