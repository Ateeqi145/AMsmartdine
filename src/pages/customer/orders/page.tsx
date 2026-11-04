import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Link } from "react-router-dom";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { ArrowLeft, Clock3, MapPin, PackageCheck, Truck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { launchRazorpayCheckout } from "@/lib/razorpay-checkout";
import {
  getDeliveryTrackingPath,
  getSavedDeliveryOrders,
  type SavedDeliveryOrder,
} from "@/lib/delivery-order-history";
import { ThemeToggle } from "@/components/theme-toggle";

const STATUS_LABELS = {
  PENDING: "Order received",
  CONFIRMED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
} as const;

function formatPrice(amountInPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountInPaise / 100);
}

function SavedGuestOrderCard({
  order,
  index,
}: {
  order: SavedDeliveryOrder;
  index: number;
}) {
  const orderId = order.orderId as Id<"orders">;
  const tracking = useQuery(api.orders.getDeliveryTracking, {
    orderId,
    trackingToken: order.trackingToken,
  });
  const cancelDeliveryOrder = useMutation(api.orders.cancelDeliveryOrder);
  const [cancelling, setCancelling] = useState(false);

  const cancelOrder = async () => {
    if (
      !tracking?.canCancel ||
      !window.confirm(
        `Cancel Order ${index + 1} from ${tracking.restaurantName}?`,
      )
    ) {
      return;
    }
    if (!window.confirm("Confirm cancellation? This cannot be undone.")) {
      return;
    }
    setCancelling(true);
    try {
      await cancelDeliveryOrder({
        orderId,
        trackingToken: order.trackingToken,
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

  if (tracking === undefined) {
    return <Skeleton className="h-40 rounded-2xl" />;
  }

  if (!tracking) {
    return (
      <Card className="rounded-2xl">
        <CardContent className="p-5">
          <p className="font-semibold">Order {index + 1}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This saved tracking link is no longer available.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-2xl">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">
            Order {index + 1} · {tracking.restaurantName}
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            #{tracking._id.slice(-5).toUpperCase()} ·{" "}
            {new Date(tracking.placedAt).toLocaleString()}
          </p>
        </div>
        <Badge
          variant={
            tracking.status === "DELIVERED"
              ? "default"
              : tracking.status === "CANCELLED"
                ? "destructive"
                : "secondary"
          }
        >
          {STATUS_LABELS[tracking.status]}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5 text-sm">
          {tracking.items.map((item, itemIndex) => (
            <div
              key={`${tracking._id}-${itemIndex}`}
              className="flex justify-between gap-3"
            >
              <span>
                {item.quantity} × {item.name}
              </span>
            </div>
          ))}
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Total</span>
            <span>{formatPrice(tracking.total, tracking.currency)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <Link to={getDeliveryTrackingPath(order)}>Track order</Link>
          </Button>
          {tracking.canCancel && (
            <Button
              size="sm"
              variant="destructive"
              disabled={cancelling}
              onClick={() => void cancelOrder()}
            >
              {cancelling ? "Cancelling..." : "Cancel order"}
            </Button>
          )}
          {tracking.restaurantSlug && (
            <Button asChild size="sm" variant="outline">
              <Link to={`/order/${tracking.restaurantSlug}?newOrder=1`}>
                Order again
              </Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CustomerOrdersPage() {
  const { isLoading } = useConvexAuth();
  const { signOut } = useAuthActions();
  const profile = useQuery(api.customers.getProfile, {});
  const orders = useQuery(
    api.orders.listMyDeliveryOrders,
    profile ? {} : "skip",
  );
  const updateProfile = useMutation(api.customers.updateProfile);
  const initiatePayment = useAction(api.payments.initiateDeliveryPayment);
  const confirmPayment = useAction(api.payments.confirmDeliveryPayment);
  const [name, setName] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [payingOrderId, setPayingOrderId] = useState<Id<"orders"> | null>(null);
  const [savedDeliveryOrders] = useState(getSavedDeliveryOrders);

  const saveName = async () => {
    if (!profile) return;
    setSavingName(true);
    try {
      await updateProfile({ name: name ?? profile.name ?? "" });
      toast.success("Profile updated.");
      setName(null);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update your profile.",
      );
    } finally {
      setSavingName(false);
    }
  };

  const retryPayment = async (
    orderId: Id<"orders">,
    restaurantName: string,
  ) => {
    setPayingOrderId(orderId);
    try {
      const payment = await initiatePayment({ orderId });
      const response = await launchRazorpayCheckout({
        key: payment.keyId,
        amount: payment.amount,
        currency: payment.currency,
        name: restaurantName,
        description: `Delivery order #${orderId.slice(-5).toUpperCase()}`,
        order_id: payment.razorpayOrderId,
        prefill: {
          name: profile?.name ?? undefined,
          contact: profile?.phone,
        },
      });
      if (!response) {
        toast.error("Payment was not completed. You can try again.");
        return;
      }
      await confirmPayment({
        paymentId: payment.paymentId,
        orderId,
        razorpayOrderId: response.razorpay_order_id,
        razorpayPaymentId: response.razorpay_payment_id,
        razorpaySignature: response.razorpay_signature,
      });
      toast.success("Payment verified.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not verify the payment. Try again.",
      );
    } finally {
      setPayingOrderId(null);
    }
  };

  if (isLoading || profile === undefined) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Button asChild size="sm" variant="ghost">
            <Link to="/">
              <ArrowLeft className="size-4" />
              Home
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {profile && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-7">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {profile ? "Customer account" : "Guest checkout"}
          </p>
          <h1 className="mt-1 text-2xl font-bold">My orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {profile
              ? "Track delivery updates and manage your customer profile."
              : "Your private order links are saved on this device."}
          </p>
        </section>

        {profile ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-2">
                <Label htmlFor="account-name">Name</Label>
                <Input
                  id="account-name"
                  maxLength={100}
                  value={name ?? profile.name ?? ""}
                  onChange={(event) => setName(event.target.value)}
                />
                <p className="text-xs text-muted-foreground">{profile.phone}</p>
              </div>
              <Button
                disabled={
                  savingName ||
                  (name ?? profile.name ?? "").trim() ===
                    (profile.name ?? "").trim()
                }
                onClick={() => void saveName()}
              >
                {savingName ? "Saving..." : "Save profile"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {profile === null ? (
          savedDeliveryOrders.length === 0 ? (
            <Card className="rounded-2xl">
              <CardContent className="py-12 text-center">
                <PackageCheck className="mx-auto size-8 text-muted-foreground" />
                <h2 className="mt-3 font-semibold">No saved delivery orders</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Place an order to keep its private tracking link in this
                  browser.
                </p>
              </CardContent>
            </Card>
          ) : (
            <section
              aria-label="Guest delivery order history"
              className="space-y-4"
            >
              {savedDeliveryOrders.map((order, index) => (
                <SavedGuestOrderCard
                  key={order.orderId}
                  order={order}
                  index={index}
                />
              ))}
            </section>
          )
        ) : orders === undefined ? (
          <Skeleton className="h-52 rounded-2xl" />
        ) : orders.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="py-12 text-center">
              <PackageCheck className="mx-auto size-8 text-muted-foreground" />
              <h2 className="mt-3 font-semibold">No delivery orders yet</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a restaurant's public ordering link to browse its menu.
              </p>
            </CardContent>
          </Card>
        ) : (
          <section aria-label="Delivery order history" className="space-y-4">
            {orders.map((order, index) => {
              const statusLabel = STATUS_LABELS[order.status];
              const savedTracking = savedDeliveryOrders.find(
                (saved) => saved.orderId === order._id,
              );
              return (
                <Card key={order._id} className="rounded-2xl">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                    <div>
                      <CardTitle className="text-base">
                        Order {index + 1} · {order.restaurantName}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Order #{order._id.slice(-5).toUpperCase()} ·{" "}
                        {new Date(order.placedAt).toLocaleString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        order.status === "DELIVERED"
                          ? "default"
                          : order.status === "CANCELLED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {statusLabel}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5 text-sm">
                      {order.items.map((item, index) => (
                        <div
                          key={`${order._id}-${index}`}
                          className="flex justify-between gap-3"
                        >
                          <span>
                            {item.quantity} × {item.name}
                          </span>
                          <span className="text-muted-foreground">
                            {formatPrice(item.price * item.quantity, "INR")}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="rounded-xl bg-muted/40 p-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {order.status === "OUT_FOR_DELIVERY" ? (
                          <Truck className="size-4 text-primary" />
                        ) : order.status === "DELIVERED" ? (
                          <PackageCheck className="size-4 text-primary" />
                        ) : (
                          <Clock3 className="size-4 text-primary" />
                        )}
                        {statusLabel}
                      </p>
                      {order.deliveryAddress && (
                        <p className="mt-1 flex items-start gap-2 text-xs text-muted-foreground">
                          <MapPin className="mt-0.5 size-3.5 shrink-0" />
                          {order.deliveryAddress.street},{" "}
                          {order.deliveryAddress.area},{" "}
                          {order.deliveryAddress.city}{" "}
                          {order.deliveryAddress.pincode}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1 border-t pt-3 text-sm">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>{formatPrice(order.subtotal, "INR")}</span>
                      </div>
                      {Boolean(order.discount) && (
                        <div className="flex justify-between text-primary">
                          <span>Discount</span>
                          <span>
                            −{formatPrice(order.discount ?? 0, "INR")}
                          </span>
                        </div>
                      )}
                      {Boolean(order.tax) && (
                        <div className="flex justify-between">
                          <span>Tax</span>
                          <span>{formatPrice(order.tax ?? 0, "INR")}</span>
                        </div>
                      )}
                      {Boolean(order.deliveryCharge) && (
                        <div className="flex justify-between">
                          <span>Delivery</span>
                          <span>
                            {formatPrice(order.deliveryCharge ?? 0, "INR")}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between border-t pt-2 font-bold">
                        <span>Total</span>
                        <span>{formatPrice(order.total, "INR")}</span>
                      </div>
                      <p className="pt-1 text-xs text-muted-foreground">
                        Payment:{" "}
                        {order.paymentStatus === "PAID"
                          ? "Paid"
                          : order.deliveryPaymentMethod === "COD"
                            ? "Cash on delivery"
                            : "Awaiting online payment"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {savedTracking && (
                        <Button asChild size="sm">
                          <Link to={getDeliveryTrackingPath(savedTracking)}>
                            Track order
                          </Link>
                        </Button>
                      )}
                      {order.deliveryPaymentMethod === "ONLINE" &&
                        order.paymentStatus !== "PAID" && (
                          <Button
                            size="sm"
                            disabled={payingOrderId === order._id}
                            onClick={() =>
                              void retryPayment(order._id, order.restaurantName)
                            }
                          >
                            {payingOrderId === order._id
                              ? "Opening payment..."
                              : "Pay online"}
                          </Button>
                        )}
                      {order.restaurantSlug && (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            to={`/order/${order.restaurantSlug}?newOrder=1`}
                          >
                            Order again
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}
