import {
  mutation,
  query,
  action,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { v, ConvexError } from "convex/values";
import {
  requireRestaurantAccess,
  requireRestaurantManager,
  generateRequestId,
} from "./lib/auth";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { recordCustomerAction } from "./lib/staffNotifications";
import { closeSessionWhenSettled } from "./lib/sessionLifecycle";

// ─── Internal helpers (not exposed to frontend) ───────────────────

export const _getSession = internalQuery({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => ctx.db.get("sessions", args.sessionId),
});

export const _getRestaurant = internalQuery({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => ctx.db.get("restaurants", args.restaurantId),
});

export const _getDeliveryOrderForPayment = internalQuery({
  args: {
    orderId: v.id("orders"),
    customerId: v.id("users"),
  },
  returns: v.union(
    v.null(),
    v.object({
      orderId: v.id("orders"),
      restaurantId: v.id("restaurants"),
      amount: v.number(),
      currency: v.string(),
      razorpayKeyId: v.optional(v.string()),
      paymentStatus: v.optional(
        v.union(
          v.literal("UNPAID"),
          v.literal("PENDING"),
          v.literal("PAID"),
          v.literal("FAILED"),
        ),
      ),
      deliveryPaymentMethod: v.optional(
        v.union(v.literal("ONLINE"), v.literal("COD")),
      ),
      isCancelled: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.orderType !== "DELIVERY" ||
      order.customerUserId !== args.customerId
    ) {
      return null;
    }
    const restaurant = await ctx.db.get("restaurants", order.restaurantId);
    if (!restaurant || !restaurant.isActive) return null;
    return {
      orderId: order._id,
      restaurantId: order.restaurantId,
      amount: order.total,
      currency: restaurant.currency ?? "INR",
      razorpayKeyId: restaurant.razorpayKeyId,
      paymentStatus: order.paymentStatus,
      deliveryPaymentMethod: order.deliveryPaymentMethod,
      isCancelled: order.status === "CANCELLED",
    };
  },
});

export const _createDeliveryPaymentRecord = internalMutation({
  args: {
    orderId: v.id("orders"),
    restaurantId: v.id("restaurants"),
    amount: v.number(),
    razorpayOrderId: v.string(),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !order ||
      order.status === "CANCELLED" ||
      order.restaurantId !== args.restaurantId ||
      order.deliveryPaymentMethod !== "ONLINE" ||
      order.total !== args.amount ||
      order.paymentStatus === "PAID"
    ) {
      throw new ConvexError({
        message: "This delivery order is no longer available for payment.",
        code: "BAD_REQUEST",
      });
    }
    return await ctx.db.insert("payments", {
      restaurantId: args.restaurantId,
      orderId: args.orderId,
      amount: args.amount,
      method: "UPI",
      status: "PENDING",
      razorpayOrderId: args.razorpayOrderId,
      initiatedAt: new Date().toISOString(),
      requestId: generateRequestId(),
    });
  },
});

export const _markDeliveryOrderPaid = internalMutation({
  args: {
    paymentId: v.id("payments"),
    orderId: v.id("orders"),
    customerId: v.id("users"),
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get("payments", args.paymentId);
    const order = await ctx.db.get("orders", args.orderId);
    if (
      !payment ||
      !order ||
      payment.orderId !== order._id ||
      payment.restaurantId !== order.restaurantId ||
      order.customerUserId !== args.customerId ||
      order.orderType !== "DELIVERY" ||
      order.deliveryPaymentMethod !== "ONLINE" ||
      order.status === "CANCELLED"
    ) {
      throw new ConvexError({
        message: "Payment does not belong to this order.",
        code: "FORBIDDEN",
      });
    }
    if (
      payment.status !== "PENDING" ||
      order.paymentStatus === "PAID" ||
      payment.razorpayOrderId !== args.razorpayOrderId ||
      payment.amount !== order.total
    ) {
      throw new ConvexError({
        message: "Payment details do not match this order.",
        code: "BAD_REQUEST",
      });
    }
    const now = new Date().toISOString();
    await ctx.db.patch("payments", payment._id, {
      status: "PAID",
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
      completedAt: now,
    });
    await ctx.db.patch("orders", order._id, { paymentStatus: "PAID" });
    await recordCustomerAction(ctx, {
      restaurantId: order.restaurantId,
      orderId: order._id,
      eventType: "ORDER_PLACED",
      message: `New paid home delivery order received #${order._id.slice(-5).toUpperCase()}.`,
    });
    return null;
  },
});

export const _getFeatureFlags = internalQuery({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("featureFlags")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .collect();
  },
});

