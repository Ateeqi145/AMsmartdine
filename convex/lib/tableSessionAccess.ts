import { ConvexError } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type SessionReadContext = QueryCtx | MutationCtx;

export async function resolveTableSessionHost(
  ctx: SessionReadContext,
  session: Doc<"sessions">,
): Promise<string | null> {
  if (session.hostCustomerId) return session.hostCustomerId;

  const orders = await ctx.db
    .query("orders")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .order("asc")
    .take(500);
  const firstOrder = orders.find((order) => order.customerId);
  if (firstOrder?.customerId) return firstOrder.customerId;

  const visitors = await ctx.db
    .query("sessionVisitors")
    .withIndex("by_session_and_customer", (q) => q.eq("sessionId", session._id))
    .take(500);
  visitors.sort(
    (left, right) =>
      left.joinedAt.localeCompare(right.joinedAt) ||
      left._creationTime - right._creationTime,
  );
  const firstVisitor = visitors[0];
  if (firstVisitor) return firstVisitor.customerId;

  const cartItems = await ctx.db
    .query("cartItems")
    .withIndex("by_session", (q) => q.eq("sessionId", session._id))
    .order("asc")
    .take(500);
  const firstCartItem = cartItems.find((item) => item.addedBy);
  return firstCartItem?.addedBy ?? null;
}

export async function isTableSessionHost(
  ctx: SessionReadContext,
  session: Doc<"sessions">,
  customerId: string,
): Promise<boolean> {
  if (customerId.length < 1 || customerId.length > 100) return false;
  return (await resolveTableSessionHost(ctx, session)) === customerId;
}

export async function requireTableSessionHost(
  ctx: MutationCtx,
  session: Doc<"sessions">,
  customerId: string,
) {
  if (!(await isTableSessionHost(ctx, session, customerId))) {
    throw new ConvexError({
      message:
        "Only the customer who opened this table session can manage its cart and orders.",
      code: "FORBIDDEN",
    });
  }
  if (!session.hostCustomerId) {
    await ctx.db.patch("sessions", session._id, {
      hostCustomerId: customerId,
    });
  }
}
