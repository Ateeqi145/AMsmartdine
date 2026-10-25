import { useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { formatDistanceToNow } from "date-fns";
import { Check, Clock3, MessageSquareText, Star } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

type OrderStatus =
  "PENDING" | "CONFIRMED" | "PREPARING" | "READY" | "DELIVERED" | "CANCELLED";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Waiting for acceptance",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  DELIVERED: "Collected",
  CANCELLED: "Cancelled",
};

function useRestaurantId() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  return restaurant?._id as Id<"restaurants"> | undefined;
}

export default function OrdersPage() {
  const restaurantId = useRestaurantId();
  const orders = useQuery(
    api.orders.listActiveForRestaurant,
    restaurantId ? { restaurantId } : "skip",
  );
  const feedback = useQuery(
    api.feedback.listForRestaurant,
    restaurantId ? { restaurantId } : "skip",
  );
  const updateStatus = useMutation(api.orders.updateStatus);
  const markBillPaid = useMutation(api.sessions.markBillPaid);

  const sessions = useMemo(() => {
    const grouped = new Map<
      string,
      {
        sessionId: Id<"sessions">;
        tableDisplayName: string;
        orders: NonNullable<typeof orders>;
      }
    >();
    for (const order of orders ?? []) {
      if (order.sessionStatus === "CLOSED" || order.status === "CANCELLED")
        continue;
      const existing = grouped.get(order.sessionId);
      if (existing) existing.orders.push(order);
      else
        grouped.set(order.sessionId, {
          sessionId: order.sessionId,
          tableDisplayName: order.tableDisplayName,
          orders: [order],
        });
    }
    return [...grouped.values()];
  }, [orders]);

  const updateOrder = async (
    orderId: Id<"orders">,
    status: "CONFIRMED" | "READY",
  ) => {
    if (!restaurantId) return;
    try {
      await updateStatus({ orderId, status, restaurantId });
      toast.success(status === "CONFIRMED" ? "Order accepted" : "Order ready");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the order.",
      );
    }
  };

  const confirmBillPaid = async (sessionId: Id<"sessions">) => {
    if (!restaurantId) return;
    try {
      await markBillPaid({ sessionId, restaurantId });
      toast.success("Bill marked paid and table session closed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not close this session.",
      );
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accept orders, mark them ready for counter collection, and close each
          table session when payment is complete.
        </p>
      </header>

      <section
        aria-labelledby="order-queue-heading"
        className="rounded-2xl border bg-card p-4 sm:p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 id="order-queue-heading" className="text-lg font-semibold">
              Order Queue
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              New orders show first. Customers are told to wait until their
              order is ready.
            </p>
          </div>
          {orders && (
            <Badge variant="secondary">{sessions.length} tables</Badge>
          )}
        </div>

        {orders === undefined ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((item) => (
              <Skeleton key={item} className="h-56 w-full rounded-xl" />
            ))}
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            No active orders
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {sessions.map((session) => {
              const total = session.orders.reduce(
                (sum, order) => sum + order.total,
                0,
              );
              const readyToPay = session.orders.every(
                (order) =>
                  order.status === "READY" || order.status === "DELIVERED",
              );

              return (
                <article
                  key={session.sessionId}
                  className="space-y-4 rounded-xl border bg-background p-4"
                >
                  <div className="flex items-start justify-between gap-3 border-b pb-3">
                    <div>
                      <h3 className="font-semibold">
                        {session.tableDisplayName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {session.orders.length} order
                        {session.orders.length === 1 ? "" : "s"} · ₹
                        {(total / 100).toFixed(2)}
                      </p>
                    </div>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock3 className="size-3.5" />
                      {formatDistanceToNow(
                        new Date(
                          Math.min(
                            ...session.orders.map((order) =>
                              new Date(order.placedAt).getTime(),
                            ),
                          ),
                        ),
                        { addSuffix: true },
                      )}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {session.orders.map((order) => (
                      <div
                        key={order._id}
                        className="rounded-lg bg-muted/40 p-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium">
                            Order #{order._id.slice(-5).toUpperCase()}
                          </span>
                          <Badge
                            variant={
                              order.status === "READY"
                                ? "default"
                                : order.status === "PENDING"
                                  ? "secondary"
                                  : "outline"
                            }
                          >
                            {STATUS_LABEL[order.status as OrderStatus]}
                          </Badge>
                        </div>
                        <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                          {order.items.map((item, index) => (
                            <li key={`${order._id}-${index}`}>
                              {item.quantity} × {item.name}
                              {item.notes ? ` — ${item.notes}` : ""}
                            </li>
                          ))}
                        </ul>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {order.status === "PENDING" && (
                            <Button
                              size="sm"
                              onClick={() =>
                                void updateOrder(order._id, "CONFIRMED")
                              }
                            >
                              Order accepted
                            </Button>
                          )}
                          {(order.status === "CONFIRMED" ||
                            order.status === "PREPARING") && (
                            <Button
                              size="sm"
                              onClick={() =>
                                void updateOrder(order._id, "READY")
                              }
                            >
                              Order ready
                            </Button>
                          )}
                          {order.status === "READY" && (
                            <p className="flex items-center gap-1.5 text-xs font-medium text-primary">
                              <Check className="size-4" />
                              Ready — customer can collect from the counter
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button
                    className="w-full"
                    disabled={!readyToPay}
                    onClick={() => void confirmBillPaid(session.sessionId)}
                  >
                    Bill paid
                  </Button>
                  {!readyToPay && (
                    <p className="-mt-2 text-center text-xs text-muted-foreground">
                      Mark all orders ready before closing this table session.
                    </p>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-labelledby="feedback-history-heading"
        className="rounded-2xl border bg-card p-4 sm:p-6"
      >
        <div className="mb-4 flex items-center gap-2">
          <MessageSquareText className="size-5 text-primary" />
          <div>
            <h2 id="feedback-history-heading" className="text-lg font-semibold">
              Customer Feedback
            </h2>
            <p className="text-sm text-muted-foreground">
              Recent feedback history for this business.
            </p>
          </div>
        </div>
        {feedback === undefined ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : feedback.length === 0 ? (
          <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
            No feedback received yet.
          </p>
        ) : (
          <div className="divide-y">
            {feedback.map((entry) => (
              <article key={entry._id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {entry.tableDisplayName}
                    </span>
                    <span
                      className="flex items-center gap-0.5 text-amber-500"
                      aria-label={`${entry.rating} out of 5 stars`}
                    >
                      {Array.from({ length: entry.rating }, (_, index) => (
                        <Star key={index} className="size-3.5 fill-current" />
                      ))}
                    </span>
                  </div>
                  <time className="text-xs text-muted-foreground">
                    {new Date(entry.submittedAt).toLocaleString()}
                  </time>
                </div>
                {entry.comment && (
                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {entry.comment}
                  </p>
                )}
                {entry.tags && entry.tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
                      <Badge key={tag} variant="secondary">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
