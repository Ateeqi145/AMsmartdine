/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as cart from "../cart.js";
import type * as clientErrors from "../clientErrors.js";
import type * as featureFlags from "../featureFlags.js";
import type * as feedback from "../feedback.js";
import type * as http from "../http.js";
import type * as lib_auth from "../lib/auth.js";
import type * as menu from "../menu.js";
import type * as orders from "../orders.js";
import type * as payments from "../payments.js";
import type * as razorpay from "../razorpay.js";
import type * as reports from "../reports.js";
import type * as restaurants from "../restaurants.js";
import type * as sessions from "../sessions.js";
import type * as tables from "../tables.js";
import type * as users from "../users.js";
import type * as waiterRequests from "../waiterRequests.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  cart: typeof cart;
  clientErrors: typeof clientErrors;
  featureFlags: typeof featureFlags;
  feedback: typeof feedback;
  http: typeof http;
  "lib/auth": typeof lib_auth;
  menu: typeof menu;
  orders: typeof orders;
  payments: typeof payments;
  razorpay: typeof razorpay;
  reports: typeof reports;
  restaurants: typeof restaurants;
  sessions: typeof sessions;
  tables: typeof tables;
  users: typeof users;
  waiterRequests: typeof waiterRequests;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
