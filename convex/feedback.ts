import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { recordCustomerAction } from "./lib/staffNotifications";

export const hasSubmitted = query({
  args: { sessionId: v.id("sessions") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session) return false;
    const featureFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "feedback"),
      )
      .unique();
    if (featureFlag?.enabled === false) return false;

    return Boolean(
      await ctx.db
        .query("feedback")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .first(),
    );
  },
});

export const submit = mutation({
  args: {
    sessionId: v.id("sessions"),
    rating: v.number(),
    comment: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!Number.isInteger(args.rating) || args.rating < 1 || args.rating > 5) {
      throw new ConvexError({
        message: "Rating must be from 1 to 5",
        code: "BAD_REQUEST",
      });
    }

    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session) {
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    }
    const featureFlag = await ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant_key", (q) =>
        q.eq("restaurantId", session.restaurantId).eq("key", "feedback"),
      )
      .unique();
    if (featureFlag?.enabled === false) {
      throw new ConvexError({
        message: "Feedback is not enabled",
        code: "BAD_REQUEST",
      });
    }
    if (
      session.status !== "CLOSED" ||
      (session.totalAmount ?? 0) <= 0 ||
      (session.paidAmount ?? 0) < (session.totalAmount ?? 0)
    ) {
      throw new ConvexError({
        message:
          "Feedback is available after the bill is fully paid and the session is closed",
        code: "BAD_REQUEST",
      });
    }

    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
    if (existing) {
      throw new ConvexError({
        message: "Feedback has already been submitted",
        code: "BAD_REQUEST",
      });
    }

    await ctx.db.insert("feedback", {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      rating: args.rating,
      comment: args.comment?.trim() || undefined,
      tags: args.tags,
      submittedAt: new Date().toISOString(),
    });
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      eventType: "FEEDBACK_SUBMITTED",
      message: `Customer submitted a ${args.rating}-star rating.`,
    });
    return null;
  },
});