export const _getRemainingBalance = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session)
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    if (session.status === "CLOSED") {
      throw new ConvexError({
        message: "Session is already closed",
        code: "BAD_REQUEST",
      });
    }

    const orders = await ctx.db
      .query("orders")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const orderTotal = orders
      .filter((order) => order.status !== "CANCELLED")
      .reduce((sum, order) => sum + order.total, 0);
    const paidAmount = payments
      .filter((payment) => payment.status === "PAID")
      .reduce((sum, payment) => sum + payment.amount, 0);
    return Math.max(0, orderTotal - paidAmount);
  },
});

export const _createPaymentRecord = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
    amount: v.number(),
    method: v.union(v.literal("UPI"), v.literal("CARD"), v.literal("CASH")),
    razorpayOrderId: v.optional(v.string()),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("payments", {
      restaurantId: args.restaurantId,
      sessionId: args.sessionId,
      amount: args.amount,
      method: args.method,
      status: "PENDING",
      razorpayOrderId: args.razorpayOrderId,
      initiatedAt: new Date().toISOString(),
      requestId: generateRequestId(),
    });
    return id;
  },
});

export const _markPaymentPaid = internalMutation({
  args: {
    paymentId: v.id("payments"),
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
    method: v.union(v.literal("UPI"), v.literal("CARD")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const payment = await ctx.db.get("payments", args.paymentId);
    if (!payment)
      throw new ConvexError({
        message: "Payment not found",
        code: "NOT_FOUND",
      });
    if (payment.status !== "PENDING") {
      throw new ConvexError({
        message: "Payment has already been processed",
        code: "BAD_REQUEST",
      });
    }
    if (!payment.sessionId) {
      throw new ConvexError({
        message: "This payment is not associated with a table session.",
        code: "BAD_REQUEST",
      });
    }
    if (
      payment.razorpayOrderId !== args.razorpayOrderId ||
      payment.method !== args.method
    ) {
      throw new ConvexError({
        message: "Payment details do not match",
        code: "BAD_REQUEST",
      });
    }

    const session = await ctx.db.get("sessions", payment.sessionId);
    if (!session || session.status === "CLOSED") {
      throw new ConvexError({
        message: "Session is already closed",
        code: "BAD_REQUEST",
      });
    }
    const [orders, payments] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_session", (q) => q.eq("sessionId", payment.sessionId))
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_session", (q) => q.eq("sessionId", payment.sessionId))
        .collect(),
    ]);
    const orderTotal = orders
      .filter((order) => order.status !== "CANCELLED")
      .reduce((sum, order) => sum + order.total, 0);
    const alreadyPaid = payments
      .filter((record) => record.status === "PAID")
      .reduce((sum, record) => sum + record.amount, 0);
    if (payment.amount > Math.max(0, orderTotal - alreadyPaid)) {
      throw new ConvexError({
        message: "Payment exceeds the remaining balance",
        code: "BAD_REQUEST",
      });
    }

    const now = new Date().toISOString();
    await ctx.db.patch("payments", args.paymentId, {
      status: "PAID",
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
      method: args.method,
      completedAt: now,
    });
    // Update session paidAmount
    await ctx.db.patch("sessions", payment.sessionId, {
      paidAmount: alreadyPaid + payment.amount,
    });
    await recordCustomerAction(ctx, {
      restaurantId: payment.restaurantId,
      sessionId: payment.sessionId,
      tableId: session.tableId,
      eventType: "PAYMENT_CONFIRMED",
      message: `Customer payment of ₹${(payment.amount / 100).toFixed(2)} was confirmed online.`,
    });
    await closeSessionWhenSettled(ctx, payment.sessionId);
    return null;
  },
});

