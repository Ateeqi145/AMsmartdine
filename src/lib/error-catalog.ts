export type ErrorCode =
  | "AUTH_NOT_AUTHENTICATED"
  | "AUTH_USER_INACTIVE"
  | "AUTH_SUPER_ADMIN_REQUIRED"
  | "AUTH_RESTAURANT_ACCESS_REQUIRED"
  | "AUTH_MANAGER_REQUIRED"
  | "AUTH_ROLE_MISSING"
  | "CONVEX_URL_MISSING"
  | "BACKEND_CONNECTION_FAILED"
  | "AUTH_DEPLOYMENT_CONFIG"
  | "VERCEL_ROUTE_NOT_FOUND"
  | "QR_TOKEN_INVALID"
  | "TABLE_INACTIVE"
  | "RESTAURANT_INACTIVE"
  | "SESSION_NOT_ACTIVE"
  | "MENU_EMPTY"
  | "CART_EMPTY"
  | "MENU_ITEM_UNAVAILABLE"
  | "DUPLICATE_TABLE_NUMBER"
  | "TABLE_HAS_ACTIVE_SESSION"
  | "CATEGORY_NOT_EMPTY"
  | "WAITER_FEATURE_DISABLED"
  | "ONLINE_PAYMENT_DISABLED"
  | "RAZORPAY_NOT_CONFIGURED"
  | "PAYMENT_SIGNATURE_INVALID"
  | "PAYMENT_EXCEEDS_BALANCE"
  | "CASH_EXCEEDS_BALANCE"
  | "BILL_HAS_OUTSTANDING_BALANCE"
  | "FEEDBACK_DISABLED"
  | "FEEDBACK_REQUIRES_PAID_BILL"
  | "FEEDBACK_ALREADY_SUBMITTED"
  | "ASSET_LOAD_FAILED"
  | "CLIENT_UNHANDLED_ERROR"
  | "CLIENT_UNHANDLED_REJECTION"
  | "UNKNOWN_ERROR";

export type RuntimeErrorCode =
  | "CLIENT_UNHANDLED_ERROR"
  | "CLIENT_UNHANDLED_REJECTION"
  | "ASSET_LOAD_FAILED"
  | "BACKEND_CONNECTION_FAILED";

export interface ErrorGuide {
  code: ErrorCode;
  name: string;
  feature: string;
  cause: string;
  action: string;
  href?: string;
}

