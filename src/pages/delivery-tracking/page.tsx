import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { Clock3, MapPin, PackageCheck, Truck } from "lucide-react";
import { Link, useLocation, useParams } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const STATUS_LABEL = {
  PENDING: "Order received",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
} as const;

export default function DeliveryTrackingPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { hash } = useLocation();
  const trackingToken = hash.slice(1);
  const [cancelling, setCancelling] = useState(false);
  const cancelDeliveryOrder = useMutation(api.orders.cancelDeliveryOrder);
  const order = useQuery(
    api.orders.getDeliveryTracking,
    orderId && trackingToken
      ? {
          orderId: orderId as Id<"orders">,
          trackingToken,
        }
      : "skip",
  );

  if (!orderId || !trackingToken) {
    return <TrackingUnavailable />;
  }

  if (order === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-2xl space-y-4 p-4 sm:p-8">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-64 rounded-2xl" />
      </main>
    );
  }

  if (!order) {
    return <TrackingUnavailable />;
  }

  const label = STATUS_LABEL[order.status];
  const cancelOrder = async () => {
    if (
      !order.canCancel ||
      !window.confirm(`Cancel your order from ${order.restaurantName}?`)
    ) {
      return;
    }
    if (
      !window.confirm("Confirm cancellation? This action cannot be undone.")
    ) {
      return;
    }
    setCancelling(true);
    try {
      await cancelDeliveryOrder({
        orderId: order._id,
        trackingToken,
      });
      toast.success("Your order was cancelled.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel this order.",
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen max-w-2xl space-y-5 p-4 py-8 sm:p-8">
      <header>
        <p className="text-sm text-muted-foreground">Delivery tracking</p>
        <h1 className="mt-1 text-2xl font-bold">{order.restaurantName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Order #{order._id.slice(-5).toUpperCase()} ·{" "}
          {new Date(order.placedAt).toLocaleString()}
        </p>
      </header>

      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            {order.status === "OUT_FOR_DELIVERY" ? (
              <Truck className="size-5 text-primary" />
            ) : order.status === "DELIVERED" ? (
              <PackageCheck className="size-5 text-primary" />
            ) : (
              <Clock3 className="size-5 text-primary" />
            )}
            Order status
          </CardTitle>
          <Badge
            variant={
              order.status === "DELIVERED"
                ? "default"
                : order.status === "CANCELLED"
                  ? "destructive"
                  : "secondary"
            }
          >
            {label}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="grid gap-2 text-sm sm:grid-cols-3">
            {(
              [
                "PENDING",
                "CONFIRMED",
                "PREPARING",
                "READY",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
              ] as const
            ).map((status) => {
              const currentIndex = [
                "PENDING",
                "CONFIRMED",
                "PREPARING",
                "READY",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
              ].indexOf(order.status);
              const stepIndex = [
                "PENDING",
                "CONFIRMED",
                "PREPARING",
                "READY",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
              ].indexOf(status);
              const completed =
                order.status !== "CANCELLED" && stepIndex <= currentIndex;
              return (
                <li
                  key={status}
                  className={`rounded-lg border p-2 ${
                    completed
                      ? "border-primary/40 bg-primary/5 font-medium"
                      : "text-muted-foreground"
                  }`}
                >
                  {STATUS_LABEL[status]}
                </li>
              );
            })}
          </ol>

          {order.status === "CANCELLED" ? (
            <p className="rounded-xl bg-muted p-4 text-sm">
              This delivery order was cancelled.
            </p>
          ) : order.status === "DELIVERED" ? (
            <p className="rounded-xl bg-primary/5 p-4 text-sm">
              Your order has been handed over. Thank you.
            </p>
          ) : order.deliveryPin ? (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
              <p className="text-sm font-medium">Your delivery PIN</p>
              <p
                aria-label="Delivery PIN"
                className="my-2 font-mono text-4xl font-bold tracking-[0.35em]"
              >
                {order.deliveryPin}
              </p>
              <p className="text-xs text-muted-foreground">
                Share this PIN with your delivery person only when your order
                arrives.
              </p>
              {order.deliveryPinExpiresAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Expires{" "}
                  {new Date(order.deliveryPinExpiresAt).toLocaleString()}
                </p>
              )}
            </div>
          ) : order.status === "PENDING" ? (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              Your delivery PIN will appear here after the restaurant accepts
              your order.
            </p>
          ) : (
            <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">
              The delivery PIN is unavailable or has expired. Please contact the
              restaurant.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-base">Order details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ul className="space-y-2 text-sm">
            {order.items.map((item, index) => (
              <li
                key={`${item.name}-${index}`}
                className="flex justify-between gap-3"
              >
                <span>{item.name}</span>
                <span className="text-muted-foreground">× {item.quantity}</span>
              </li>
            ))}
          </ul>
          {order.deliveryAddress && (
            <p className="flex items-start gap-2 border-t pt-3 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 size-4 shrink-0" />
              <span>
                {order.deliveryAddress.name} · {order.deliveryAddress.phone}
                <br />
                {order.deliveryAddress.street}, {order.deliveryAddress.area},{" "}
                {order.deliveryAddress.city} {order.deliveryAddress.pincode}
              </span>
            </p>
          )}
        </CardContent>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button asChild variant="outline">
          <Link to="/customer/orders">My orders</Link>
        </Button>
        {order.canCancel && (
          <Button
            variant="destructive"
            disabled={cancelling}
            onClick={() => void cancelOrder()}
          >
            {cancelling ? "Cancelling..." : "Cancel order"}
          </Button>
        )}
        {order.restaurantSlug && (
          <Button asChild className="sm:col-span-2">
            <Link to={`/order/${order.restaurantSlug}?newOrder=1`}>
              Order from this restaurant again
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}

function TrackingUnavailable() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center p-4">
      <Card className="w-full rounded-2xl">
        <CardHeader>
          <CardTitle>Tracking link unavailable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          This link is invalid or incomplete. Use the private tracking link
          provided after placing your delivery order.
        </CardContent>
      </Card>
    </main>
  );
}
