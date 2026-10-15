import { useState, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Receipt, CreditCard, Banknote, Smartphone, CheckCircle2,
  AlertCircle, Loader2, ChevronDown, ChevronUp, Star,
} from "lucide-react";

type PaymentMethod = "UPI" | "CARD";

interface RazorpayInstance {
  open: () => void;
  on: (event: string, handler: () => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (opts: Record<string, unknown>) => RazorpayInstance;
  }
}

// Load Razorpay JS SDK lazily
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ─── Payment method selector ──────────────────────────────────────
function MethodButton({
  method, label, icon: Icon, selected, onClick,
}: {
  method: PaymentMethod;
  label: string;
  icon: React.ElementType;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all cursor-pointer ${
        selected
          ? "border-primary bg-primary/5 text-primary"
          : "border-border text-muted-foreground hover:border-muted-foreground"
      }`}
    >
      <Icon className="w-5 h-5" />
      <span className="text-xs font-semibold">{label}</span>
    </button>
  );
}

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
      toast.error(error instanceof Error ? error.message : "Could not submit feedback");
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
          <p className="mt-0.5 text-xs text-muted-foreground">Your feedback helps us improve.</p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border bg-card p-4">
      <h3 className="font-bold">How was your experience?</h3>
      <p className="mt-1 text-sm text-muted-foreground">Your feedback helps the team improve.</p>
      <div className="mt-3 flex gap-2" role="group" aria-label="Rate your experience">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            aria-pressed={rating === value}
            onClick={() => setRating(value)}
            className="rounded-lg p-1 text-amber-500 hover:bg-amber-500/10"
          >
            <Star className={`size-7 ${rating >= value ? "fill-current" : ""}`} />
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

// ─── Customer Bill Panel ──────────────────────────────────────────
export function CustomerBillPanel({
  sessionId,
  onBillRequested,
}: {
  sessionId: Id<"sessions">;
  onBillRequested?: () => void;
}) {
  const bill = useQuery(api.payments.getBillSummary, { sessionId });
  const requestBill = useMutation(api.payments.customerRequestBill);
  const requestCashPayment = useMutation(api.payments.customerRequestCashPayment);
  const initiatePayment = useAction(api.payments.initiateOnlinePayment);
  const confirmPayment = useAction(api.payments.confirmOnlinePayment);

  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [paying, setPaying] = useState(false);
  const [requestingBill, setRequestingBill] = useState(false);
  const [requestingCash, setRequestingCash] = useState(false);
  const [showOrders, setShowOrders] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [usePartial, setUsePartial] = useState(false);

  // Check partial_payment flag
  const flags = useQuery(api.featureFlags.listPublic, bill ? { restaurantId: bill.restaurant!._id } : "skip");
  const partialEnabled = flags?.find((f) => f.key === "partial_payment")?.enabled ?? false;
  const onlineEnabled = flags?.find((f) => f.key === "online_payment")?.enabled ?? true;
  const feedbackEnabled = flags?.find((f) => f.key === "feedback")?.enabled ?? false;

  if (!bill) {
    return (
      <div className="space-y-3 p-4">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
      </div>
    );
  }

  const { session, orders, payments, orderTotal, paidAmount, remaining } = bill;
  const isClosed = session.status === "CLOSED";
  const isBilling = session.status === "BILLING";

  const payAmount = usePartial && partialAmount
    ? Math.round(parseFloat(partialAmount) * 100)
    : remaining;

  const handleRequestBill = async () => {
    setRequestingBill(true);
    try {
      await requestBill({ sessionId });
      toast.success("Bill requested — waiter has been notified");
      onBillRequested?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to request bill");
    } finally {
      setRequestingBill(false);
    }
  };

  const handleOnlinePayment = async () => {
    if (payAmount <= 0) { toast.error("Invalid amount"); return; }
    setPaying(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        toast.error("Could not load payment gateway. Please try again.");
        return;
      }

      const result = await initiatePayment({ sessionId, amountPaise: payAmount, method });

      await new Promise<void>((resolve, reject) => {
        const rzp = new window.Razorpay!({
          key: result.keyId,
          amount: result.amount,
          currency: result.currency,
          order_id: result.razorpayOrderId,
          name: bill.restaurant?.name ?? "SmartDine",
          description: `Table ${bill.table?.displayName ?? bill.table?.tableNumber}`,
          theme: { color: "#e07e2c" },
          handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            try {
              await confirmPayment({
                paymentId: result.paymentId as Id<"payments">,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                method,
              });
              toast.success("Payment successful!");
              resolve();
            } catch (e) {
              reject(e);
            }
          },
          modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
        });
        rzp.open();
      });
    } catch (err) {
      if (err instanceof Error && err.message !== "Payment cancelled") {
        toast.error(err.message);
      }
    } finally {
      setPaying(false);
    }
  };

  if (isClosed) {
    return (
      <div className="space-y-4">
        <div className="py-6 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/20">
            <CheckCircle2 className="size-7 text-green-600" />
          </div>
          <h3 className="mt-3 text-lg font-bold">Bill Settled</h3>
          <p className="mt-1 text-sm text-muted-foreground">Thank you! Your session is closed.</p>
        </div>
        {feedbackEnabled && orderTotal > 0 && <CustomerFeedbackForm sessionId={sessionId} />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="rounded-2xl border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Receipt className="w-4 h-4 text-primary" />
          <h3 className="font-bold">Bill Summary</h3>
          {isBilling && <Badge variant="default" className="text-xs">Bill Requested</Badge>}
        </div>

        {/* Order list toggle */}
        <button
          className="w-full flex items-center justify-between text-sm cursor-pointer"
          onClick={() => setShowOrders(!showOrders)}
        >
          <span className="text-muted-foreground">{orders.length} order{orders.length !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>₹{(orderTotal / 100).toFixed(0)}</span>
            {showOrders ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </button>

        <AnimatePresence>
          {showOrders && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ overflow: "hidden" }}
            >
              <div className="space-y-1 pt-1 border-t">
                {orders.flatMap((o) =>
                  o.items.map((item, i) => (
                    <div key={`${o._id}-${i}`} className="flex justify-between text-xs text-muted-foreground">
                      <span>{item.name} × {item.quantity}</span>
                      <span>₹{((item.price * item.quantity) / 100).toFixed(0)}</span>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="border-t pt-3 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-medium">₹{(orderTotal / 100).toFixed(0)}</span>
          </div>
          {paidAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Paid</span>
              <span className="text-green-600 font-medium">−₹{(paidAmount / 100).toFixed(0)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-base pt-1 border-t">
            <span>Remaining</span>
            <span className={remaining === 0 ? "text-green-600" : "text-primary"}>
              ₹{(remaining / 100).toFixed(0)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment history */}
      {payments.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recent Payments</p>
          {payments.map((p) => (
            <div key={p._id} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">{p.method}</span>
                <Badge
                  variant={p.status === "PAID" ? "default" : p.status === "FAILED" ? "destructive" : "secondary"}
                  className="text-[10px] h-4"
                >
                  {p.status}
                </Badge>
              </div>
              <span className="font-medium">₹{(p.amount / 100).toFixed(0)}</span>
            </div>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <div className="space-y-3">
          {/* Request bill button (if not already billing) */}
          {!isBilling && (
            <Button
              variant="ghost"
              className="w-full border"
              disabled={requestingBill}
              onClick={handleRequestBill}
            >
              {requestingBill ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Request Bill from Waiter
            </Button>
          )}

          {/* Online payment — only if feature enabled */}
          {onlineEnabled && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Pay Now</p>

              {/* Method selector */}
              <div className="flex gap-2">
                <MethodButton method="UPI" label="UPI" icon={Smartphone} selected={method === "UPI"} onClick={() => setMethod("UPI")} />
                <MethodButton method="CARD" label="Card" icon={CreditCard} selected={method === "CARD"} onClick={() => setMethod("CARD")} />
              </div>

              {/* Partial payment */}
              {partialEnabled && (
                <div className="space-y-2">
                  <button
                    className="text-xs text-primary underline cursor-pointer"
                    onClick={() => setUsePartial(!usePartial)}
                  >
                    {usePartial ? "Pay full amount" : "Pay a partial amount"}
                  </button>
                  {usePartial && (
                    <div className="flex items-center gap-2">
                      <Label className="text-sm shrink-0">₹</Label>
                      <Input
                        type="number"
                        min="1"
                        max={(remaining / 100).toFixed(0)}
                        step="0.01"
                        placeholder={(remaining / 100).toFixed(0)}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              <Button
                className="w-full gap-2 h-12"
                disabled={paying || payAmount <= 0}
                onClick={handleOnlinePayment}
              >
                {paying
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : <><CreditCard className="w-4 h-4" /> Pay ₹{(payAmount / 100).toFixed(0)} via {method}</>
                }
              </Button>
            </div>
          )}

          {!onlineEnabled && !isBilling && (
            <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-xl text-sm text-muted-foreground">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>Online payment is not available. You can request cash collection or ask the waiter for help.</span>
            </div>
          )}

          <div className="rounded-2xl border bg-card p-4">
            <div className="flex items-center gap-2">
              <Banknote className="size-4 text-primary" />
              <h3 className="font-semibold">Pay by cash</h3>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Ask a team member to collect ₹{(remaining / 100).toFixed(2)} at your table.
            </p>
            {bill.cashPaymentRequested ? (
              <div className="mt-3 rounded-xl bg-primary/5 p-3 text-sm font-medium text-primary">
                Cash collection requested. Staff must record the payment before closing your table.
              </div>
            ) : (
              <Button
                variant="outline"
                className="mt-3 w-full gap-2"
                disabled={requestingCash}
                onClick={async () => {
                  setRequestingCash(true);
                  try {
                    await requestCashPayment({ sessionId });
                    toast.success("Cash collection requested");
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not request cash collection");
                  } finally {
                    setRequestingCash(false);
                  }
                }}
              >
                <Banknote className="size-4" />
                {requestingCash ? "Requesting..." : "Request cash collection"}
              </Button>
            )}
          </div>
        </div>
      )}

      {remaining === 0 && orderTotal > 0 && (
        <>
          <div className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/10">
            <CheckCircle2 className="size-5 shrink-0 text-green-600" />
            <p className="text-sm font-medium text-green-700 dark:text-green-400">
              Fully paid! Staff can now close the table session.
            </p>
          </div>
          {feedbackEnabled && <CustomerFeedbackForm sessionId={sessionId} />}
        </>
      )}
    </div>
  );
}
