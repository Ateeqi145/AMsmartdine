export type SavedDeliveryOrder = {
  orderId: string;
  trackingToken: string;
  restaurantSlug: string;
  placedAt: string;
};

const STORAGE_KEY = "smartdine-delivery-orders";
const MAX_SAVED_ORDERS = 50;

function isSavedDeliveryOrder(value: unknown): value is SavedDeliveryOrder {
  if (!value || typeof value !== "object") return false;
  const order = value as Record<string, unknown>;
  return (
    typeof order.orderId === "string" &&
    order.orderId.length > 0 &&
    order.orderId.length <= 128 &&
    typeof order.trackingToken === "string" &&
    /^[a-f0-9]{64}$/i.test(order.trackingToken) &&
    typeof order.restaurantSlug === "string" &&
    /^[a-z0-9][a-z0-9-]{0,80}$/i.test(order.restaurantSlug) &&
    typeof order.placedAt === "string" &&
    order.placedAt.length <= 40
  );
}

export function getSavedDeliveryOrders(): SavedDeliveryOrder[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    console.warn("Saved delivery order history could not be parsed.");
    return [];
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isSavedDeliveryOrder).slice(0, MAX_SAVED_ORDERS);
}

export function saveDeliveryOrder(order: SavedDeliveryOrder) {
  const current = getSavedDeliveryOrders().filter(
    (saved) => saved.orderId !== order.orderId,
  );
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify([order, ...current].slice(0, MAX_SAVED_ORDERS)),
  );
}

export function getDeliveryTrackingPath(order: SavedDeliveryOrder) {
  return `/delivery/track/${order.orderId}#${order.trackingToken}`;
}