// ─── Public Queries ───────────────────────────────────────────────

/** Get payments for a session (public — for customer bill view) */
export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();
  },
});

/** Manager: payments for a restaurant */
export const listByRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return ctx.db
      .query("payments")
      .withIndex("by_restaurant", (q) =>
        q.eq("restaurantId", args.restaurantId),
      )
      .order("desc")
      .take(200);
  },
});

/**
 * Full bill summary for a session.
 * - Order total (non-cancelled orders)
 * - Paid amount
 * - Remaining
 * - 1-hour visibility window on payment records
 */
export const getBillSummary = query({
  args: { sessionId: v.id("sessions") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    session: Doc<"sessions">;
    table: Doc<"tables"> | null;
    restaurant:
      (Doc<"restaurants"> & { paymentQrUrl?: string | undefined }) | null;
    onlinePaymentEnabled: boolean;
    feedbackEnabled: boolean;
    orders: Doc<"orders">[];
    payments: Doc<"payments">[];
    orderTotal: number;
    paidAmount: number;
    remaining: number;
    cashPaymentRequested: boolean;
    ordersDelivered: boolean;
  }> => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session)
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });

    const [
      table,
      restaurantRecord,
      allOrders,
      allPayments,
      waiterRequests,
      onlinePaymentFlag,
      feedbackFlag,
    ] = await Promise.all([
      ctx.db.get("tables", session.tableId),
      ctx.db.get("restaurants", session.restaurantId),
      ctx.db
        .query("orders")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("waiterRequests")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("featureFlags")
        .withIndex("by_restaurant_key", (q) =>
          q
            .eq("restaurantId", session.restaurantId)
            .eq("key", "online_payment"),
        )
        .unique(),
      ctx.db
        .query("featureFlags")
        .withIndex("by_restaurant_key", (q) =>
          q.eq("restaurantId", session.restaurantId).eq("key", "feedback"),
        )
        .unique(),
    ]);
    const onlinePaymentEnabled = onlinePaymentFlag?.enabled ?? true;
    const feedbackEnabled = feedbackFlag?.enabled ?? true;
    const restaurant = restaurantRecord
      ? {
          ...restaurantRecord,
          logoUrl: restaurantRecord.logoStorageId
            ? ((await ctx.storage.getUrl(restaurantRecord.logoStorageId)) ??
              undefined)
            : restaurantRecord.logoUrl,
          paymentQrUrl: restaurantRecord.paymentQrStorageId
            ? ((await ctx.storage.getUrl(
                restaurantRecord.paymentQrStorageId,
              )) ?? undefined)
            : undefined,
        }
      : null;

    const activeOrders = allOrders.filter((o) => o.status !== "CANCELLED");
    const orderTotal = activeOrders.reduce((sum, o) => sum + o.total, 0);

    // 1-hour payment history visibility
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const visiblePayments = allPayments.filter(
      (p) => p.initiatedAt >= oneHourAgo,
    );
    const paidAmount = allPayments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      session,
      table,
      restaurant,
      onlinePaymentEnabled,
      feedbackEnabled,
      orders: activeOrders,
      payments: visiblePayments,
      orderTotal,
      paidAmount,
      remaining: Math.max(0, orderTotal - paidAmount),
      ordersDelivered:
        activeOrders.length > 0 &&
        activeOrders.every((order) => order.status === "DELIVERED"),
      cashPaymentRequested: waiterRequests.some(
        (request) =>
          request.requestType === "CASH_PAYMENT" &&
          request.status !== "RESOLVED",
      ),
    };
  },
});

// ─── Public Mutations ─────────────────────────────────────────────

