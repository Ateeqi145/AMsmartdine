import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useParams } from "react-router-dom";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Ban,
  Check,
  ChefHat,
  ChevronRight,
  CircleDot,
  Clock3,
  Minus,
  Plus,
  ReceiptText,
  Search,
  ShoppingBag,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx";
import { CustomerBillPanel } from "./_components/customer-bill-page";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/theme-toggle";

function getCustomerId() {
  const storageKey = "smartdine-customer-id";
  const existingId = window.localStorage.getItem(storageKey);
  if (existingId) return existingId;

  const customerId = window.crypto.randomUUID();
  window.localStorage.setItem(storageKey, customerId);
  return customerId;
}

function getSavedSessionId(qrToken?: string): Id<"sessions"> | null {
  if (!qrToken) return null;
  const saved = window.localStorage.getItem(`smartdine-session:${qrToken}`);
  return saved ? (saved as Id<"sessions">) : null;
}

function formatPrice(amountInPaise: number, currency: string) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

function readableStatus(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function MenuLoading() {
  return (
    <div className="space-y-5">
      <Skeleton className="h-24 w-full rounded-3xl" />
      <Skeleton className="h-11 w-full rounded-2xl" />
      <div className="space-y-3">
        {[0, 1, 2].map((item) => (
          <Skeleton key={item} className="h-32 w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

export default function TablePage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const tableInfo = useQuery(
    api.tables.getByQrToken,
    qrToken ? { qrCodeToken: qrToken } : "skip",
  );
  const openOrJoinSession = useMutation(api.sessions.openOrJoinSession);
  const [sessionId, setSessionId] = useState<Id<"sessions"> | null>(() =>
    getSavedSessionId(qrToken),
  );
  const session = useQuery(
    api.sessions.getById,
    sessionId ? { sessionId } : "skip",
  );
  const savedSessionTableMismatch = Boolean(
    sessionId &&
    session !== undefined &&
    tableInfo?.table &&
    (!session || session.table?._id !== tableInfo.table._id),
  );
  const savedSessionOrders = useQuery(
    api.orders.listBySession,
    sessionId && !savedSessionTableMismatch ? { sessionId } : "skip",
  );
  const savedSessionIsClosedUnused =
    session?.session.status === "CLOSED" &&
    savedSessionOrders !== undefined &&
    savedSessionOrders.length === 0;
  const savedSessionIsStale = savedSessionTableMismatch;
  const activeSessionId = savedSessionIsStale ? null : sessionId;
  const [sessionRetry, setSessionRetry] = useState(0);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [customerId] = useState(getCustomerId);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [busyItemId, setBusyItemId] = useState<Id<"menuItems"> | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [placedOrderId, setPlacedOrderId] = useState<Id<"orders"> | null>(null);
  const [cancellingOrderId, setCancellingOrderId] =
    useState<Id<"orders"> | null>(null);

  useEffect(() => {
    const table = tableInfo?.table;
    const restaurant = tableInfo?.restaurant;
    if (
      !table ||
      !restaurant ||
      !table.isActive ||
      !restaurant.isActive ||
      activeSessionId
    )
      return;

    if (savedSessionIsStale && qrToken) {
      window.localStorage.removeItem(`smartdine-session:${qrToken}`);
    }

    let active = true;
    openOrJoinSession({
      tableId: table._id,
      restaurantId: restaurant._id,
      customerCount: 1,
      customerId,
    })
      .then(({ sessionId: openedSessionId }) => {
        if (active) {
          window.localStorage.setItem(
            `smartdine-session:${qrToken}`,
            openedSessionId,
          );
          setSessionId(openedSessionId);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setSessionError(
            error instanceof Error
              ? error.message
              : "Could not open this table session.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [
    customerId,
    openOrJoinSession,
    qrToken,
    activeSessionId,
    savedSessionIsStale,
    sessionRetry,
    tableInfo,
  ]);

  const menuCategories = tableInfo?.categories;
  const menuItems = tableInfo?.menuItems;
  const cart = useQuery(
    api.cart.getCart,
    activeSessionId ? { sessionId: activeSessionId, customerId } : "skip",
  );
  const orders = activeSessionId ? savedSessionOrders : undefined;
  const addToCart = useMutation(api.cart.addToCart);
  const updateCartItem = useMutation(api.cart.updateCartItem);
  const placeOrder = useMutation(api.orders.placeOrder);
  const cancelOrder = useMutation(api.orders.cancelOrder);

  const activeCategories = useMemo(
    () =>
      (menuCategories ?? [])
        .filter((category) => category.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [menuCategories],
  );
  const availableItems = useMemo(
    () => (menuItems ?? []).slice().sort((a, b) => a.sortOrder - b.sortOrder),
    [menuItems],
  );
  const cartEntries = useMemo(
    () => (cart ?? []).flatMap((entry) => (entry.menuItem ? [entry] : [])),
    [cart],
  );
  const subtotal = cartEntries.reduce(
    (total, entry) => total + entry.menuItem!.price * entry.quantity,
    0,
  );
  const itemCount = cartEntries.reduce(
    (total, entry) => total + entry.quantity,
    0,
  );
  const currency = tableInfo?.restaurant?.currency ?? "INR";
  const isOrderable = session?.session.status === "ACTIVE";
  const hasOrders = (orders?.length ?? 0) > 0;

  const visibleCategories = activeCategories.filter((category) => {
    if (selectedCategory !== "all" && category._id !== selectedCategory)
      return false;
    return availableItems.some(
      (item) =>
        item.categoryId === category._id &&
        (!search ||
          item.name.toLowerCase().includes(search.toLowerCase()) ||
          item.description?.toLowerCase().includes(search.toLowerCase())),
    );
  });

  const quantityFor = (menuItemId: Id<"menuItems">) =>
    cartEntries.find((entry) => entry.menuItemId === menuItemId);

  const changeQuantity = async (menuItemId: Id<"menuItems">, delta: number) => {
    if (!activeSessionId || !isOrderable) return;
    setBusyItemId(menuItemId);
    try {
      const existing = quantityFor(menuItemId);
      if (existing && delta < 0) {
        await updateCartItem({
          cartItemId: existing._id,
          quantity: existing.quantity - 1,
          customerId,
        });
      } else {
        await addToCart({
          sessionId: activeSessionId,
          menuItemId,
          quantity: 1,
          customerId,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update your order.",
      );
    } finally {
      setBusyItemId(null);
    }
  };

  const handleCancelOrder = async (orderId: Id<"orders">) => {
    if (cancellingOrderId) return;
    setCancellingOrderId(orderId);
    try {
      await cancelOrder({
        orderId,
        customerId,
        reason: "Cancelled by customer before preparation",
      });
      toast.success("Order cancelled");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not cancel the order.",
      );
    } finally {
      setCancellingOrderId(null);
    }
  };

  const startNewVisit = () => {
    if (qrToken) window.localStorage.removeItem(`smartdine-session:${qrToken}`);
    setBillOpen(false);
    setSessionId(null);
    setSessionError(null);
  };

  const submitOrder = async () => {
    if (!activeSessionId || !isOrderable || itemCount === 0) return;
    setPlacingOrder(true);
    try {
      const orderId = await placeOrder({
        sessionId: activeSessionId,
        customerId,
      });
      setPlacedOrderId(orderId);
      setCartOpen(false);
      toast.success("Order sent to the kitchen");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not place your order.",
      );
    } finally {
      setPlacingOrder(false);
    }
  };

  if (tableInfo === undefined) {
    return (
      <main className="mx-auto min-h-screen max-w-xl px-4 py-8">
        <MenuLoading />
      </main>
    );
  }

  if (
    !tableInfo?.table ||
    !tableInfo.restaurant ||
    !tableInfo.table.isActive ||
    !tableInfo.restaurant.isActive
  ) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <section className="max-w-sm text-center">
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <UtensilsCrossed className="size-6" />
          </div>
          <h1 className="text-xl font-semibold">This table is unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This QR code may be invalid, or the restaurant has temporarily
            disabled this table.
          </p>
        </section>
      </main>
    );
  }

  const { table, restaurant } = tableInfo;
  const tableName = table.displayName ?? `Table ${table.tableNumber}`;
  const isOccupied = sessionError?.toLowerCase().includes("occupied") ?? false;

  if (isOccupied) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-muted/30 px-6">
        <section className="w-full max-w-sm rounded-2xl border bg-background p-6 text-center">
          {restaurant.logoUrl ? (
            <img
              src={restaurant.logoUrl}
              alt=""
              className="mx-auto mb-4 size-14 rounded-xl object-cover"
            />
          ) : (
            <UtensilsCrossed className="mx-auto mb-4 size-8 text-primary" />
          )}
          <p className="text-sm font-semibold">{restaurant.name}</p>
          <h1 className="mt-2 text-xl font-bold">This table is occupied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tableName} already has an active customer session. Please wait for
            that visit to finish or ask a staff member for help.
          </p>
          <Button
            variant="outline"
            className="mt-5 w-full"
            onClick={() => {
              setSessionError(null);
              setSessionRetry((attempt) => attempt + 1);
            }}
          >
            Check again
          </Button>
        </section>
      </main>
    );
  }

  if (session?.session.status === "CLOSED" && activeSessionId) {
    return (
      <main className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-bold">{restaurant.name}</p>
              <p className="text-xs text-muted-foreground">{tableName}</p>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <section className="mx-auto max-w-2xl space-y-5 px-4 py-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {savedSessionIsClosedUnused ? "Session closed" : "Visit complete"}
            </p>
            <h1 className="mt-2 text-2xl font-bold">
              {savedSessionIsClosedUnused
                ? "This unused session was closed"
                : "Thank you for dining"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {savedSessionIsClosedUnused
                ? "Staff closed this table session because no order was placed."
                : "Your bill is settled. We would love to hear how your visit went."}
            </p>
          </div>
          {!savedSessionIsClosedUnused && (
            <div className="rounded-2xl border bg-background">
              <CustomerBillPanel sessionId={activeSessionId} />
            </div>
          )}
          <Button className="w-full" variant="outline" onClick={startNewVisit}>
            Start a new visit
          </Button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-muted/30 pb-32">
      <header className="border-b bg-background">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {restaurant.logoUrl ? (
              <img
                src={restaurant.logoUrl}
                alt=""
                className="size-10 rounded-xl object-cover"
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
              />
            ) : (
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <UtensilsCrossed className="size-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{restaurant.name}</p>
              <p className="text-xs text-muted-foreground">{tableName}</p>
            </div>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4">
        <section className="py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Scan. Choose. Enjoy.
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {restaurant.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse the menu and order straight to {tableName.toLowerCase()}.
          </p>
          {restaurant.description && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              {restaurant.description}
            </p>
          )}
        </section>

        {sessionError && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="text-sm font-medium text-destructive">
              {sessionError}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSessionError(null);
                setSessionRetry((attempt) => attempt + 1);
              }}
            >
              Try connecting again
            </Button>
          </div>
        )}

        {activeSessionId && !session && (
          <div className="mb-4 flex items-center gap-3 rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
            <Clock3 className="size-4 animate-pulse" />
            Connecting your table...
          </div>
        )}

        {session?.session.status === "BILLING" && (
          <div className="mb-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-sm">
            <p className="font-semibold">Your bill has been requested</p>
            <p className="mt-1 text-muted-foreground">
              New orders are paused while the team prepares your bill.
            </p>
          </div>
        )}

        {session?.session.status === "CLOSED" && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-2xl border bg-background p-4 text-sm">
            <div>
              <p className="font-semibold">This table session is closed</p>
              <p className="mt-1 text-muted-foreground">
                Your bill is settled. Share feedback or start a new visit.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={startNewVisit}>
              New visit
            </Button>
          </div>
        )}

        {hasOrders && (
          <section aria-label="Your orders" className="mb-7 space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  Kitchen updates
                </p>
                <h2 className="mt-1 text-lg font-bold">Your orders</h2>
              </div>
              <span className="text-xs text-muted-foreground">
                Updates live
              </span>
            </div>
            {(orders ?? []).map((order) => (
              <article
                key={order._id}
                className={`rounded-2xl border bg-background p-4 ${
                  order._id === placedOrderId ? "border-primary/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      Order #{order._id.slice(-5).toUpperCase()}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {order.items.reduce(
                        (sum, item) => sum + item.quantity,
                        0,
                      )}{" "}
                      items · {formatPrice(order.total, currency)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                    <CircleDot className="size-3" />
                    {readableStatus(order.status)}
                  </span>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">
                  {order.items
                    .map((item) => `${item.quantity} × ${item.name}`)
                    .join(" · ")}
                </p>
                {(order.status === "PENDING" || order.status === "CONFIRMED") &&
                  (!order.customerId || order.customerId === customerId) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2 text-destructive hover:text-destructive"
                      disabled={cancellingOrderId === order._id}
                      onClick={() => void handleCancelOrder(order._id)}
                    >
                      <Ban className="size-3.5" />
                      {cancellingOrderId === order._id
                        ? "Cancelling…"
                        : "Cancel order"}
                    </Button>
                  )}
                {order.status === "CONFIRMED" && (
                  <p className="mt-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <Clock3 className="size-4 text-primary" />
                    Order accepted. Please wait until your order is ready.
                  </p>
                )}
                {order.status === "PREPARING" && (
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <ChefHat className="size-4 text-primary" />
                    The kitchen is working on your order.
                  </p>
                )}
                {order.status === "READY" && (
                  <p className="mt-3 flex items-center gap-2 text-xs font-medium text-primary">
                    <Check className="size-4" />
                    Your order is ready. Please collect it from the counter.
                  </p>
                )}
              </article>
            ))}
          </section>
        )}

        <section aria-label="Menu">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Made for you
              </p>
              <h2 className="mt-1 text-2xl font-bold">Menu</h2>
            </div>
            <span className="text-xs text-muted-foreground">
              {availableItems.length} available{" "}
              {availableItems.length === 1 ? "item" : "items"}
            </span>
          </div>

          <label className="relative mb-4 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search dishes"
              aria-label="Search dishes"
              className="h-11 rounded-2xl border-0 bg-background pl-10 shadow-sm"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setSearch("")}
              >
                <X className="size-4" />
              </button>
            )}
          </label>

          {menuCategories === undefined || menuItems === undefined ? (
            <MenuLoading />
          ) : (
            <>
              <nav
                aria-label="Menu categories"
                className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1"
              >
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                    selectedCategory === "all"
                      ? "bg-foreground text-background"
                      : "bg-background text-muted-foreground"
                  }`}
                >
                  All
                </button>
                {activeCategories.map((category) => (
                  <button
                    key={category._id}
                    type="button"
                    onClick={() => setSelectedCategory(category._id)}
                    className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                      selectedCategory === category._id
                        ? "bg-foreground text-background"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {category.name}
                  </button>
                ))}
              </nav>

              {visibleCategories.length === 0 ? (
                <div className="rounded-3xl border border-dashed bg-background px-5 py-12 text-center">
                  <ShoppingBag className="mx-auto size-7 text-muted-foreground/60" />
                  <h3 className="mt-3 font-semibold">
                    {search
                      ? "No dishes match your search"
                      : "The menu is being prepared"}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {search
                      ? "Try another dish name or clear your search."
                      : "Please check back with the team shortly."}
                  </p>
                </div>
              ) : (
                <div className="space-y-7">
                  {visibleCategories.map((category) => {
                    const items = availableItems.filter(
                      (item) =>
                        item.categoryId === category._id &&
                        (!search ||
                          item.name
                            .toLowerCase()
                            .includes(search.toLowerCase()) ||
                          item.description
                            ?.toLowerCase()
                            .includes(search.toLowerCase())),
                    );
                    if (items.length === 0) return null;
                    return (
                      <section key={category._id}>
                        <div className="mb-3">
                          <h3 className="text-lg font-bold">{category.name}</h3>
                          {category.description && (
                            <p className="mt-1 text-sm text-muted-foreground">
                              {category.description}
                            </p>
                          )}
                        </div>
                        <div className="space-y-3">
                          {items.map((item) => {
                            const entry = quantityFor(item._id);
                            return (
                              <article
                                key={item._id}
                                className="flex min-h-32 gap-3 rounded-2xl border bg-background p-3 shadow-sm shadow-black/[0.02]"
                              >
                                <div className="relative flex min-w-0 flex-1 flex-col py-1">
                                  <div className="flex items-center gap-1.5">
                                    {item.isVeg !== undefined && (
                                      <span
                                        aria-label={
                                          item.isVeg
                                            ? "Vegetarian"
                                            : "Non-vegetarian"
                                        }
                                        title={
                                          item.isVeg
                                            ? "Vegetarian"
                                            : "Non-vegetarian"
                                        }
                                        className={`flex size-4 items-center justify-center rounded-[4px] border ${
                                          item.isVeg
                                            ? "border-green-600 text-green-600"
                                            : "border-red-600 text-red-600"
                                        }`}
                                      >
                                        <span
                                          className={`size-1.5 rounded-full ${
                                            item.isVeg
                                              ? "bg-green-600"
                                              : "bg-red-600"
                                          }`}
                                        />
                                      </span>
                                    )}
                                    {item.tags?.slice(0, 1).map((tag) => (
                                      <span
                                        key={tag}
                                        className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                                      >
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                  <h4 className="mt-2 font-semibold leading-snug">
                                    {item.name}
                                  </h4>
                                  {item.description && (
                                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                      {item.description}
                                    </p>
                                  )}
                                  <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                                    <span className="text-sm font-bold">
                                      {formatPrice(item.price, currency)}
                                    </span>
                                    {entry ? (
                                      <div className="flex h-9 items-center gap-3 rounded-xl bg-primary px-2 text-primary-foreground">
                                        <button
                                          type="button"
                                          aria-label={`Remove one ${item.name}`}
                                          disabled={
                                            busyItemId === item._id ||
                                            !isOrderable
                                          }
                                          onClick={() =>
                                            void changeQuantity(item._id, -1)
                                          }
                                          className="grid size-7 place-items-center rounded-lg hover:bg-white/15 disabled:opacity-50"
                                        >
                                          <Minus className="size-4" />
                                        </button>
                                        <span className="min-w-4 text-center text-sm font-semibold">
                                          {entry.quantity}
                                        </span>
                                        <button
                                          type="button"
                                          aria-label={`Add one ${item.name}`}
                                          disabled={
                                            busyItemId === item._id ||
                                            !isOrderable
                                          }
                                          onClick={() =>
                                            void changeQuantity(item._id, 1)
                                          }
                                          className="grid size-7 place-items-center rounded-lg hover:bg-white/15 disabled:opacity-50"
                                        >
                                          <Plus className="size-4" />
                                        </button>
                                      </div>
                                    ) : (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-9 rounded-xl border-primary/30 px-4 text-primary hover:bg-primary hover:text-primary-foreground"
                                        disabled={
                                          !isOrderable ||
                                          busyItemId === item._id
                                        }
                                        onClick={() =>
                                          void changeQuantity(item._id, 1)
                                        }
                                      >
                                        {busyItemId === item._id
                                          ? "Adding..."
                                          : "Add"}
                                        <Plus className="ml-1 size-3.5" />
                                      </Button>
                                    )}
                                  </div>
                                </div>
                                <div className="relative size-28 shrink-0 overflow-hidden rounded-xl bg-muted sm:size-32">
                                  {item.imageUrl ? (
                                    <img
                                      src={item.imageUrl}
                                      alt={item.name}
                                      loading="lazy"
                                      className="size-full object-cover"
                                      onError={(event) => {
                                        event.currentTarget.style.display =
                                          "none";
                                      }}
                                    />
                                  ) : (
                                    <div className="grid size-full place-items-center text-muted-foreground/40">
                                      <UtensilsCrossed className="size-7" />
                                    </div>
                                  )}
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
            </>
          )}
        </section>

        {hasOrders && activeSessionId && (
          <section className="mt-8 border-t pt-6">
            <Button
              variant="outline"
              className="w-full justify-between rounded-2xl bg-background"
              onClick={() => setBillOpen(true)}
            >
              <span className="flex items-center gap-2">
                <ReceiptText className="size-4 text-primary" />
                Bill and payment
              </span>
              <ChevronRight className="size-4" />
            </Button>
          </section>
        )}
      </div>

      {itemCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                {itemCount} {itemCount === 1 ? "item" : "items"} in your order
              </p>
              <p className="truncate text-base font-bold">
                {formatPrice(subtotal, currency)}
              </p>
            </div>
            <Button
              className="h-12 rounded-2xl px-5"
              disabled={!isOrderable || cart === undefined}
              onClick={() => setCartOpen(true)}
            >
              View order <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent
          side="bottom"
          className="mx-auto max-h-[90vh] max-w-2xl overflow-y-auto rounded-t-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          <SheetHeader className="px-0 pr-10">
            <SheetTitle>Your order</SheetTitle>
            <SheetDescription>
              Review your items before sending them to the kitchen.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-3">
            {cartEntries.map((entry) => (
              <div
                key={entry._id}
                className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {entry.menuItem!.name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatPrice(entry.menuItem!.price, currency)} each
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label={`Remove one ${entry.menuItem!.name}`}
                    disabled={busyItemId === entry.menuItemId}
                    onClick={() => void changeQuantity(entry.menuItemId, -1)}
                    className="grid size-8 place-items-center rounded-lg border bg-background disabled:opacity-50"
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="w-5 text-center text-sm font-semibold">
                    {entry.quantity}
                  </span>
                  <button
                    type="button"
                    aria-label={`Add one ${entry.menuItem!.name}`}
                    disabled={busyItemId === entry.menuItemId}
                    onClick={() => void changeQuantity(entry.menuItemId, 1)}
                    className="grid size-8 place-items-center rounded-lg border bg-background disabled:opacity-50"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                <span className="w-16 text-right text-sm font-semibold">
                  {formatPrice(
                    entry.menuItem!.price * entry.quantity,
                    currency,
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t pt-4">
            <div className="flex items-center justify-between text-base font-bold">
              <span>Subtotal</span>
              <span>{formatPrice(subtotal, currency)}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Any applicable taxes will be shown on your final bill.
            </p>
            <Button
              className="mt-4 h-12 w-full rounded-2xl"
              disabled={
                placingOrder || !isOrderable || cartEntries.length === 0
              }
              onClick={() => void submitOrder()}
            >
              {placingOrder
                ? "Sending order..."
                : `Send order · ${formatPrice(subtotal, currency)}`}
            </Button>
            {!isOrderable && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Ordering is unavailable for this table right now.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {activeSessionId && (
        <Sheet open={billOpen} onOpenChange={setBillOpen}>
          <SheetContent
            side="bottom"
            className="mx-auto max-h-[90vh] max-w-2xl overflow-y-auto rounded-t-3xl px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
          >
            <SheetHeader className="px-0 pr-10">
              <SheetTitle>Bill and payment</SheetTitle>
              <SheetDescription>
                Review your order total and scan the UPI payment QR code.
              </SheetDescription>
            </SheetHeader>
            <CustomerBillPanel sessionId={activeSessionId} />
          </SheetContent>
        </Sheet>
      )}
    </main>
  );
}
