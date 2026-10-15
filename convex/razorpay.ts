"use node";
import { internalAction } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import { createHmac } from "node:crypto";

/**
 * Create a Razorpay order server-side (internal — called from payments actions).
 * Expects env vars: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET
 */
export const createRazorpayOrder = internalAction({
  args: {
    amountPaise: v.number(),
    currency: v.string(),
    receiptId: v.string(),
    razorpayKeyId: v.optional(v.string()),
  },
  handler: async (_ctx, args): Promise<{ razorpayOrderId: string; keyId: string; amount: number; currency: string }> => {
    const keyId = args.razorpayKeyId ?? process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new ConvexError({
        message: "Razorpay is not configured. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Secrets.",
        code: "BAD_REQUEST",
      });
    }

    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
    const response = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: args.amountPaise,
        currency: args.currency,
        receipt: args.receiptId.slice(0, 40),
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new ConvexError({ message: `Razorpay error: ${err}`, code: "EXTERNAL_SERVICE_ERROR" });
    }

    const order = await response.json() as { id: string; amount: number; currency: string };
    return { razorpayOrderId: order.id, keyId, amount: order.amount, currency: order.currency };
  },
});

/**
 * Verify Razorpay payment HMAC-SHA256 signature (internal).
 * Throws ConvexError on mismatch.
 */
export const verifySignature = internalAction({
  args: {
    razorpayOrderId: v.string(),
    razorpayPaymentId: v.string(),
    razorpaySignature: v.string(),
  },
  handler: async (_ctx, args): Promise<void> => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
      throw new ConvexError({ message: "Razorpay not configured", code: "BAD_REQUEST" });
    }
    const payload = `${args.razorpayOrderId}|${args.razorpayPaymentId}`;
    const expected = createHmac("sha256", keySecret).update(payload).digest("hex");
    if (expected !== args.razorpaySignature) {
      throw new ConvexError({ message: "Payment signature verification failed", code: "FORBIDDEN" });
    }
  },
});