export const ERROR_GUIDES: ErrorGuide[] = [
  {
    code: "AUTH_NOT_AUTHENTICATED",
    name: "Authentication required",
    feature: "Sign-in",
    cause:
      "The request has no valid Convex Auth session. The browser may be signed out or the auth token may have expired.",
    action:
      "Sign in again. If login stays pending, verify that VITE_CONVEX_URL points to the same Convex deployment that hosts the account.",
    href: "/",
  },
  {
    code: "AUTH_USER_INACTIVE",
    name: "User account inactive",
    feature: "Account access",
    cause: "The account is marked inactive in the Convex users table.",
    action: "A Super Admin can activate the account from Users.",
    href: "/super-admin/users",
  },
  {
    code: "AUTH_SUPER_ADMIN_REQUIRED",
    name: "Super Admin permission required",
    feature: "Administration",
    cause:
      "The signed-in user does not have the SUPER_ADMIN role required by this operation.",
    action:
      "Sign in with a Super Admin account or have an existing Super Admin update your role in Users.",
    href: "/super-admin/users",
  },
  {
    code: "AUTH_RESTAURANT_ACCESS_REQUIRED",
    name: "Restaurant access required",
    feature: "Restaurant operations",
    cause:
      "The account is not assigned to the restaurant targeted by the request, or lacks a manager/staff role.",
    action:
      "Verify the restaurant assignment under Super Admin → Users, then sign out and back in.",
    href: "/super-admin/users",
  },
  {
    code: "AUTH_MANAGER_REQUIRED",
    name: "Restaurant Manager permission required",
    feature: "Tables and menu setup",
    cause:
      "The request is manager-only; staff access does not permit creating or deleting tables or editing other protected settings.",
    action:
      "A Super Admin must assign Restaurant Manager to this account for the correct restaurant.",
    href: "/super-admin/users",
  },
  {
    code: "AUTH_ROLE_MISSING",
    name: "Account role not assigned",
    feature: "Account access",
    cause:
      "New accounts do not receive a restaurant role automatically, so protected pages reject them.",
    action: "A Super Admin must assign a role and restaurant in Users.",
    href: "/super-admin/users",
  },
  {
    code: "CONVEX_URL_MISSING",
    name: "Convex deployment URL missing",
    feature: "Deployment configuration",
    cause: "VITE_CONVEX_URL was not present when Vite built the website.",
    action:
      "Set VITE_CONVEX_URL in Vercel for the relevant environment and redeploy. Use the matching deployment's .convex.cloud URL.",
  },
  {
    code: "BACKEND_CONNECTION_FAILED",
    name: "Convex backend unreachable",
    feature: "Backend connectivity",
    cause:
      "The browser could not connect to the configured Convex deployment. This can be an incorrect URL, unavailable deployment, or network interruption.",
    action:
      "Check Vercel's VITE_CONVEX_URL, confirm the Convex deployment is running, and inspect browser Network errors.",
  },
  {
    code: "AUTH_DEPLOYMENT_CONFIG",
    name: "Convex Auth deployment configuration mismatch",
    feature: "Sign-in",
    cause:
      "JWT_PRIVATE_KEY/JWKS or the auth provider domain is missing or belongs to a different Convex deployment.",
    action:
      "Check JWT_PRIVATE_KEY, JWKS, and CONVEX_SITE_URL on the same Convex deployment used by VITE_CONVEX_URL. Never copy private keys into Vercel frontend variables.",
  },
  {
    code: "VERCEL_ROUTE_NOT_FOUND",
    name: "Direct QR route returns 404",
    feature: "QR ordering",
    cause:
      "Vercel did not rewrite the SPA route to index.html, or the deployment does not include vercel.json.",
    action:
      "Include vercel.json in the Vercel deployment and redeploy. Test the direct /table/<token> URL before printing a QR.",
    href: "/restaurant/tables",
  },
  {
    code: "QR_TOKEN_INVALID",
    name: "QR code token invalid",
    feature: "QR ordering",
    cause:
      "No table has the token encoded in this QR. The QR may be stale after regeneration or point to another environment.",
    action:
      "Open Tables & QR Codes in the correct restaurant and download its current QR. Check the URL hostname matches this deployment.",
    href: "/restaurant/tables",
  },
  {
    code: "TABLE_INACTIVE",
    name: "Table inactive",
    feature: "QR ordering",
    cause:
      "The table exists but is switched off, so a customer session cannot start.",
    action: "Activate the table in Tables & QR Codes.",
    href: "/restaurant/tables",
  },
  {
    code: "RESTAURANT_INACTIVE",
    name: "Restaurant inactive",
    feature: "QR ordering",
    cause:
      "The restaurant has been deactivated, which prevents customer ordering.",
    action: "A Super Admin can reactivate the restaurant from its detail page.",
    href: "/super-admin/restaurants",
  },
  {
    code: "SESSION_NOT_ACTIVE",
    name: "Table session unavailable",
    feature: "Orders and cart",
    cause:
      "The table session is closed or in billing state, so adding items or placing an order is disabled.",
    action:
      "Refresh the QR page. For a closed session, ask staff to start a new visit; staff can close a paid session from Orders.",
    href: "/restaurant/orders",
  },
  {
    code: "MENU_EMPTY",
    name: "No customer-visible menu items",
    feature: "Menu",
    cause:
      "There are no active categories with available menu items. Unavailable items are excluded from the QR menu.",
    action: "Add an active category and available items with prices in Menu.",
    href: "/restaurant/menu",
  },
  {
    code: "CART_EMPTY",
    name: "Cannot place an empty order",
    feature: "Orders",
    cause: "No cart items were found for the current table session/customer.",
    action: "Add at least one available menu item, then send the order.",
    href: "/restaurant/menu",
  },
  {
    code: "MENU_ITEM_UNAVAILABLE",
    name: "Menu item unavailable",
    feature: "Menu and cart",
    cause:
      "An item was removed, marked unavailable, or belongs to a different restaurant before the order was placed.",
    action:
      "Refresh the menu and remove the unavailable item. Staff can check its availability in Menu.",
    href: "/restaurant/menu",
  },
  {
    code: "DUPLICATE_TABLE_NUMBER",
    name: "Table number already exists",
    feature: "Table setup",
    cause: "Table numbers must be unique within a restaurant.",
    action: "Choose another table number or edit the existing table.",
    href: "/restaurant/tables",
  },
  {
    code: "TABLE_HAS_ACTIVE_SESSION",
    name: "Table cannot be deleted during an active session",
    feature: "Table setup",
    cause: "An active or billing session is still linked to this table.",
    action:
      "Mark the bill paid from Orders to close the session before deleting the table.",
    href: "/restaurant/orders",
  },
  {
    code: "CATEGORY_NOT_EMPTY",
    name: "Category still has menu items",
    feature: "Menu",
    cause:
      "The backend prevents deleting a category while menu items still reference it.",
    action:
      "Move or delete the category's items first, then delete the category.",
    href: "/restaurant/menu",
  },
  {
    code: "WAITER_FEATURE_DISABLED",
    name: "Waiter requests disabled",
    feature: "Waiter requests",
    cause: "The restaurant's call_waiter feature flag is disabled.",
    action:
      "A Super Admin can enable Call Waiter in the restaurant's feature settings.",
    href: "/super-admin/restaurants",
  },
  {
    code: "ONLINE_PAYMENT_DISABLED",
    name: "Online payment disabled",
    feature: "Payments",
    cause: "The restaurant has disabled online_payment.",
    action:
      "Enable Online Payment in the restaurant's feature settings, or collect payment through staff.",
    href: "/super-admin/restaurants",
  },
  {
    code: "RAZORPAY_NOT_CONFIGURED",
    name: "Razorpay credentials missing",
    feature: "Payments",
    cause:
      "The backend does not have the required Razorpay API credentials configured.",
    action:
      "Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET as Convex deployment secrets. Do not put the secret in Vercel frontend variables.",
  },
  {
    code: "PAYMENT_SIGNATURE_INVALID",
    name: "Payment signature verification failed",
    feature: "Payments",
    cause:
      "Razorpay's returned order/payment signature did not validate against the server-side secret.",
    action:
      "Do not mark the bill paid manually based on the browser response. Check Razorpay order details and Convex action logs.",
  },
  {
    code: "PAYMENT_EXCEEDS_BALANCE",
    name: "Online payment exceeds balance",
    feature: "Payments",
    cause:
      "The requested payment is greater than the current outstanding bill, possibly because another payment completed meanwhile.",
    action:
      "Refresh the bill summary and retry payment for the updated remaining amount.",
    href: "/restaurant/orders",
  },
  {
    code: "CASH_EXCEEDS_BALANCE",
    name: "Cash payment exceeds balance",
    feature: "Payments",
    cause: "The amount entered by staff is greater than the remaining balance.",
    action:
      "Refresh the bill and record only the amount actually collected, up to the remaining balance.",
    href: "/restaurant/orders",
  },
  {
    code: "BILL_HAS_OUTSTANDING_BALANCE",
    name: "Cannot close unpaid bill",
    feature: "Orders",
    cause:
      "The session total is greater than the recorded paid amount; closing is blocked to prevent losing an unpaid table balance.",
    action:
      "Verify that the customer has paid, then use Bill paid in Orders.",
    href: "/restaurant/orders",
  },
  {
    code: "FEEDBACK_DISABLED",
    name: "Customer feedback disabled",
    feature: "Feedback",
    cause: "The restaurant's feedback feature flag is disabled.",
    action:
      "A Super Admin can enable Customer Feedback in the restaurant's feature settings.",
    href: "/super-admin/restaurants",
  },
  {
    code: "FEEDBACK_REQUIRES_PAID_BILL",
    name: "Feedback available after payment",
    feature: "Feedback",
    cause:
      "The bill has not been fully paid, and the backend only accepts feedback after payment.",
    action:
      "Complete payment and close the session from Orders; the feedback form becomes available automatically.",
    href: "/restaurant/orders",
  },
  {
    code: "FEEDBACK_ALREADY_SUBMITTED",
    name: "Feedback already submitted",
    feature: "Feedback",
    cause: "Only one feedback submission is allowed per table session.",
    action: "No further action is needed; the existing feedback is saved.",
  },
  {
    code: "ASSET_LOAD_FAILED",
    name: "Page asset failed to load",
    feature: "Web deployment",
    cause:
      "A JavaScript chunk or required page asset did not load, often due to a stale browser cache or incomplete deployment.",
    action:
      "Confirm the latest Vercel deployment is ready and hard-refresh. If repeated, inspect Vercel build output and asset URLs.",
  },
  {
    code: "CLIENT_UNHANDLED_ERROR",
    name: "Uncaught browser error",
    feature: "Web application",
    cause: "A JavaScript error escaped the page's normal error handling.",
    action:
      "Open the affected page and inspect browser console and deployment logs. Reproduce with the same account and steps.",
  },
  {
    code: "CLIENT_UNHANDLED_REJECTION",
    name: "Unhandled asynchronous error",
    feature: "Web application",
    cause:
      "An asynchronous operation rejected without a handler; it may be an unhandled request or missed UI error path.",
    action:
      "Check the route and Convex logs around the timestamp, reproduce the action, and verify the UI handles the failure.",
  },
  {
    code: "UNKNOWN_ERROR",
    name: "Unclassified error",
    feature: "Web application",
    cause:
      "The error did not match a known SmartDine diagnosis. The current log may not contain enough safe context to identify the root cause.",
    action:
      "Copy the request ID, check the matching Convex/Vercel logs, and reproduce the action. Add a specific diagnosis when the root cause is confirmed.",
  },
];

