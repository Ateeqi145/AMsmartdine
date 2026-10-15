import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, generateRequestId } from "./lib/auth";

const runtimeErrorCode = v.union(
  v.literal("CLIENT_UNHANDLED_ERROR"),
  v.literal("CLIENT_UNHANDLED_REJECTION"),
  v.literal("ASSET_LOAD_FAILED"),
  v.literal("BACKEND_CONNECTION_FAILED"),
);

const DIAGNOSIS: Record<
  | "CLIENT_UNHANDLED_ERROR"
  | "CLIENT_UNHANDLED_REJECTION"
  | "ASSET_LOAD_FAILED"
  | "BACKEND_CONNECTION_FAILED",
  {
    title: string;
    cause: string;
    action: string;
    feature: string;
    module: string;
  }
> = {
  CLIENT_UNHANDLED_ERROR: {
    title: "Uncaught browser error",
    cause:
      "A JavaScript error escaped the page's normal error handling. The report intentionally omits raw messages and stack traces to avoid storing customer data.",
    action:
      "Open the affected page and check the browser console and deployment logs. Reproduce with the same account and steps.",
    feature: "Web application",
    module: "client",
  },
  CLIENT_UNHANDLED_REJECTION: {
    title: "Unhandled asynchronous error",
    cause:
      "An asynchronous operation rejected without a handler. This can indicate a missed error path, expired session, or failed network request.",
    action:
      "Check the route and Convex logs around the timestamp. Reproduce the action and ensure the UI shows a recoverable error.",
    feature: "Web application",
    module: "client",
  },
  ASSET_LOAD_FAILED: {
    title: "Page asset failed to load",
    cause:
      "The browser could not load a JavaScript chunk or other required page asset. A stale browser cache or incomplete deployment can cause this.",
    action:
      "Confirm the latest Vercel deployment is ready, then hard-refresh the affected page. If it continues, inspect Vercel build output and asset URLs.",
    feature: "Web deployment",
    module: "client",
  },
  BACKEND_CONNECTION_FAILED: {
    title: "Backend connection failed",
    cause:
      "The browser lost connectivity to the configured Convex deployment or a request could not reach the backend.",
    action:
      "Check VITE_CONVEX_URL in the Vercel environment for this deployment, verify the Convex deployment is available, and redeploy the frontend after changing build variables.",
    feature: "Backend connectivity",
    module: "client",
  },
};

export const report = mutation({
  args: {
    errorCode: runtimeErrorCode,
    route: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const user = await requireUser(ctx);
    const diagnosis = DIAGNOSIS[args.errorCode];
    const route = args.route.startsWith("/")
      ? args.route
          .split(/[?#]/, 1)[0]
          .replace(/^\/table\/[^/]+/, "/table/:qrToken")
          .replace(
            /^\/super-admin\/restaurants\/[^/]+/,
            "/super-admin/restaurants/:restaurantId",
          )
          .slice(0, 160)
      : "/";
    const fingerprint = `${args.errorCode}:${route}`;
    const now = new Date().toISOString();
    const recentDuplicate = await ctx.db
      .query("errorLogs")
      .withIndex("by_reporter_fingerprint", (q) =>
        q.eq("reporterId", user._id).eq("fingerprint", fingerprint),
      )
      .order("desc")
      .first();

    if (
      recentDuplicate?.lastSeenAt &&
      Date.now() - new Date(recentDuplicate.lastSeenAt).getTime() <
        5 * 60 * 1000
    ) {
      if (
        Date.now() - new Date(recentDuplicate.lastSeenAt).getTime() >=
        30_000
      ) {
        await ctx.db.patch("errorLogs", recentDuplicate._id, {
          occurrences: Math.min((recentDuplicate.occurrences ?? 1) + 1, 1000),
          lastSeenAt: now,
          status: "NEW",
          resolvedAt: undefined,
          resolvedBy: undefined,
        });
      }
      return true;
    }

    const recentReports = await ctx.db
      .query("errorLogs")
      .withIndex("by_reporter_last_seen", (q) => q.eq("reporterId", user._id))
      .order("desc")
      .take(20);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const reportsThisHour = recentReports.filter(
      (entry) =>
        entry.lastSeenAt && new Date(entry.lastSeenAt).getTime() >= hourAgo,
    ).length;
    if (reportsThisHour >= 10) return false;

    await ctx.db.insert("errorLogs", {
      reporterId: user._id,
      restaurantId: user.restaurantId,
      userRole: user.role,
      feature: diagnosis.feature,
      module: diagnosis.module,
      errorCode: args.errorCode,
      message: diagnosis.title,
      cause: diagnosis.cause,
      action: `${diagnosis.action} Affected page: ${route}`,
      fingerprint,
      occurrences: 1,
      lastSeenAt: now,
      timestamp: now,
      requestId: generateRequestId(),
      environment: "browser",
      status: "NEW",
    });
    return true;
  },
});
