export {};import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import {
  Receipt, Banknote, CheckCircle2, AlertTriangle, Clock,
  ChevronDown, ChevronUp, X, DollarSign,
} from "lucide-react";

// ─── Bill Detail Dialog ───────────────────────────────────────────
function BillDetailDialog({
  sessionId,
  restaurantId,
  open,
  onClose,
}: {
  sessionId: Id<"sessions">;
  restaurantId: Id<"restaurants">;
  open: boolean;
  onClose: () => void;
}) {
  const bill = useQuery(api.payments.getBillSummary, open ? { sessionId } : "skip");
  const recordCash = useMutation(api.payments.recordCashPayment);
  const closeBill = useMutation(api.payments.closeBill);

  const [cashAmount, setCashAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [closing, setClosing] = useState(false);
  const [showOrders, setShowOrders] = useState(true);

  const handleRecordCash = async () => {
    const amount = Math.round(parseFloat(cashAmount) * 100);
    if (!cashAmount || isNaN(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await recordCash({ sessionId, restaurantId, amountPaise: amount });
      toast.success(`₹${cashAmount} recorded`);
      setCashAmount("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record payment");
    } finally {
      setSaving(false);
    }
  };

  const handleCloseBill = async () => {
    setClosing(true);
    try {
      await closeBill({ sessionId, restaurantId });
      toast.success("Bill closed — table is now free");
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to close bill";
      toast.error(msg);
    } finally {
      setClosing(false);
    }
  };

  const tableDisplay = bill?.table?.displayName ?? (bill?.table ? `Table ${bill.table.tableNumber}` : "Table");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            {tableDisplay} — Bill
          </DialogTitle>
        </DialogHeader>

        {!bill ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Totals */}
            <div className="rounded-xl bg-muted/40 p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order Total</span>
                <span>₹{(bill.orderTotal / 100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="text-green-600 font-medium">₹{(bill.paidAmount / 100).toFixed(0)}</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
                <span>Remaining</span>
                <span className={bill.remaining === 0 ? "text-green-600" : "text-primary"}>
                  ₹{(bill.remaining / 100).toFixed(0)}
                </span>
              </div>
            </div>

            {/* Orders breakdown */}
            <div>
              <button
                className="flex items-center justify-between w-full text-sm font-semibold cursor-pointer mb-2"
                onClick={() => setShowOrders(!showOrders)}
              >
                <span>Orders ({bill.orders.length})</span>
                {showOrders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showOrders && (
                <div className="space-y-3">
                  {bill.orders.map((order) => (
                    <div key={order._id} className="border rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px]">{order.status}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.placedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        <span className="ml-auto text-sm font-semibold">₹{(order.total / 100).toFixed(0)}</span>
                      </div>
                      {order.items.map((item, i) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground">
                          <span>{item.name} × {item.quantity}</span>
                          <span>₹{((item.price * item.quantity) / 100).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Payment history */}
            {bill.payments.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Payment History</p>
                <div className="space-y-1.5">
                  {bill.payments.map((p) => (
                    <div key={p._id} className="flex items-center justify-between text-sm p-2 bg-muted/30 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground font-medium">{p.method}</span>
                        <Badge
                          variant={p.status === "PAID" ? "default" : "secondary"}
                          className="text-[10px] h-4"
                        >
                          {p.status}
                        </Badge>
                      </div>
                      <span className="font-semibold">₹{(p.amount / 100).toFixed(0)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Record cash payment */}
            {bill.session.status !== "CLOSED" && (
              <div className="space-y-2 border-t pt-4">
                <Label className="text-sm font-semibold flex items-center gap-1.5">
                  <Banknote className="w-4 h-4" />
                  Record Cash Payment
                </Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">₹</span>
                    <Input
                      type="number"
                      min="1"
                      step="0.01"
                      placeholder={bill.remaining > 0 ? (bill.remaining / 100).toFixed(0) : "0"}
                      className="pl-7"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                    />
                  </div>
                  <Button disabled={saving || !cashAmount} onClick={handleRecordCash}>
                    {saving ? "Saving…" : "Record"}
                  </Button>
                </div>
                <button
                  className="text-xs text-primary cursor-pointer hover:underline"
                  onClick={() => setCashAmount((bill.remaining / 100).toFixed(0))}
                >
                  Auto-fill remaining (₹{(bill.remaining / 100).toFixed(0)})
                </button>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 mt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {bill?.session.status !== "CLOSED" && (
            <Button
              disabled={closing || bill?.remaining !== 0}
              onClick={() => void handleCloseBill()}
              className="gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              {closing
                ? "Closing…"
                : bill?.remaining === 0
                  ? "Close Bill & Free Table"
                  : `Collect ₹${((bill?.remaining ?? 0) / 100).toFixed(2)} before closing`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Session Row ──────────────────────────────────────────────────
function SessionRow({
  session,
  restaurantId,
}: {
  session: Doc<"sessions"> & { tableNumber: string };
  restaurantId: Id<"restaurants">;
}) {
  const [open, setOpen] = useState(false);
  const orderTotal = session.totalAmount ?? 0;
  const paidAmount = session.paidAmount ?? 0;
  const remaining = Math.max(0, orderTotal - paidAmount);
  const isBilling = session.status === "BILLING";

  return (
    <>
      <div
        className="flex items-center gap-4 p-3 rounded-xl border bg-card hover:shadow-sm cursor-pointer transition-shadow"
        onClick={() => setOpen(true)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm">
              {session.tableNumber}
            </span>
            {isBilling && (
              <Badge variant="default" className="text-[10px] gap-1">
                <Receipt className="w-2.5 h-2.5" />
                Bill Requested
              </Badge>
            )}
            {remaining === 0 && orderTotal > 0 && (
              <Badge variant="secondary" className="text-[10px] gap-1 text-green-600">
                <CheckCircle2 className="w-2.5 h-2.5" />
                Paid
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {session.customerCount} guest{session.customerCount !== 1 ? "s" : ""} ·{" "}
            opened {new Date(session.openedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-bold text-sm">₹{(orderTotal / 100).toFixed(0)}</p>
          {remaining > 0 && (
            <p className="text-xs text-orange-600 dark:text-orange-400">
              ₹{(remaining / 100).toFixed(0)} due
            </p>
          )}
          {remaining === 0 && paidAmount > 0 && (
            <p className="text-xs text-green-600">Fully paid</p>
          )}
        </div>
        <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs flex-shrink-0">
          <DollarSign className="w-3.5 h-3.5" />
          Billing
        </Button>
      </div>

      <BillDetailDialog
        sessionId={session._id}
        restaurantId={restaurantId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

// ─── Main Billing Page ────────────────────────────────────────────
export default function ManagerBillingPage() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const rid = restaurant?._id as Id<"restaurants"> | undefined;

  const sessions = useQuery(
    api.sessions.listActiveSessions,
    rid ? { restaurantId: rid } : "skip",
  );

  // Quick stats
  const billingSessions = (sessions ?? []).filter((s) => s.status === "BILLING");
  const totalPending = (sessions ?? []).reduce((sum, s) => {
    const due = Math.max(0, (s.totalAmount ?? 0) - (s.paidAmount ?? 0));
    return sum + due;
  }, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Record cash payments, close bills, and manage active sessions
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Active Sessions",
            value: sessions?.length ?? "—",
            icon: Clock,
            color: "text-blue-600",
          },
          {
            label: "Bill Requested",
            value: billingSessions.length,
            icon: Receipt,
            color: "text-orange-600",
          },
          {
            label: "Outstanding",
            value: `₹${(totalPending / 100).toFixed(0)}`,
            icon: AlertTriangle,
            color: "text-red-600",
          },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="font-bold text-xl">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bill requested — highlight */}
      {billingSessions.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-orange-600 dark:text-orange-400 mb-2 flex items-center gap-1.5">
            <Receipt className="w-4 h-4" />
            Bill Requested ({billingSessions.length})
          </h2>
          <div className="space-y-2">
            {billingSessions.map((s) => (
              <SessionRow key={s._id} session={s} restaurantId={rid!} />
            ))}
          </div>
        </div>
      )}

      {/* All active sessions */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">All Active Sessions</h2>
        {sessions === undefined ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
          </div>
        ) : sessions.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <Receipt className="w-8 h-8 text-muted-foreground/40 mx-auto" />
              <p className="font-medium text-sm">No active sessions</p>
              <p className="text-xs text-muted-foreground">Sessions appear when customers scan a QR code</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions
              .filter((s) => s.status !== "BILLING")
              .map((s) => (
                <SessionRow key={s._id} session={s} restaurantId={rid!} />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