export function getErrorGuide(code?: string, message?: string): ErrorGuide {
  if (code) {
    const guide = ERROR_GUIDES.find((entry) => entry.code === code);
    if (guide) return guide;
  }

  const text = (message ?? "").toLowerCase();
  const matchers: Array<[RegExp, ErrorCode]> = [
    [/restaurant manager access required/, "AUTH_MANAGER_REQUIRED"],
    [/super administrator access required/, "AUTH_SUPER_ADMIN_REQUIRED"],
    [/restaurant access required/, "AUTH_RESTAURANT_ACCESS_REQUIRED"],
    [/not authenticated/, "AUTH_NOT_AUTHENTICATED"],
    [/user is not active/, "AUTH_USER_INACTIVE"],
    [/razorpay.*not configured|add razorpay_key_id/, "RAZORPAY_NOT_CONFIGURED"],
    [/payment signature verification failed/, "PAYMENT_SIGNATURE_INVALID"],
    [/online payment is not enabled/, "ONLINE_PAYMENT_DISABLED"],
    [/cash payment cannot exceed|cash payment exceeds/, "CASH_EXCEEDS_BALANCE"],
    [/payment exceeds the remaining balance/, "PAYMENT_EXCEEDS_BALANCE"],
    [
      /outstanding balance|bill must be fully paid/,
      "BILL_HAS_OUTSTANDING_BALANCE",
    ],
    [
      /item is not available|menu item is no longer available/,
      "MENU_ITEM_UNAVAILABLE",
    ],
    [/cart is empty/, "CART_EMPTY"],
    [/session is not active|session not active/, "SESSION_NOT_ACTIVE"],
    [/feedback is not enabled/, "FEEDBACK_DISABLED"],
    [/feedback is available after/, "FEEDBACK_REQUIRES_PAID_BILL"],
    [/feedback has already been submitted/, "FEEDBACK_ALREADY_SUBMITTED"],
    [/call waiter feature is not enabled/, "WAITER_FEATURE_DISABLED"],
    [/cannot delete a category/, "CATEGORY_NOT_EMPTY"],
    [
      /cannot delete a table (?:with an active session|while an active or billing session)/,
      "TABLE_HAS_ACTIVE_SESSION",
    ],
    [/already exists/, "DUPLICATE_TABLE_NUMBER"],
  ];
  const [, matchedCode] =
    matchers.find(([pattern]) => pattern.test(text)) ?? [];
  return (
    ERROR_GUIDES.find((entry) => entry.code === matchedCode) ??
    ERROR_GUIDES.find((entry) => entry.code === "UNKNOWN_ERROR")!
  );
}

