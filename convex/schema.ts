import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

// ─── Role literals ────────────────────────────────────────────────
const role = v.union(
  v.literal("SUPER_ADMIN"),
  v.literal("RESTAURANT_MANAGER"),
  v.literal("RESTAURANT_STAFF"),
);

// ─── Feature flag keys ────────────────────────────────────────────
const featureFlagKey = v.union(
  v.literal("shared_cart"),
  v.literal("online_payment"),
  v.literal("call_waiter"),
  v.literal("feedback"),
  v.literal("partial_payment"),
);

// ─── Order/session statuses ───────────────────────────────────────
const orderStatus = v.union(
  v.literal("PENDING"),
  v.literal("CONFIRMED"),
  v.literal("PREPARING"),
  v.literal("READY"),
  v.literal("DELIVERED"),
  v.literal("CANCELLED"),
);

const sessionStatus = v.union(
  v.literal("ACTIVE"),
  v.literal("BILLING"),
  v.literal("CLOSED"),
);

const paymentStatus = v.union(
  v.literal("PENDING"),
  v.literal("PARTIAL"),
  v.literal("PAID"),
  v.literal("FAILED"),
);

const paymentMethod = v.union(
  v.literal("UPI"),
  v.literal("CARD"),
  v.literal("CASH"),
);

