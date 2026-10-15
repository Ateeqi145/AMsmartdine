import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth.ts";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import type { Id } from "@/convex/_generated/dataModel.d.ts";

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PREPARING"
  | "READY"
  | "DELIVERED"
  | "CANCELLED";

const STATUS_FLOW: Record<OrderStatus, Exclude<OrderStatus, "PENDING" | "CANCELLED"> | null> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PREPARING",
  PREPARING: "READY",
  READY: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY: "Ready",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

const STATUS_COLOR: Record<OrderStatus, string> = {
  PENDING: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
  CONFIRMED: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  PREPARING: "bg-orange-500/15 text-orange-600 dark:text-orange-400",
  READY: "bg-green-500/15 text-green-600 dark:text-green-400",
  DELIVERED: "bg-muted text-muted-foreground",
  CANCELLED: "bg-destructive/15 text-destructive",
};

const NEXT_BTN: Record<string, string> = {
  PENDING: "Confirm",
  CONFIRMED: "Start Preparing",
  PREPARING: "Mark Ready",
  READY: "Mark Delivered",
};

function useRestaurantId() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant);
  return restaurant?._id as Id<"restaurants"> | undefined;
}

export default function OrdersPage() {
  const restaurantId = useRestaurantId();
  const orders = useQuery(
    api.orders.listActiveForRestaurant,
    restaurantId ? { restaurantId } : "skip"
  );
  const waiterRequests = useQuery(
    api.waiterRequests.listPending,
    restaurantId ? { restaurantId } : "skip"
  );
  const updateStatus = useMutation(api.orders.updateStatus);
  const acknowledge = useMutation(api.waiterRequests.acknowledge);
  const resolve = useMutation(api.waiterRequests.resolve);

  const handleAdvance = async (
    orderId: Id<"orders">,
    nextStatus: Exclude<OrderStatus, "PENDING" | "CANCELLED">
  ) => {
    try {
      await updateStatus({ orderId, status: nextStatus, restaurantId: restaurantId! });
      toast.success(`Order moved to ${STATUS_LABEL[nextStatus]}`);
    } catch {
      toast.error("Failed to update order status");
    }
  };

  const handleCancel = async (orderId: Id<"orders">) => {
    try {
      await updateStatus({ orderId, restaurantId: restaurantId!, status: "CANCELLED" });
      toast.success("Order cancelled");
    } catch {
      toast.error("Cannot cancel this order");
    }
  };

  const handleAcknowledge = async (requestId: Id<"waiterRequests">) => {
    try {
      await acknowledge({ requestId, restaurantId: restaurantId! });
      toast.success("Request acknowledged");
    } catch {
      toast.error("Failed to acknowledge");
    }
  };

  const handleResolve = async (requestId: Id<"waiterRequests">) => {
    try {
      await resolve({ requestId, restaurantId: restaurantId! });
      toast.success("Request resolved");
    } catch {
      toast.error("Failed to resolve");
    }
  };

  const statusGroups: OrderStatus[] = [
    "PENDING",
    "CONFIRMED",
    "PREPARING",
    "READY",
  ];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Orders & Requests</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Live kitchen display and waiter request management
        </p>
      </div>

      {/* Waiter Requests Panel */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          Waiter Requests
          {waiterRequests === undefined ? null : waiterRequests.length > 0 ? (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs font-bold">
              {waiterRequests.length}
            </span>
          ) : null}
        </h2>

        {waiterRequests === undefined ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : waiterRequests.length === 0 ? (
          <p className="text-muted-foreground text-sm py-4 border rounded-lg text-center">
            No pending waiter requests
          </p>
        ) : (
          <div className="space-y-2">
            {waiterRequests.map((req) => (
              <div
                key={req._id}
                className="flex items-center justify-between gap-4 border rounded-lg px-4 py-3 bg-card"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`shrink-0 text-xs font-semibold px-2 py-1 rounded-md ${
                      req.requestType === "CALL_WAITER"
                        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                        : req.requestType === "REQUEST_BILL" ||
                            req.requestType === "CASH_PAYMENT"
                        ? "bg-blue-500/15 text-blue-600"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {req.requestType === "CALL_WAITER"
                      ? "CALL"
                      : req.requestType === "REQUEST_BILL"
                        ? "BILL"
                        : req.requestType === "CASH_PAYMENT"
                          ? "CASH"
                          : req.requestType === "WATER"
                            ? "WATER"
                        : "OTHER"}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {req.tableDisplayName}
                    </p>
                    {req.message && (
                      <p className="text-xs text-muted-foreground truncate">
                        {req.message}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(req.requestedAt), {
                      addSuffix: true,
                    })}
                  </span>
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${
                      req.status === "PENDING"
                        ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                        : "bg-blue-500/15 text-blue-600"
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  {req.status === "PENDING" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        handleAcknowledge(req._id as Id<"waiterRequests">)
                      }
                    >
                      Acknowledge
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      handleResolve(req._id as Id<"waiterRequests">)
                    }
                  >
                    Resolve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Order Queue */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Order Queue</h2>
        {orders === undefined ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {statusGroups.map((s) => (
              <Skeleton key={s} className="h-48 w-full" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {statusGroups.map((status) => {
              const grouped = orders.filter((o) => o.status === status);
              return (
                <div key={status} className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_COLOR[status]}`}
                    >
                      {STATUS_LABEL[status]}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {grouped.length}
                    </span>
                  </div>
                  {grouped.length === 0 ? (
                    <div className="border border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground">
                      No orders
                    </div>
                  ) : (
                    grouped.map((order) => {
                      const nextStatus = STATUS_FLOW[order.status as OrderStatus];
                      return (
                        <div
                          key={order._id}
                          className="border rounded-lg p-3 bg-card space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-sm">
                              {order.tableDisplayName ?? "Table"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(order.placedAt), {
                                addSuffix: true,
                              })}
                            </span>
                          </div>
                          <ul className="text-xs text-muted-foreground space-y-0.5">
                            {order.items.map((item, i) => (
                              <li key={i}>
                                {item.quantity}× {item.name}
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-sm font-semibold">
                              ₹{(order.total / 100).toFixed(2)}
                            </span>
                            <div className="flex gap-1">
                              {status === "PENDING" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive hover:text-destructive text-xs h-7 px-2"
                                  onClick={() =>
                                    handleCancel(order._id as Id<"orders">)
                                  }
                                >
                                  Cancel
                                </Button>
                              )}
                              {nextStatus && NEXT_BTN[status] && (
                                <Button
                                  size="sm"
                                  className="text-xs h-7 px-2"
                                  onClick={() =>
                                    handleAdvance(
                                      order._id as Id<"orders">,
                                      nextStatus
                                    )
                                  }
                                >
                                  {NEXT_BTN[status]}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