export function getUserFacingErrorMessage(
  error: unknown,
  fallback: string,
): string {
  const errorData =
    typeof error === "object" && error !== null && "data" in error
      ? error.data
      : undefined;
  const dataMessage =
    typeof errorData === "object" &&
    errorData !== null &&
    "message" in errorData &&
    typeof errorData.message === "string"
      ? errorData.message
      : undefined;
  const message = error instanceof Error ? error.message : "";

  if (
    message.includes("MANAGER_ALREADY_ASSIGNED") ||
    (typeof errorData === "object" &&
      errorData !== null &&
      "code" in errorData &&
      errorData.code === "MANAGER_ALREADY_ASSIGNED")
  ) {
    return "This restaurant already has an active manager. Each restaurant can have only one manager. Reassign or deactivate the current manager before assigning another.";
  }

  return dataMessage ?? (message || fallback);
}

export function classifyRuntimeError(
  message: string,
  errorName?: string,
): RuntimeErrorCode {
  if (
    /chunkloaderror|failed to fetch dynamically imported module|loading chunk/i.test(
      message,
    )
  ) {
    return "ASSET_LOAD_FAILED";
  }
  if (/failed to fetch|networkerror|websocket|connection/i.test(message)) {
    return "BACKEND_CONNECTION_FAILED";
  }
  if (errorName === "UnhandledPromiseRejection")
    return "CLIENT_UNHANDLED_REJECTION";
  return "CLIENT_UNHANDLED_ERROR";
}
