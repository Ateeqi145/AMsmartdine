import { useMemo, useState } from "react";
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
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "CANCELLED";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Order received",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered / collected",
  CANCELLED: "Cancelled",
};

const MANAGER_CANCELLABLE_STATUSES = new Set<OrderStatus>([
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY",
]);

function useRestaurantId() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  return restaurant?._id as Id<"restaurants"> | undefined;
}

export default function OrdersPage() {
  const restaurantId = useRestaurantId();
  const currentUser = useQuery(api.users.getCurrentUser, {});
  const isDeliveryPerson = currentUser?.role === "DELIVERY_PERSON";
  const isManager =
    currentUser?.role === "RESTAURANT_MANAGER" ||
    currentUser?.role === "SUPER_ADMIN";
  const canCancelRestaurantOrders =
    isManager || currentUser?.role === "RESTAURANT_STAFF";
  const orders = useQuery(
    api.orders.listActiveForRestaurant,
    restaurantId && currentUser !== undefined && !isDeliveryPerson
      ? { restaurantId }
      : "skip",
  );
  const assignedDeliveries = useQuery(
    api.orders.listAssignedDeliveries,
    isDeliveryPerson ? {} : "skip",
  );
  const activeSessions = useQuery(
    api.sessions.listActiveSessions,
    restaurantId && currentUser !== undefined && !isDeliveryPerson
      ? { restaurantId }
      : "skip",
  );
  const feedback = useQuery(
    api.feedback.listForRestaurant,
    restaurantId && currentUser !== undefined && !isDeliveryPerson
      ? { restaurantId }
      : "skip",
  );
  const updateStatus = useMutation(api.orders.updateStatus);
  const markBillPaid = useMutation(api.sessions.markBillPaid);
  const closeUnusedSession = useMutation(api.sessions.closeUnusedSession);
  const deliveryPeople = useQuery(
    api.orders.listDeliveryPeople,
    restaurantId && isManager ? { restaurantId } : "skip",
  );
  const securityAlerts = useQuery(
    api.orders.listDeliverySecurityAlerts,
    restaurantId && isManager ? { restaurantId } : "skip",
  );
  const assignDeliveryPerson = useMutation(api.orders.assignDeliveryPerson);
  const verifyDeliveryPin = useMutation(api.orders.verifyDeliveryPin);
  const [deliveryPins, setDeliveryPins] = useState<Record<string, string>>({});
  const [pinMessages, setPinMessages] = useState<Record<string, string>>({});
  const [closingSessionId, setClosingSessionId] =
    useState<Id<"sessions"> | null>(null);

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
      if (
        order.orderType === "DELIVERY" ||
        !order.sessionId ||
        order.sessionStatus === "CLOSED" ||
        order.status === "CANCELLED"
      )
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
  const deliveryOrders = isDeliveryPerson
    ? (assignedDeliveries ?? [])
    : (orders ?? []).filter(
        (order) =>
          order.orderType === "DELIVERY" && order.status !== "CANCELLED",
      );
  const unusedSessions = (activeSessions ?? []).filter(
    (session) => session.canCloseAsUnused,
  );

  const updateOrder = async (
    orderId: Id<"orders">,
    status: "CONFIRMED" | "PREPARING" | "READY" | "OUT_FOR_DELIVERY",
  ) => {
    if (!restaurantId) return;
    try {
      await updateStatus({ orderId, status, restaurantId });
      toast.success(
        status === "CONFIRMED"
          ? "Order accepted"
          : status === "PREPARING"
            ? "Order moved to preparation"
            : status === "OUT_FOR_DELIVERY"
              ? "Order marked out for delivery"
              : "Order ready",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the order.",
      );
    }
  };

  const cancelManagerOrder = async (orderId: Id<"orders">) => {
    if (!restaurantId || !canCancelRestaurantOrders) return;
    const orderLabel = `#${orderId.slice(-5).toUpperCase()}`;
    if (!window.confirm(`Cancel order ${orderLabel}?`)) return;
    if (
      !window.confirm(
        "Confirm cancellation? This cannot be undone. Paid or pending online-payment orders cannot be cancelled.",
      )
    ) {
      return;
    }
    try {
      await updateStatus({
        orderId,
        restaurantId,
        status: "CANCELLED",
      });
      toast.success(`Order ${orderLabel} cancelled.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel the order.",
      );
    }
  };

  const assignDelivery = async (
    orderId: Id<"orders">,
    deliveryPersonId: string,
  ) => {
    if (!restaurantId) return;
    try {
      await assignDeliveryPerson({
        orderId,
        restaurantId,
        deliveryPersonId: deliveryPersonId
          ? (deliveryPersonId as Id<"users">)
          : null,
      });
      toast.success(
        deliveryPersonId ? "Delivery person assigned." : "Assignment cleared.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update the delivery assignment.",
      );
    }
  };

  const submitDeliveryPin = async (orderId: Id<"orders">) => {
    const pin = deliveryPins[orderId] ?? "";
    try {
      const result = await verifyDeliveryPin({ orderId, pin });
      if (result.success) {
        setDeliveryPins((current) => ({ ...current, [orderId]: "" }));
        setPinMessages((current) => ({ ...current, [orderId]: "" }));
        toast.success("Delivery handover verified.");
      } else if (result.expired) {
        setPinMessages((current) => ({
          ...current,
          [orderId]: "This delivery PIN has expired.",
        }));
      } else if (result.lockedUntil !== null) {
        const lockedUntil = result.lockedUntil;
        setPinMessages((current) => ({
          ...current,
          [orderId]: `Verification is locked until ${new Date(lockedUntil).toLocaleTimeString()}.`,
        }));
      } else {
        setPinMessages((current) => ({
          ...current,
          [orderId]: `Incorrect PIN. ${result.remainingAttempts} attempt${result.remainingAttempts === 1 ? "" : "s"} remaining.`,
        }));
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not verify the delivery PIN.",
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

  const closeUnused = async (sessionId: Id<"sessions">) => {
    if (!restaurantId) return;
    setClosingSessionId(sessionId);
    try {
      await closeUnusedSession({ sessionId, restaurantId });
      toast.success("Unused table session closed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not close this unused session.",
      );
    } finally {
      setClosingSessionId(null);
    }
  };

  if (isDeliveryPerson) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-bold">My deliveries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Only deliveries assigned to your account appear here.
          </p>
        </header>
        {assignedDeliveries === undefined ? (
          <Skeleton className="h-48 w-full rounded-2xl" />
        ) : deliveryOrders.length === 0 ? (
          <div className="rounded-2xl border bg-card p-8 text-center text-sm text-muted-foreground">
            No deliveries are assigned to you right now.
          </div>
        ) : (
          <div className="grid gap-4">
            {deliveryOrders.map((order) => (
              <article
                key={order._id}
                className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      Delivery #{order._id.slice(-5).toUpperCase()}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(order.placedAt).toLocaleString()} · ₹
                      {(order.total / 100).toFixed(2)}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {STATUS_LABEL[order.status as OrderStatus]}
                  </Badge>
                </div>
                <ul className="space-y-1 text-sm">
                  {order.items.map((item, index) => (
                    <li key={`${order._id}-${index}`}>
                      {item.quantity} × {item.name}
                    </li>
                  ))}
                </ul>
                {order.deliveryAddress && (
                  <div className="rounded-xl bg-muted/50 p-3 text-sm">
                    <p className="font-medium">
                      {order.deliveryAddress.name} ·{" "}
                      {order.deliveryAddress.phone}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {order.deliveryAddress.street},{" "}
                      {order.deliveryAddress.area}, {order.deliveryAddress.city}{" "}
                      {order.deliveryAddress.pincode}
                    </p>
                  </div>
                )}
                {order.status === "OUT_FOR_DELIVERY" && (
                  <form
                    className="flex flex-wrap items-end gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitDeliveryPin(order._id);
                    }}
                  >
                    <label className="min-w-40 flex-1 space-y-1 text-sm">
                      <span className="font-medium">Customer delivery PIN</span>
                      <input
                        autoComplete="off"
                        className="h-10 w-full rounded-md border bg-background px-3 font-mono tracking-widest"
                        inputMode="numeric"
                        maxLength={4}
                        pattern="[0-9]{4}"
                        type="password"
                        value={deliveryPins[order._id] ?? ""}
                        onChange={(event) =>
                          setDeliveryPins((current) => ({
                            ...current,
                            [order._id]: event.target.value
                              .replace(/\D/g, "")
                              .slice(0, 4),
                          }))
                        }
                      />
                    </label>
                    <Button
                      type="submit"
                      disabled={(deliveryPins[order._id] ?? "").length !== 4}
                    >
                      Verify handover
                    </Button>
                    {pinMessages[order._id] && (
                      <p
                        aria-live="polite"
                        className="w-full text-sm text-destructive"
                      >
                        {pinMessages[order._id]}
                      </p>
                    )}
                  </form>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      <header>
        <h1 className="text-2xl font-bold">Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Accept orders, mark them ready for counter collection, and close each
          table session when payment is complete.
        </p>
      </header>

      {isManager && (securityAlerts?.length ?? 0) > 0 && (
        <section
          aria-labelledby="delivery-security-alerts-heading"
          className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 sm:p-6"
        >
          <h2
            id="delivery-security-alerts-heading"
            className="font-semibold text-destructive"
          >
            Delivery security alerts
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {securityAlerts?.map((alert) => (
              <li key={alert._id}>
                {alert.message} · {alert.deliveryPersonName} ·{" "}
                {new Date(alert.createdAt).toLocaleString()}
              </li>
            ))}
          </ul>
        </section>
      )}

      {deliveryOrders.length > 0 && (
        <section
          aria-labelledby="delivery-orders-heading"
          className="rounded-2xl border bg-card p-4 sm:p-6"
        >
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2
                id="delivery-orders-heading"
                className="text-lg font-semibold"
              >
                Home delivery
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Delivery orders are separate from dine-in table sessions.
              </p>
            </div>
            <Badge variant="secondary">{deliveryOrders.length} orders</Badge>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {deliveryOrders.map((order) => (
              <article
                key={order._id}
                className="space-y-4 rounded-xl border bg-background p-4"
              >
                <div className="flex items-start justify-between gap-3 border-b pb-3">
                  <div>
                    <h3 className="font-semibold">
                      Delivery #{order._id.slice(-5).toUpperCase()}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(order.placedAt).toLocaleString()} · ₹
                      {(order.total / 100).toFixed(2)} ·{" "}
                      {order.deliveryPaymentMethod === "COD"
                        ? "Cash on delivery"
                        : order.paymentStatus === "PAID"
                          ? "Paid online"
                          : "Payment pending"}
                    </p>
                  </div>
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
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {order.items.map((item, index) => (
                    <li key={`${order._id}-${index}`}>
                      {item.quantity} × {item.name}
                      {item.notes ? ` — ${item.notes}` : ""}
                    </li>
                  ))}
                </ul>
                {order.deliveryAddress && (
                  <div className="rounded-lg bg-muted/40 p-3 text-sm">
                    <p className="font-medium">
                      {order.deliveryAddress.name} ·{" "}
                      {order.deliveryAddress.phone}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.deliveryAddress.street},{" "}
                      {order.deliveryAddress.area}, {order.deliveryAddress.city}{" "}
                      {order.deliveryAddress.pincode}
                    </p>
                  </div>
                )}
                {isManager && order.status !== "DELIVERED" && (
                  <label className="block space-y-1 text-sm">
                    <span className="font-medium">
                      Assigned delivery person
                    </span>
                    <select
                      className="h-10 w-full rounded-md border bg-background px-3"
                      value={order.deliveryPersonId ?? ""}
                      disabled={deliveryPeople === undefined}
                      onChange={(event) =>
                        void assignDelivery(order._id, event.target.value)
                      }
                    >
                      <option value="">Not assigned</option>
                      {(deliveryPeople ?? []).map((person) => (
                        <option key={person._id} value={person._id}>
                          {person.name || person.email || "Staff member"}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  {order.status === "PENDING" && (
                    <Button
                      size="sm"
                      onClick={() => void updateOrder(order._id, "CONFIRMED")}
                    >
                      Accept order
                    </Button>
                  )}
                  {order.status === "CONFIRMED" && (
                    <Button
                      size="sm"
                      onClick={() => void updateOrder(order._id, "PREPARING")}
                    >
                      Start preparing
                    </Button>
                  )}
                  {order.status === "PREPARING" && (
                    <Button
                      size="sm"
                      onClick={() => void updateOrder(order._id, "READY")}
                    >
                      Mark ready
                    </Button>
                  )}
                  {order.status === "READY" && (
                    <Button
                      size="sm"
                      onClick={() =>
                        void updateOrder(order._id, "OUT_FOR_DELIVERY")
                      }
                    >
                      Out for delivery
                    </Button>
                  )}
                  {(isManager ||
                    (currentUser?.role === "RESTAURANT_STAFF" &&
                      order.orderType === "DINE_IN")) &&
                    MANAGER_CANCELLABLE_STATUSES.has(
                      order.status as OrderStatus,
                    ) && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => void cancelManagerOrder(order._id)}
                      >
                        Cancel order
                      </Button>
                    )}
                  {order.status === "OUT_FOR_DELIVERY" &&
                    currentUser?._id === order.deliveryPersonId && (
                      <form
                        className="flex w-full flex-wrap items-start gap-2"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void submitDeliveryPin(order._id);
                        }}
                      >
                        <label className="min-w-36 flex-1 space-y-1 text-sm">
                          <span className="font-medium">
                            Customer delivery PIN
                          </span>
                          <input
                            autoComplete="off"
                            className="h-9 w-full rounded-md border bg-background px-3 font-mono tracking-widest"
                            inputMode="numeric"
                            maxLength={4}
                            pattern="[0-9]{4}"
                            type="password"
                            value={deliveryPins[order._id] ?? ""}
                            onChange={(event) =>
                              setDeliveryPins((current) => ({
                                ...current,
                                [order._id]: event.target.value
                                  .replace(/\D/g, "")
                                  .slice(0, 4),
                              }))
                            }
                          />
                        </label>
                        <Button
                          className="mt-5"
                          size="sm"
                          type="submit"
                          disabled={
                            (deliveryPins[order._id] ?? "").length !== 4
                          }
                        >
                          Verify handover
                        </Button>
                        {pinMessages[order._id] && (
                          <p
                            aria-live="polite"
                            className="w-full text-xs text-destructive"
                          >
                            {pinMessages[order._id]}
                          </p>
                        )}
                      </form>
                    )}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {unusedSessions.length > 0 && (
        <section
          aria-labelledby="unused-sessions-heading"
          className="rounded-2xl border bg-card p-4 sm:p-6"
        >
          <div className="mb-4">
            <h2 id="unused-sessions-heading" className="text-lg font-semibold">
              Unused table sessions
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Close sessions opened by a QR scan when no order or cart items
              were created.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {unusedSessions.map((session) => (
              <article
                key={session._id}
                className="flex items-center justify-between gap-3 rounded-xl border bg-background p-4"
              >
                <div>
                  <h3 className="font-semibold">{session.tableNumber}</h3>
                  <p className="text-xs text-muted-foreground">
                    {session.customerCount} guest
                    {session.customerCount === 1 ? "" : "s"} · No order placed
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={closingSessionId === session._id}
                  onClick={() => void closeUnused(session._id)}
                >
                  {closingSessionId === session._id
                    ? "Closing..."
                    : "Close unused"}
                </Button>
              </article>
            ))}
          </div>
        </section>
      )}

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
            No active dine-in orders
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
                          {(isManager ||
                            (currentUser?.role === "RESTAURANT_STAFF" &&
                              order.orderType === "DINE_IN")) &&
                            MANAGER_CANCELLABLE_STATUSES.has(
                              order.status as OrderStatus,
                            ) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  void cancelManagerOrder(order._id)
                                }
                              >
                                Cancel order
                              </Button>
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
