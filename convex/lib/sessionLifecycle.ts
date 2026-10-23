import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function closeSessionWhenSettled(
  ctx: MutationCtx,
  sessionId: Id<"sessions">,
  closedBy?: Id<"users">,
) {
  const session = await ctx.db.get("sessions", sessionId);
  if (
    !session ||
    session.status === "CLOSED" ||
    (session.totalAmount ?? 0) <= 0 ||
    (session.paidAmount ?? 0) < (session.totalAmount ?? 0)
  ) {
    return false;
  }

  const undeliveredStatuses = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
  ] as const;
  for (const status of undeliveredStatuses) {
    const undelivered = await ctx.db
      .query("orders")
      .withIndex("by_session_and_status", (q) =>
        q.eq("sessionId", sessionId).eq("status", status),
      )
      .first();
    if (undelivered) return false;
  }

  const deliveredOrder = await ctx.db
    .query("orders")
    .withIndex("by_session_and_status", (q) =>
      q.eq("sessionId", sessionId).eq("status", "DELIVERED"),
    )
    .first();
  if (!deliveredOrder) return false;

  const now = new Date().toISOString();
  await ctx.db.patch("sessions", sessionId, {
    status: "CLOSED",
    closedAt: now,
    billClosedAt: now,
    ...(closedBy ? { billClosedBy: closedBy } : {}),
  });
  return true;
}