/** Customer: move session to BILLING state */
export const customerRequestBill = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.status !== "ACTIVE") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }
    await ctx.db.patch("sessions", args.sessionId, {
      status: "BILLING",
      billRequestedAt: new Date().toISOString(),
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

/** Customer: request staff to collect the outstanding cash balance. */
export const customerRequestCashPayment = mutation({
  args: { sessionId: v.id("sessions") },
  returns: v.id("waiterRequests"),
  handler: async (ctx, args) => {
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session || session.status === "CLOSED") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }

    const [orders, payments, requests] = await Promise.all([
      ctx.db
        .query("orders")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("payments")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
      ctx.db
        .query("waiterRequests")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect(),
    ]);
    const orderTotal = orders
      .filter((order) => order.status !== "CANCELLED")
      .reduce((sum, order) => sum + order.total, 0);
    const paidAmount = payments
      .filter((payment) => payment.status === "PAID")
      .reduce((sum, payment) => sum + payment.amount, 0);
    const remaining = Math.max(0, orderTotal - paidAmount);
    if (remaining <= 0) {
      throw new ConvexError({
        message: "There is no outstanding balance",
        code: "BAD_REQUEST",
      });
    }

    const existingRequest = requests.find(
      (request) =>
        request.requestType === "CASH_PAYMENT" && request.status !== "RESOLVED",
    );
    if (existingRequest) return existingRequest._id;

    const now = new Date().toISOString();
    const requestId = await ctx.db.insert("waiterRequests", {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      requestType: "CASH_PAYMENT",
      message: `Customer requests cash collection for ₹${(remaining / 100).toFixed(2)}.`,
      status: "PENDING",
      requestedAt: now,
    });

    if (session.status === "ACTIVE") {
      await ctx.db.patch("sessions", args.sessionId, {
        status: "BILLING",
        billRequestedAt: now,
      });
    }
    await recordCustomerAction(ctx, {
      restaurantId: session.restaurantId,
      sessionId: args.sessionId,
      tableId: session.tableId,
      eventType: "CASH_PAYMENT_REQUESTED",
      message: `Customer requested cash collection for ₹${(remaining / 100).toFixed(2)}.`,
    });
    return requestId;
  },
});

/** Manager: record a cash payment */
export const recordCashPayment = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
    amountPaise: v.number(),
  },
  returns: v.id("payments"),
  handler: async (ctx, args) => {
    const user = await requireRestaurantAccess(ctx, args.restaurantId);
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session)
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    if (
      session.restaurantId !== args.restaurantId ||
      session.status === "CLOSED"
    ) {
      throw new ConvexError({
        message: "Session is not available for payment",
        code: "BAD_REQUEST",
      });
    }
    if (!Number.isSafeInteger(args.amountPaise) || args.amountPaise <= 0) {
      throw new ConvexError({
        message: "Enter a valid payment amount",
        code: "BAD_REQUEST",
      });
    }
    const remaining = Math.max(
      0,
      (session.totalAmount ?? 0) - (session.paidAmount ?? 0),
    );
    if (args.amountPaise > remaining) {
      throw new ConvexError({
        message: "Cash payment cannot exceed the remaining balance",
        code: "BAD_REQUEST",
      });
    }

    const now = new Date().toISOString();
    const paymentId = await ctx.db.insert("payments", {
      restaurantId: args.restaurantId,
      sessionId: args.sessionId,
      amount: args.amountPaise,
      method: "CASH",
      status: "PAID",
      initiatedAt: now,
      completedAt: now,
      processedBy: user._id,
      requestId: generateRequestId(),
    });

    await ctx.db.patch("sessions", args.sessionId, {
      paidAmount: (session.paidAmount ?? 0) + args.amountPaise,
    });
    const fullyPaid =
      (session.paidAmount ?? 0) + args.amountPaise >=
      (session.totalAmount ?? 0);
    if (fullyPaid) {
      const requests = await ctx.db
        .query("waiterRequests")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .take(50);
      for (const request of requests) {
        if (
          request.requestType === "CASH_PAYMENT" &&
          request.status !== "RESOLVED"
        ) {
          await ctx.db.patch("waiterRequests", request._id, {
            status: "RESOLVED",
            resolvedAt: now,
            resolvedBy: user._id,
          });
        }
      }
    }
    await closeSessionWhenSettled(ctx, args.sessionId, user._id);

    return paymentId;
  },
});

