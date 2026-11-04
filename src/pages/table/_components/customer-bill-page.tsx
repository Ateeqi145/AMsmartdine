import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { CheckCircle2, Star } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { buildUpiPaymentLink } from "@/lib/upi-payment";

function CustomerFeedbackForm({ sessionId }: { sessionId: Id<"sessions"> }) {
  const hasSubmitted = useQuery(api.feedback.hasSubmitted, { sessionId });
  const submitFeedback = useMutation(api.feedback.submit);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating < 1) {
      toast.error("Choose a rating before submitting");
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback({
        sessionId,
        rating,
        comment: comment.trim() || undefined,
      });
      toast.success("Thanks for sharing your feedback");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not submit feedback",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (hasSubmitted === undefined) {
    return <Skeleton className="h-28 w-full rounded-2xl" />;
  }
  if (hasSubmitted) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-900/10">
        <CheckCircle2 className="size-5 shrink-0 text-green-600" />
        <div>
          <p className="text-sm font-semibold">Thanks for your feedback!</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Your feedback helps us improve.
          </p>
        </div>
      </div>
    );
  }
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="font-bold">How was your experience?</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Your feedback helps the team improve.
      </p>
      <div
        className="mt-3 flex gap-2"
        role="group"
        aria-label="Rate your experience"
      >
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            aria-pressed={rating === value}
            onClick={() => setRating(value)}
            className="rounded-lg p-1 text-amber-500 hover:bg-amber-500/10"
          >
            <Star
              className={`size-7 ${rating >= value ? "fill-current" : ""}`}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={1000}
        rows={3}
        placeholder="Anything you'd like us to know? (optional)"
        className="mt-3 w-full resize-none rounded-xl border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        className="mt-3 w-full"
        disabled={submitting || rating === 0}
        onClick={() => void handleSubmit()}
      >
        {submitting ? "Sending feedback..." : "Send feedback"}
      </Button>
    </section>
  );
}

export function CustomerBillPanel({
  sessionId,
}: {
  sessionId: Id<"sessions">;
}) {
  const bill = useQuery(api.payments.getBillSummary, { sessionId });
  if (!bill) {
    return (
      <div className="space-y-3 p-4">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-12 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const { session, restaurant, orders, orderTotal } = bill;
  const isClosed = session.status === "CLOSED";
  const upiPaymentLink =
    restaurant?.upiId && bill.remaining > 0
      ? buildUpiPaymentLink({
          upiId: restaurant.upiId,
          payeeName: restaurant.name,
          amountPaise: bill.remaining,
          note: `Table bill ${sessionId.slice(-8)}`,
        })
      : null;

  return (
    <div className="space-y-4 p-1">
      <section className="rounded-2xl border bg-card p-5">
        <h3 className="text-lg font-bold">Bill summary</h3>
        <div className="mt-3 space-y-2">
          {orders.flatMap((order) =>
            order.items.map((item, index) => (
              <div
                key={`${order._id}-${index}`}
                className="flex justify-between gap-3 text-sm text-muted-foreground"
              >
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>₹{((item.price * item.quantity) / 100).toFixed(2)}</span>
              </div>
            )),
          )}
        </div>
        <div className="mt-4 flex justify-between border-t pt-3 text-base font-bold">
          <span>Total</span>
          <span>₹{(orderTotal / 100).toFixed(2)}</span>
        </div>
        {bill.paidAmount > 0 && (
          <div className="mt-2 flex justify-between text-sm text-muted-foreground">
            <span>Paid</span>
            <span>₹{(bill.paidAmount / 100).toFixed(2)}</span>
          </div>
        )}
        {bill.remaining > 0 && (
          <div className="mt-2 flex justify-between font-semibold">
            <span>Balance due</span>
            <span>₹{(bill.remaining / 100).toFixed(2)}</span>
          </div>
        )}
      </section>

      {!isClosed && bill.remaining > 0 && (
        <section className="rounded-2xl border bg-card p-5 text-center">
          {bill.onlinePaymentEnabled ? (
            <>
              <h3 className="font-bold">Pay with a UPI app</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Open your installed UPI app with the amount prefilled. Return
                here after paying and show the payment confirmation to staff.
              </p>
              {upiPaymentLink ? (
                <Button asChild className="mt-4 w-full">
                  <a href={upiPaymentLink}>
                    Pay ₹{(bill.remaining / 100).toFixed(2)} with UPI
                  </a>
                </Button>
              ) : (
                <p className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  The restaurant has not configured its UPI ID yet. Please ask
                  staff for help.
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Direct UPI payments are not automatically verified on this
                website. The bill will remain unpaid until staff confirm it.
              </p>
              {restaurant?.paymentQrUrl ? (
                <details className="mt-4 text-left">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
                    Or scan the restaurant UPI QR
                  </summary>
                  <p className="mt-2 text-sm text-muted-foreground">
                    QR payments cannot be automatically verified here. Please
                    show the payment confirmation to staff.
                  </p>
                  <img
                    src={restaurant.paymentQrUrl}
                    alt="Restaurant UPI payment QR code"
                    className="mx-auto mt-3 max-h-72 w-full max-w-64 rounded-xl border bg-white object-contain p-2"
                  />
                </details>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Online payment is currently unavailable. Please ask a staff
              member for payment instructions.
            </p>
          )}
        </section>
      )}

      {!isClosed && orderTotal > 0 && bill.remaining === 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-5" />
          Payment received — your bill is fully paid.
        </div>
      )}
      {isClosed && (
        <div className="flex items-center gap-2 rounded-xl bg-green-500/10 p-3 text-sm font-medium text-green-700 dark:text-green-400">
          <CheckCircle2 className="size-5" />
          Bill paid — this table session is closed.
        </div>
      )}
      {isClosed && orderTotal > 0 && bill.feedbackEnabled && (
        <CustomerFeedbackForm sessionId={sessionId} />
      )}
    </div>
  );
}
