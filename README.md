# SmartDine Multi-Restaurant

SmartDine multi-restaurant app built with React, TypeScript, Vite, and Convex.

## Main folders

- `src/components/providers/` - application providers
- `src/components/ui/` - reusable interface components
- `src/hooks/` and `src/lib/` - shared client utilities
- `src/pages/` - authentication, manager, super-admin, and table views
- `convex/` - schema, backend modules, and generated Convex bindings
- `public/` - static assets

## Restaurant access and table sessions

Restaurant and cafe workspaces use `/restaurant/...` URLs. Super Admins choose
the business type when creating an account. Managers can manage menu items,
tables, branding, payment QR images, and reports; Staff can handle orders but
cannot edit the menu or tables or view revenue reports. Delivery Persons can
only access deliveries assigned to them and verify customer handover PINs.
The system allows one active Super Admin and one active Manager per restaurant;
multiple Staff accounts are supported.

Customer QR sessions with an order remain available across page reloads. If a
customer reopens a table URL before placing an order, their unsubmitted cart is
cleared and the unused session is refreshed. The first customer to open a table
session is its host and is the only customer who can see or change its cart,
place or cancel orders, and view that session's order history. Other guests can
browse the menu in read-only mode when **Settings → Menu access at occupied
tables** is enabled; the shared-cart feature is no longer available. Staff accept orders, mark them ready for counter collection, and
mark the bill paid from the single Orders queue, which closes the session.
Customers can view the configured UPI QR and submit feedback after the session
is closed; feedback history appears in Orders. New orders play a selectable
alert tone after staff interact with the page. Managers can upload JPEG, PNG,
and WebP menu photos, cafe/restaurant logos, and payment QR images (up to 5 MB).
Managers can load a small sample menu for testing when the restaurant menu is
empty; the fixture does not overwrite existing categories or items.

## Home delivery ordering

The public menu and checkout use `/order/<restaurant-slug>`; for example,
`https://your-domain.example/order/green-leaf`. The restaurant slug is shown in
the Manager **Settings → Online delivery pricing** page, which also displays
the complete URL on the current host. The `/table/<qr-token>` QR ordering flow
remains separate and continues to create dine-in orders.

Customers can place delivery orders as guests without an account or OTP. After
placing an order, reopening that restaurant's public URL resumes its private
tracking page; the **My Orders** page lists saved guest orders on that browser
and signed-in customer orders from their account. Customers can choose
**Order again** to start a separate order without changing a previous one.
Customers confirm cancellation twice. Unpaid COD orders can be cancelled while
still received or accepted; paid or pending online payments must be handled by
the restaurant so the system never implies that a payment was refunded.
Guest checkout collects the recipient name, phone, and delivery address and
supports cash on delivery. The private tracking URL provided after checkout
lets the customer track the order and view the handover PIN; keep that link.
Existing signed-in customer accounts can still use saved addresses and online
payment. Delivery prices, fees, tax, discount, and totals are computed
server-side. The manager Orders page separates home-delivery orders from
dine-in table sessions and supports the delivery tracking statuses. A table
session host can leave before ordering; the unused cart and session are cleared.

Staff sign in from the SmartDine home page at `/`; the account is routed to its
workspace after login. A Delivery Person signs in the same way and is taken to
`/restaurant/orders`, where only their assigned deliveries are shown. Super
Admins assign the Delivery Person role in **Super Admin → Users** or while
assigning staff to a restaurant. Managers control the restaurant's delivery
preference in **Settings → Enabled features**. A Super Admin can override it
from the restaurant's **Features** tab; an active Super Admin override takes
priority until reset to **Manager controlled**.

After a delivery order is accepted, a cryptographically generated four-digit
handover PIN appears on the private customer tracking URL returned at checkout.
Only the assigned delivery person can verify it; restaurant order
queues do not include PIN or tracking-token secrets. Set `DELIVERY_PIN_SECRET`
to a random secret of at least 32 characters in each Convex deployment before
accepting delivery orders. Optionally set `DELIVERY_PIN_TTL_MINUTES` to an
integer from 5 through 10080 (default: 1440). The tracking link is a bearer
credential and should not be shared except with people the customer trusts.
If order acceptance reports that delivery PIN verification is not configured,
add `DELIVERY_PIN_SECRET` to the active Convex deployment's environment
variables and retry the status change. Keep the secret out of the frontend,
source control, and logs.

Razorpay online checkout uses
`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` as Convex deployment variables;
the existing restaurant key ID may override the global key ID. Online payment
also requires the restaurant's **UPI QR payment** feature to remain enabled.
Without Razorpay credentials, online payment is unavailable; cash on delivery
remains available to guest customers.

## Run locally

Install dependencies with `npm install`, set up the Convex Auth signing keys on the development deployment, run `npx convex dev`, then run `npm run dev` in a second terminal.

Copy `.env.example` to `.env.local` and set `VITE_CONVEX_URL` to the Convex deployment URL. Staff sign-in uses Convex Auth email and password; customer ordering does not use OTP authentication. Convex Auth also requires `JWT_PRIVATE_KEY` and `JWKS` environment variables on the Convex deployment. Restart Vite after changing environment values.

For Vercel, add `VITE_CONVEX_URL` to the environment variables for each deployment environment you use (Production, Preview, and Development), using the matching Convex deployment's `https://<deployment>.convex.cloud` URL. Vite embeds this value at build time, so redeploy after adding or changing it. Do not use the local development fallback for a hosted app.

On a new deployment, create the first account from the sign-in dialog, then promote that account to `SUPER_ADMIN` in the Convex dashboard under **Data → users**. New accounts otherwise remain on the pending-access screen until an administrator assigns a role. This password setup does not yet verify email addresses or provide password resets; configure those before using it for production accounts.

## Error diagnostics

Super Admins can open **Errors & Diagnostics** from the admin navigation to search known failure causes and recovery actions, then review runtime error reports. The guide covers current authentication/role, QR/table/session, menu/order, payment, feedback, and deployment checks; an unknown failure is labeled as unclassified rather than assigned a guessed cause.

For signed-in staff, the browser reports uncaught JavaScript errors, unhandled promise rejections, failed page assets, and likely backend connection failures. Reports contain a fixed error code, sanitized route, role, timestamp, and request ID—not raw error messages, stack traces, or user input. Duplicate reports are combined for five minutes and each account is limited to ten new reports per hour. Handled form/mutation errors and customer browser errors are not automatically recorded; use the visible diagnostic guide and Convex/Vercel logs to investigate those.

## Commands

- `npm run dev` - start the Vite development server
- `npm run build` - type-check and build for production
- `npm test` - run Vitest