/** Manager: close the bill (moves session to CLOSED) */
export const closeBill = mutation({
  args: {
    sessionId: v.id("sessions"),
    restaurantId: v.id("restaurants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireRestaurantManager(ctx, args.restaurantId);
    const session = await ctx.db.get("sessions", args.sessionId);
    if (!session)
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    if (session.restaurantId !== args.restaurantId) {
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    }
    if (session.status === "CLOSED") {
      throw new ConvexError({
        message: "Session is already closed",
        code: "BAD_REQUEST",
      });
    }

    const orderTotal = session.totalAmount ?? 0;
    const paidAmount = session.paidAmount ?? 0;

    if (paidAmount < orderTotal) {
      throw new ConvexError({
        message: `Outstanding balance ₹${((orderTotal - paidAmount) / 100).toFixed(0)}. Record the payment before closing.`,
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

// ─── Actions (can call Node runtime) ─────────────────────────────

/**
 * Initiate an online Razorpay payment.
 * Creates a Razorpay order + PENDING payment record.
 * Returns Razorpay order details for frontend checkout widget.
 */
export const initiateOnlinePayment = action({
  args: {
    sessionId: v.id("sessions"),
    amountPaise: v.number(),
    method: v.union(v.literal("UPI"), v.literal("CARD")),
  },
  returns: v.object({
    paymentId: v.id("payments"),
    razorpayOrderId: v.string(),
    keyId: v.string(),
    amount: v.number(),
    currency: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    paymentId: Id<"payments">;
    razorpayOrderId: string;
    keyId: string;
    amount: number;
    currency: string;
  }> => {
    const session = await ctx.runQuery(internal.payments._getSession, {
      sessionId: args.sessionId,
    });
    if (!session)
      throw new ConvexError({
        message: "Session not found",
        code: "NOT_FOUND",
      });
    if (session.status !== "ACTIVE" && session.status !== "BILLING") {
      throw new ConvexError({
        message: "Session is not active",
        code: "BAD_REQUEST",
      });
    }
    if (!Number.isSafeInteger(args.amountPaise) || args.amountPaise <= 0) {
      throw new ConvexError({
        message: "Enter a valid payment amount",
        code: "BAD_REQUEST",
      });
    }
    const remaining = await ctx.runQuery(
      internal.payments._getRemainingBalance,
      {
        sessionId: args.sessionId,
      },
    );
    if (args.amountPaise > remaining) {
      throw new ConvexError({
        message: "Payment exceeds the remaining balance",
        code: "BAD_REQUEST",
      });
    }

    // Check online_payment feature flag
    const flags = await ctx.runQuery(internal.payments._getFeatureFlags, {
      restaurantId: session.restaurantId,
    });
    const onlineEnabled =
      flags.find((f) => f.key === "online_payment")?.enabled ?? true;
    if (!onlineEnabled) {
      throw new ConvexError({
        message: "Online payment is not enabled for this restaurant",
        code: "FORBIDDEN",
      });
    }

    const restaurant = await ctx.runQuery(internal.payments._getRestaurant, {
      restaurantId: session.restaurantId,
    });

    // Create Razorpay order (runs in Node runtime)
    const rzp = await ctx.runAction(internal.razorpay.createRazorpayOrder, {
      amountPaise: args.amountPaise,
      currency: restaurant?.currency ?? "INR",
      receiptId: args.sessionId.slice(-20),
      razorpayKeyId: restaurant?.razorpayKeyId,
    });

    // Create PENDING payment record
    const paymentId = await ctx.runMutation(
      internal.payments._createPaymentRecord,
      {
        sessionId: args.sessionId,
        restaurantId: session.restaurantId,
        amount: args.amountPaise,
        method: args.method,
        razorpayOrderId: rzp.razorpayOrderId,
      },
    );

    return {
      paymentId,
      razorpayOrderId: rzp.razorpayOrderId,
      keyId: rzp.keyId,
      amount: rzp.amount,
      currency: rzp.currency,
    };
  },
});

/**
 * Confirm online payment after Razorpay checkout succeeds on client.
 * Verifies HMAC signature server-side, then marks payment PAID.
 */
export const confirmOnlinePayment = action({
  args: {
    paymentId: v.id("payments"),
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
    method: v.union(v.literal("UPI"), v.literal("CARD")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify HMAC signature — throws if invalid
    await ctx.runAction(internal.razorpay.verifySignature, {
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
    });

    await ctx.runMutation(internal.payments._markPaymentPaid, {
      paymentId: args.paymentId,
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
      method: args.method,
    });
    return null;
  },
});

/** Create a server-priced Razorpay order for an authenticated delivery order. */
export const initiateDeliveryPayment = action({
  args: { orderId: v.id("orders") },
  returns: v.object({
    paymentId: v.id("payments"),
    razorpayOrderId: v.string(),
    keyId: v.string(),
    amount: v.number(),
    currency: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    paymentId: Id<"payments">;
    razorpayOrderId: string;
    keyId: string;
    amount: number;
    currency: string;
  }> => {
    const customerId: Id<"users"> | null = await ctx.runQuery(
      internal.customers.getCurrentCustomerId,
      {},
    );
    if (!customerId) {
      throw new ConvexError({
        message: "Sign in to pay for this order.",
        code: "UNAUTHENTICATED",
      });
    }
    const order = await ctx.runQuery(
      internal.payments._getDeliveryOrderForPayment,
      { orderId: args.orderId, customerId },
    );
    if (!order) {
      throw new ConvexError({
        message: "Delivery order not found.",
        code: "NOT_FOUND",
      });
    }
    if (order.deliveryPaymentMethod !== "ONLINE") {
      throw new ConvexError({
        message: "This order is not configured for online payment.",
        code: "BAD_REQUEST",
      });
    }
    if (order.isCancelled) {
      throw new ConvexError({
        message: "This delivery order has been cancelled.",
        code: "BAD_REQUEST",
      });
    }
    if (order.paymentStatus === "PAID") {
      throw new ConvexError({
        message: "This order has already been paid.",
        code: "BAD_REQUEST",
      });
    }
    const flags = await ctx.runQuery(internal.payments._getFeatureFlags, {
      restaurantId: order.restaurantId,
    });
    if (!(
      flags.find((flag) => flag.key === "online_payment")?.enabled ?? true
    )) {
      throw new ConvexError({
        message: "Online payment is not enabled for this restaurant.",
        code: "FORBIDDEN",
      });
    }

    const razorpayOrder = await ctx.runAction(
      internal.razorpay.createRazorpayOrder,
      {
        amountPaise: order.amount,
        currency: order.currency,
        receiptId: args.orderId.slice(-20),
        razorpayKeyId: order.razorpayKeyId,
      },
    );
    const paymentId = await ctx.runMutation(
      internal.payments._createDeliveryPaymentRecord,
      {
        orderId: order.orderId,
        restaurantId: order.restaurantId,
        amount: order.amount,
        razorpayOrderId: razorpayOrder.razorpayOrderId,
      },
    );
    return {
      paymentId,
      razorpayOrderId: razorpayOrder.razorpayOrderId,
      keyId: razorpayOrder.keyId,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
    };
  },
});

/** Verify the Razorpay signature and attach the resulting payment to its owner order. */
export const confirmDeliveryPayment = action({
  args: {
    paymentId: v.id("payments"),
    orderId: v.id("orders"),
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const customerId: Id<"users"> | null = await ctx.runQuery(
      internal.customers.getCurrentCustomerId,
      {},
    );
    if (!customerId) {
      throw new ConvexError({
        message: "Sign in to confirm this payment.",
        code: "UNAUTHENTICATED",
      });
    }
    await ctx.runAction(internal.razorpay.verifySignature, {
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
    });
    await ctx.runMutation(internal.payments._markDeliveryOrderPaid, {
      paymentId: args.paymentId,
      orderId: args.orderId,
      customerId,
      razorpayOrderId: args.razorpayOrderId,
      razorpayPaymentId: args.razorpayPaymentId,
      razorpaySignature: args.razorpaySignature,
    });
    return null;
  },
});
