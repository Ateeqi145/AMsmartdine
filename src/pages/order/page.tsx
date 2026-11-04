import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowRight,
  MapPin,
  Minus,
  Plus,
  ShoppingBag,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { launchRazorpayCheckout } from "@/lib/razorpay-checkout";
import { normalizeCustomerPhone } from "@/lib/customer-phone";
import { saveDeliveryOrder } from "@/lib/delivery-order-history";
import { ThemeToggle } from "@/components/theme-toggle";

type AddressFields = {
  name: string;
  phone: string;
  street: string;
  area: string;
  city: string;
  pincode: string;
};

const EMPTY_ADDRESS: AddressFields = {
  name: "",
  phone: "",
  street: "",
  area: "",
  city: "",
  pincode: "",
};

function formatPrice(amountInPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amountInPaise / 100);
}

function isValidAddress(address: AddressFields) {
  return (
    address.name.trim().length >= 1 &&
    address.name.trim().length <= 100 &&
    normalizeCustomerPhone(address.phone) !== null &&
    address.street.trim().length >= 3 &&
    address.street.trim().length <= 200 &&
    address.area.trim().length >= 2 &&
    address.city.trim().length >= 2 &&
    /^\d{4,10}$/.test(address.pincode.trim())
  );
}

export default function OnlineOrderPage() {
  const { slug = "" } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const menu = useQuery(api.menu.getOnlineMenu, slug ? { slug } : "skip");
  const profile = useQuery(api.customers.getProfile, {});
  const addresses = useQuery(
    api.customers.listAddresses,
    profile ? {} : "skip",
  );
  const updateProfile = useMutation(api.customers.updateProfile);
  const addAddress = useMutation(api.customers.addAddress);
  const updateAddress = useMutation(api.customers.updateAddress);
  const deleteAddress = useMutation(api.customers.deleteAddress);
  const createDeliveryOrder = useMutation(api.orders.createDeliveryOrder);
  const initiatePayment = useAction(api.payments.initiateDeliveryPayment);
  const confirmPayment = useAction(api.payments.confirmDeliveryPayment);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedAddressId, setSelectedAddressId] =
    useState<Id<"deliveryAddresses"> | null>(null);
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] =
    useState<Id<"deliveryAddresses"> | null>(null);
  const [addressForm, setAddressForm] = useState<AddressFields>(EMPTY_ADDRESS);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<"ONLINE" | "COD">("COD");
  const [savingAddress, setSavingAddress] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    if (!slug || searchParams.get("newOrder") === "1") return;
    const storageKey = `smartdine-delivery-tracking:${slug}`;
    const savedTrackingPath = window.localStorage.getItem(storageKey);
    if (!savedTrackingPath) return;
    if (/^\/delivery\/track\/[^/?#]+#[a-f0-9]{64}$/i.test(savedTrackingPath)) {
      navigate(savedTrackingPath, { replace: true });
    } else {
      window.localStorage.removeItem(storageKey);
    }
  }, [navigate, searchParams, slug]);

  const cartItems = useMemo(
    () =>
      (menu?.menuItems ?? []).flatMap((item) => {
        const quantity = quantities[item._id];
        return quantity
          ? [{ item, quantity, lineTotal: item.price * quantity }]
          : [];
      }),
    [menu?.menuItems, quantities],
  );
  const subtotal = cartItems.reduce((sum, entry) => sum + entry.lineTotal, 0);
  const itemCount = cartItems.reduce((sum, entry) => sum + entry.quantity, 0);
  const currency = menu?.restaurant.currency ?? "INR";
  const selectedAddress =
    addresses?.find((address) => address._id === selectedAddressId) ??
    addresses?.[0] ??
    null;
  const changeQuantity = (itemId: Id<"menuItems">, amount: number) => {
    setQuantities((current) => {
      const next = Math.max(0, (current[itemId] ?? 0) + amount);
      if (next === 0) {
        const { [itemId]: _removed, ...remaining } = current;
        return remaining;
      }
      return { ...current, [itemId]: next };
    });
  };

  const openNewAddress = () => {
    setEditingAddressId(null);
    setAddressForm({ ...EMPTY_ADDRESS, phone: profile?.phone ?? "" });
    setAddressDialogOpen(true);
  };

  const openEditAddress = (address: NonNullable<typeof addresses>[number]) => {
    setEditingAddressId(address._id);
    setAddressForm({
      name: address.name,
      phone: address.phone,
      street: address.street,
      area: address.area,
      city: address.city,
      pincode: address.pincode,
    });
    setAddressDialogOpen(true);
  };

  const saveAddress = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSavingAddress(true);
    try {
      if (editingAddressId) {
        await updateAddress({ addressId: editingAddressId, ...addressForm });
        setSelectedAddressId(editingAddressId);
        toast.success("Delivery address updated.");
      } else {
        const addressId = await addAddress(addressForm);
        setSelectedAddressId(addressId);
        toast.success("Delivery address saved.");
      }
      setAddressDialogOpen(false);
      setAddressForm(EMPTY_ADDRESS);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save this address.",
      );
    } finally {
      setSavingAddress(false);
    }
  };

  const saveProfileName = async () => {
    if (!profile) return;
    setSavingProfile(true);
    try {
      await updateProfile({ name: profileName ?? profile.name ?? "" });
      setProfileName(null);
      toast.success("Profile updated.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update your profile.",
      );
    } finally {
      setSavingProfile(false);
    }
  };

  const placeOrder = async () => {
    if (!menu || cartItems.length === 0) {
      return;
    }
    if (profile ? !selectedAddress : !isValidAddress(addressForm)) {
      toast.error("Enter a valid delivery address to continue.");
      return;
    }
    if (paymentMethod === "ONLINE" && !profile) {
      toast.error("Online payment requires a signed-in customer account.");
      return;
    }
    setPlacingOrder(true);
    const checkoutPaymentMethod = profile ? paymentMethod : "COD";
    let orderId: Id<"orders"> | null = null;
    let trackingPath: string | null = null;
    try {
      const created = await createDeliveryOrder({
        restaurantId: menu.restaurant._id,
        ...(profile && selectedAddress
          ? { addressId: selectedAddress._id }
          : {
              deliveryAddress: {
                ...addressForm,
                phone: normalizeCustomerPhone(addressForm.phone)!,
              },
            }),
        paymentMethod: checkoutPaymentMethod,
        items: cartItems.map(({ item, quantity }) => ({
          menuItemId: item._id,
          quantity,
        })),
      });
      orderId = created.orderId;
      trackingPath = `/delivery/track/${created.orderId}#${created.trackingToken}`;
      window.localStorage.setItem(
        `smartdine-delivery-tracking:${slug}`,
        trackingPath,
      );
      saveDeliveryOrder({
        orderId: created.orderId,
        trackingToken: created.trackingToken,
        restaurantSlug: slug,
        placedAt: new Date().toISOString(),
      });
      if (checkoutPaymentMethod === "ONLINE") {
        const payment = await initiatePayment({ orderId });
        const response = await launchRazorpayCheckout({
          key: payment.keyId,
          amount: payment.amount,
          currency: payment.currency,
          name: menu.restaurant.name,
          description: `Delivery order #${orderId.slice(-5).toUpperCase()}`,
          order_id: payment.razorpayOrderId,
          prefill: {
            name: profile?.name ?? undefined,
            contact: profile?.phone,
          },
        });
        if (!response) {
          toast.error(
            "Payment was not completed. You can retry it from My Orders.",
          );
          navigate(trackingPath);
          return;
        }
        await confirmPayment({
          paymentId: payment.paymentId,
          orderId,
          razorpayOrderId: response.razorpay_order_id,
          razorpayPaymentId: response.razorpay_payment_id,
          razorpaySignature: response.razorpay_signature,
        });
      }
      setQuantities({});
      toast.success(
        checkoutPaymentMethod === "ONLINE"
          ? "Payment verified. Your order was received."
          : "Your delivery order was received.",
      );
      navigate(trackingPath);
    } catch (error) {
      toast.error(
        orderId
          ? "The order is saved. Check My Orders to retry payment or view its status."
          : error instanceof Error
            ? error.message
            : "Could not place your order.",
      );
      if (orderId && trackingPath) navigate(trackingPath);
    } finally {
      setPlacingOrder(false);
    }
  };

  if (menu === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-6xl space-y-5 px-4 py-8">
        <Skeleton className="h-24 w-full rounded-3xl" />
        <Skeleton className="h-12 w-full rounded-2xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-44 rounded-2xl" />
        </div>
      </main>
    );
  }

  if (!menu) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-5">
        <section className="max-w-md rounded-3xl border bg-background p-7 text-center">
          <UtensilsCrossed className="mx-auto size-9 text-primary" />
          <h1 className="mt-4 text-xl font-bold">
            Online ordering unavailable
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This restaurant is closed or has temporarily paused online orders.
          </p>
        </section>
      </main>
    );
  }

  const visibleCategories = menu.categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(
      (category) =>
        selectedCategory === "all" || category._id === selectedCategory,
    );

  return (
    <main className="min-h-screen bg-muted/30 pb-12">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {menu.restaurant.logoUrl ? (
              <img
                src={menu.restaurant.logoUrl}
                alt=""
                className="size-11 rounded-xl object-cover"
              />
            ) : (
              <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                <UtensilsCrossed className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-bold">{menu.restaurant.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {menu.restaurant.address ?? "Order online for home delivery"}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/customer/orders">My Orders</Link>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 space-y-5">
          <div className="rounded-3xl border bg-background p-5 sm:p-7">
            <Badge variant="secondary">Home delivery</Badge>
            <h1 className="mt-3 text-2xl font-bold sm:text-3xl">
              Order from {menu.restaurant.name}
            </h1>
            {menu.restaurant.description && (
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                {menu.restaurant.description}
              </p>
            )}
          </div>

          <nav
            aria-label="Menu categories"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            <Button
              type="button"
              size="sm"
              variant={selectedCategory === "all" ? "default" : "outline"}
              onClick={() => setSelectedCategory("all")}
            >
              All
            </Button>
            {menu.categories
              .slice()
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((category) => (
                <Button
                  key={category._id}
                  type="button"
                  size="sm"
                  variant={
                    selectedCategory === category._id ? "default" : "outline"
                  }
                  onClick={() => setSelectedCategory(category._id)}
                >
                  {category.name}
                </Button>
              ))}
          </nav>

          {visibleCategories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">
                The menu is being prepared. Please check back soon.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {visibleCategories.map((category) => {
                const items = menu.menuItems
                  .filter((item) => item.categoryId === category._id)
                  .sort((a, b) => a.sortOrder - b.sortOrder);
                if (items.length === 0) return null;
                return (
                  <section key={category._id} aria-label={category.name}>
                    <div className="mb-3">
                      <h2 className="text-xl font-bold">{category.name}</h2>
                      {category.description && (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {category.description}
                        </p>
                      )}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {items.map((item) => {
                        const quantity = quantities[item._id] ?? 0;
                        return (
                          <article
                            key={item._id}
                            className="flex min-h-32 gap-3 rounded-2xl border bg-background p-3"
                          >
                            {item.imageUrl && (
                              <img
                                src={item.imageUrl}
                                alt=""
                                className="size-24 shrink-0 rounded-xl object-cover"
                              />
                            )}
                            <div className="flex min-w-0 flex-1 flex-col">
                              <h3 className="font-semibold">{item.name}</h3>
                              {item.description && (
                                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                                  {item.description}
                                </p>
                              )}
                              <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                                <span className="text-sm font-bold">
                                  {formatPrice(item.price, currency)}
                                </span>
                                {quantity === 0 ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => changeQuantity(item._id, 1)}
                                  >
                                    <Plus className="size-4" />
                                    Add
                                  </Button>
                                ) : (
                                  <div className="flex items-center gap-2 rounded-lg bg-primary px-2 py-1 text-primary-foreground">
                                    <button
                                      type="button"
                                      aria-label={`Remove one ${item.name}`}
                                      onClick={() =>
                                        changeQuantity(item._id, -1)
                                      }
                                    >
                                      <Minus className="size-4" />
                                    </button>
                                    <span className="min-w-4 text-center text-sm font-semibold">
                                      {quantity}
                                    </span>
                                    <button
                                      type="button"
                                      aria-label={`Add one ${item.name}`}
                                      onClick={() =>
                                        changeQuantity(item._id, 1)
                                      }
                                    >
                                      <Plus className="size-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-4 lg:sticky lg:top-5 lg:self-start">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <ShoppingBag className="size-5 text-primary" />
                Your order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {cartItems.length === 0 ? (
                <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                  Add items from the menu to get started.
                </p>
              ) : (
                <div className="space-y-3">
                  {cartItems.map(({ item, quantity, lineTotal }) => (
                    <div
                      key={item._id}
                      className="flex items-center gap-3 border-b pb-3 last:border-0"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {item.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatPrice(lineTotal, currency)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Remove one ${item.name}`}
                          onClick={() => changeQuantity(item._id, -1)}
                          className="grid size-7 place-items-center rounded-md border"
                        >
                          <Minus className="size-3.5" />
                        </button>
                        <span className="w-4 text-center text-sm">
                          {quantity}
                        </span>
                        <button
                          type="button"
                          aria-label={`Add one ${item.name}`}
                          onClick={() => changeQuantity(item._id, 1)}
                          className="grid size-7 place-items-center rounded-md border"
                        >
                          <Plus className="size-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${item.name}`}
                        onClick={() =>
                          setQuantities((current) => {
                            const { [item._id]: _removed, ...remaining } =
                              current;
                            return remaining;
                          })
                        }
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between border-t pt-3 text-sm font-semibold">
                <span>Item subtotal</span>
                <span>{formatPrice(subtotal, currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Taxes, delivery charges, and discounts are calculated at
                checkout using restaurant settings.
              </p>
            </CardContent>
          </Card>

          {profile ? (
            <>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Your profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="customer-name">Name</Label>
                    <Input
                      id="customer-name"
                      maxLength={100}
                      value={profileName ?? profile.name ?? ""}
                      onChange={(event) => setProfileName(event.target.value)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {profile.phone}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={savingProfile}
                    onClick={() => void saveProfileName()}
                  >
                    {savingProfile ? "Saving..." : "Save profile"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="size-4 text-primary" />
                    Delivery address
                  </CardTitle>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={openNewAddress}
                  >
                    Add
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {addresses === undefined ? (
                    <Skeleton className="h-20 rounded-xl" />
                  ) : addresses.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Save an address to continue checkout.
                    </p>
                  ) : (
                    addresses.map((address) => (
                      <div
                        key={address._id}
                        className={`rounded-xl border p-3 ${
                          selectedAddressId === address._id
                            ? "border-primary bg-primary/5"
                            : ""
                        }`}
                      >
                        <label className="flex cursor-pointer gap-2">
                          <input
                            type="radio"
                            name="delivery-address"
                            checked={selectedAddressId === address._id}
                            onChange={() => setSelectedAddressId(address._id)}
                          />
                          <span className="min-w-0 text-sm">
                            <span className="block font-medium">
                              {address.name} · {address.phone}
                            </span>
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {address.street}, {address.area}, {address.city}{" "}
                              {address.pincode}
                            </span>
                          </span>
                        </label>
                        <div className="mt-2 flex gap-2 pl-6">
                          <button
                            type="button"
                            className="text-xs text-primary underline"
                            onClick={() => openEditAddress(address)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="text-xs text-destructive underline"
                            onClick={() => {
                              void deleteAddress({ addressId: address._id })
                                .then(() => toast.success("Address removed."))
                                .catch(() =>
                                  toast.error("Could not remove this address."),
                                );
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {menu.onlinePaymentEnabled && profile && (
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="radio"
                        name="payment-method"
                        checked={paymentMethod === "ONLINE"}
                        onChange={() => setPaymentMethod("ONLINE")}
                      />
                      <span>
                        Pay online
                        <span className="block text-xs text-muted-foreground">
                          Secured by Razorpay
                        </span>
                      </span>
                    </label>
                  )}
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="radio"
                      name="payment-method"
                      checked={paymentMethod === "COD"}
                      onChange={() => setPaymentMethod("COD")}
                    />
                    <span>Cash on delivery</span>
                  </label>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={
                      placingOrder ||
                      cartItems.length === 0 ||
                      (profile
                        ? !selectedAddress || addresses === undefined
                        : !isValidAddress(addressForm))
                    }
                    onClick={() => void placeOrder()}
                  >
                    {placingOrder
                      ? "Processing..."
                      : `Place order · ${itemCount} ${
                          itemCount === 1 ? "item" : "items"
                        }`}
                    <ArrowRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            </>
          ) : (
            <>
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MapPin className="size-4 text-primary" />
                    Delivery details
                  </CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ["name", "Recipient name"],
                      ["phone", "Mobile number"],
                      ["street", "Street and building"],
                      ["area", "Area"],
                      ["city", "City"],
                      ["pincode", "Pincode"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-1.5">
                      <Label htmlFor={`guest-${key}`}>{label}</Label>
                      <Input
                        id={`guest-${key}`}
                        type={key === "phone" ? "tel" : "text"}
                        autoComplete={
                          key === "phone"
                            ? "tel"
                            : key === "name"
                              ? "name"
                              : key === "street"
                                ? "street-address"
                                : "address-level2"
                        }
                        maxLength={key === "street" ? 200 : 100}
                        required
                        value={addressForm[key]}
                        pattern={
                          key === "phone"
                            ? "[-+0-9 ()]{10,18}"
                            : key === "pincode"
                              ? "[0-9]{4,10}"
                              : undefined
                        }
                        onChange={(event) =>
                          setAddressForm((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-base">Payment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" checked readOnly />
                    <span>Cash on delivery</span>
                  </label>
                  <p className="text-xs text-muted-foreground">
                    Guest checkout does not require an account or OTP. Keep the
                    private tracking link after placing your order.
                  </p>
                  {cartItems.length === 0 && (
                    <p className="text-sm text-destructive" role="status">
                      Add at least one menu item before placing your order.
                    </p>
                  )}
                  <Button
                    type="button"
                    className="w-full"
                    disabled={placingOrder || cartItems.length === 0}
                    onClick={() => void placeOrder()}
                  >
                    {placingOrder
                      ? "Processing..."
                      : `Place order · ${itemCount} ${
                          itemCount === 1 ? "item" : "items"
                        }`}
                    <ArrowRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            </>
          )}
        </aside>
      </div>

      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingAddressId
                ? "Edit delivery address"
                : "Add delivery address"}
            </DialogTitle>
            <DialogDescription>
              Save an address for delivery. Your phone must include a country
              code.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(event) => void saveAddress(event)}
          >
            {(
              [
                ["name", "Recipient name"],
                ["phone", "Mobile number"],
                ["street", "Street and building"],
                ["area", "Area"],
                ["city", "City"],
                ["pincode", "Pincode"],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={`address-${key}`}>{label}</Label>
                <Input
                  id={`address-${key}`}
                  type={key === "phone" ? "tel" : "text"}
                  autoComplete={
                    key === "phone"
                      ? "tel"
                      : key === "name"
                        ? "name"
                        : key === "street"
                          ? "street-address"
                          : "address-level2"
                  }
                  maxLength={key === "street" ? 200 : 100}
                  required
                  value={addressForm[key]}
                  pattern={
                    key === "phone"
                      ? "\\+[1-9][0-9]{7,14}"
                      : key === "pincode"
                        ? "[0-9]{4,10}"
                        : undefined
                  }
                  onChange={(event) =>
                    setAddressForm((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                />
              </div>
            ))}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAddressDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={savingAddress}>
                {savingAddress ? "Saving..." : "Save address"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