export default defineSchema({
  ...authTables,
  // ── Platform users (all staff + admins) ──────────────────────────
  users: defineTable({
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    tokenIdentifier: v.optional(v.string()),
    role: v.optional(role),
    // For RESTAURANT_MANAGER / RESTAURANT_STAFF
    restaurantId: v.optional(v.id("restaurants")),
    isActive: v.optional(v.boolean()),
    createdAt: v.optional(v.string()),
  })
    .index("email", ["email"])
    .index("by_token", ["tokenIdentifier"])
    .index("by_restaurant", ["restaurantId"])
    .index("by_role", ["role"])
    .index("by_role_and_restaurant", ["role", "restaurantId"]),

  // ── Restaurants ───────────────────────────────────────────────────
  restaurants: defineTable({
    name: v.string(),
    businessType: v.optional(
      v.union(v.literal("RESTAURANT"), v.literal("CAFE")),
    ),
    slug: v.string(), // url-friendly unique identifier
    description: v.optional(v.string()),
    logoUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    paymentQrStorageId: v.optional(v.id("_storage")),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    timezone: v.optional(v.string()),
    currency: v.optional(v.string()), // e.g. "INR"
    isActive: v.boolean(),
    createdAt: v.string(),
    updatedAt: v.string(),
    // Razorpay config
    razorpayKeyId: v.optional(v.string()),
    // Managed by super admin
    createdBy: v.optional(v.id("users")),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"]),

  // ── Feature flags per restaurant ─────────────────────────────────
  featureFlags: defineTable({
    restaurantId: v.id("restaurants"),
    key: featureFlagKey,
    enabled: v.boolean(),
    updatedAt: v.string(),
    updatedBy: v.optional(v.id("users")),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_key", ["restaurantId", "key"]),

  // ── Tables (physical tables in a restaurant) ──────────────────────
  tables: defineTable({
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(), // e.g. "T1", "T2"
    displayName: v.optional(v.string()),
    capacity: v.optional(v.number()),
    isActive: v.boolean(),
    qrCodeToken: v.string(), // permanent unique token for QR
    createdAt: v.string(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_qr_token", ["qrCodeToken"])
    .index("by_restaurant_table", ["restaurantId", "tableNumber"]),

  // ── Menu categories ───────────────────────────────────────────────
  menuCategories: defineTable({
    restaurantId: v.id("restaurants"),
    name: v.string(),
    description: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdAt: v.string(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_restaurant_sort", ["restaurantId", "sortOrder"]),

  // ── Menu items ────────────────────────────────────────────────────
  menuItems: defineTable({
    restaurantId: v.id("restaurants"),
    categoryId: v.id("menuCategories"),
    name: v.string(),
    description: v.optional(v.string()),
    price: v.number(), // in lowest denomination (paise)
    imageUrl: v.optional(v.string()),
    imageStorageId: v.optional(v.id("_storage")),
    isVeg: v.optional(v.boolean()),
    isAvailable: v.boolean(),
    sortOrder: v.number(),
    tags: v.optional(v.array(v.string())),
    createdAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_category", ["categoryId"])
    .index("by_restaurant_available", ["restaurantId", "isAvailable"]),

  // ── Sessions (one active session per table) ───────────────────────
  sessions: defineTable({
    restaurantId: v.id("restaurants"),
    tableId: v.id("tables"),
    status: sessionStatus,
    customerCount: v.number(),
    dailyCustomerCount: v.optional(v.number()), // running total for the day
    openedAt: v.string(),
    closedAt: v.optional(v.string()),
    // Billing
    totalAmount: v.optional(v.number()),
    paidAmount: v.optional(v.number()),
    billRequestedAt: v.optional(v.string()),
    billClosedAt: v.optional(v.string()),
    billClosedBy: v.optional(v.id("users")),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_table", ["tableId"])
    .index("by_table_status", ["tableId", "status"])
    .index("by_restaurant_status", ["restaurantId", "status"]),

  // ── Customer devices joined to a session ─────────────────────────
  sessionVisitors: defineTable({
    sessionId: v.id("sessions"),
    customerId: v.string(),
    joinedAt: v.string(),
  }).index("by_session_and_customer", ["sessionId", "customerId"]),

  // ── Cart items (shared realtime cart per session) ─────────────────
  cartItems: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.id("sessions"),
    menuItemId: v.id("menuItems"),
    quantity: v.number(),
    notes: v.optional(v.string()),
    addedBy: v.optional(v.string()), // customer device identifier
    addedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_session", ["sessionId"])
    .index("by_restaurant_session", ["restaurantId", "sessionId"]),

  // ── Orders ────────────────────────────────────────────────────────
  orders: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.id("sessions"),
    tableId: v.id("tables"),
    status: orderStatus,
    customerId: v.optional(v.string()),
    items: v.array(
      v.object({
        menuItemId: v.id("menuItems"),
        name: v.string(),
        price: v.number(),
        quantity: v.number(),
        notes: v.optional(v.string()),
      }),
    ),
    subtotal: v.number(),
    tax: v.optional(v.number()),
    total: v.number(),
    placedAt: v.string(),
    confirmedAt: v.optional(v.string()),
    preparingAt: v.optional(v.string()),
    readyAt: v.optional(v.string()),
    deliveredAt: v.optional(v.string()),
    cancelledAt: v.optional(v.string()),
    cancellationDeadline: v.optional(v.string()), // 3-min window
    cancelledBy: v.optional(v.string()),
    cancelReason: v.optional(v.string()),
    // Managed by staff
    handledBy: v.optional(v.id("users")),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_session", ["sessionId"])
    .index("by_session_and_status", ["sessionId", "status"])
    .index("by_table", ["tableId"])
    .index("by_restaurant_status", ["restaurantId", "status"]),

  // ── Payments ──────────────────────────────────────────────────────
  payments: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.id("sessions"),
    amount: v.number(),
    method: paymentMethod,
    status: paymentStatus,
    // Razorpay fields
    razorpayOrderId: v.optional(v.string()),
    razorpayPaymentId: v.optional(v.string()),
    razorpaySignature: v.optional(v.string()),
    // Meta
    initiatedAt: v.string(),
    completedAt: v.optional(v.string()),
    failedAt: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    processedBy: v.optional(v.id("users")), // for cash payments
    requestId: v.optional(v.string()), // for structured logging
  })
    .index("by_session", ["sessionId"])
    .index("by_restaurant", ["restaurantId"])
    .index("by_razorpay_order", ["razorpayOrderId"]),

  // ── Waiter requests ───────────────────────────────────────────────
  waiterRequests: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.id("sessions"),
    tableId: v.id("tables"),
    requestType: v.union(
      v.literal("CALL_WAITER"),
      v.literal("REQUEST_BILL"),
      v.literal("CASH_PAYMENT"),
      v.literal("WATER"),
      v.literal("OTHER"),
    ),
    message: v.optional(v.string()),
    status: v.union(
      v.literal("PENDING"),
      v.literal("ACKNOWLEDGED"),
      v.literal("RESOLVED"),
    ),
    requestedAt: v.string(),
    acknowledgedAt: v.optional(v.string()),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_session", ["sessionId"])
    .index("by_restaurant_status", ["restaurantId", "status"]),

  // ── Feedback ──────────────────────────────────────────────────────
  feedback: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.id("sessions"),
    rating: v.number(), // 1–5
    comment: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    submittedAt: v.string(),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_session", ["sessionId"]),

  // ── Recent customer actions shown to staff ───────────────────────
  staffNotifications: defineTable({
    restaurantId: v.id("restaurants"),
    sessionId: v.id("sessions"),
    tableId: v.id("tables"),
    eventType: v.union(
      v.literal("TABLE_SESSION_OPENED"),
      v.literal("CART_CHANGED"),
      v.literal("ORDER_PLACED"),
      v.literal("ORDER_CANCELLED"),
      v.literal("WAITER_REQUESTED"),
      v.literal("BILL_REQUESTED"),
      v.literal("CASH_PAYMENT_REQUESTED"),
      v.literal("PAYMENT_CONFIRMED"),
      v.literal("WATER_REQUESTED"),
      v.literal("FEEDBACK_SUBMITTED"),
    ),
    orderId: v.optional(v.id("orders")),
    message: v.string(),
    createdAt: v.string(),
  })
    .index("by_restaurant_and_created_at", ["restaurantId", "createdAt"])
    .index("by_session", ["sessionId"]),

  // ── Audit logs ────────────────────────────────────────────────────
  auditLogs: defineTable({
    actorId: v.optional(v.id("users")),
    actorRole: v.optional(v.string()),
    restaurantId: v.optional(v.id("restaurants")),
    action: v.string(), // e.g. "CREATE_RESTAURANT", "TOGGLE_FEATURE"
    targetType: v.optional(v.string()), // e.g. "restaurant", "user"
    targetId: v.optional(v.string()),
    details: v.optional(v.string()), // JSON stringified
    requestId: v.optional(v.string()),
    timestamp: v.string(),
    environment: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_actor", ["actorId"])
    .index("by_action", ["action"]),

  // ── Error logs ────────────────────────────────────────────────────
  errorLogs: defineTable({
    restaurantId: v.optional(v.id("restaurants")),
    reporterId: v.optional(v.id("users")),
    userRole: v.optional(v.string()),
    feature: v.optional(v.string()),
    module: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    message: v.string(),
    cause: v.optional(v.string()),
    action: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    occurrences: v.optional(v.number()),
    lastSeenAt: v.optional(v.string()),
    stack: v.optional(v.string()),
    requestId: v.optional(v.string()),
    timestamp: v.string(),
    environment: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    status: v.union(
      v.literal("NEW"),
      v.literal("REVIEWED"),
      v.literal("RESOLVED"),
    ),
    resolvedAt: v.optional(v.string()),
    resolvedBy: v.optional(v.id("users")),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_status", ["status"])
    .index("by_timestamp", ["timestamp"])
    .index("by_status_and_timestamp", ["status", "timestamp"])
    .index("by_reporter_fingerprint", ["reporterId", "fingerprint"])
    .index("by_reporter_last_seen", ["reporterId", "lastSeenAt"]),

  // ── Support tickets ───────────────────────────────────────────────
  supportTickets: defineTable({
    restaurantId: v.id("restaurants"),
    subject: v.string(),
    description: v.string(),
    status: v.union(
      v.literal("OPEN"),
      v.literal("IN_PROGRESS"),
      v.literal("RESOLVED"),
      v.literal("CLOSED"),
    ),
    priority: v.union(
      v.literal("LOW"),
      v.literal("MEDIUM"),
      v.literal("HIGH"),
      v.literal("CRITICAL"),
    ),
    submittedBy: v.optional(v.id("users")),
    assignedTo: v.optional(v.id("users")),
    notes: v.optional(v.string()),
    createdAt: v.string(),
    updatedAt: v.string(),
    resolvedAt: v.optional(v.string()),
  })
    .index("by_restaurant", ["restaurantId"])
    .index("by_status", ["status"])
    .index("by_priority", ["priority"]),
});
