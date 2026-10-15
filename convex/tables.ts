import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireRestaurantAccess, requireRestaurantManager, generateRequestId } from "./lib/auth";

/** Generate a unique QR token */
function generateQrToken(restaurantId: string, tableNumber: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const ts = Date.now().toString(36);
  return `qr_${restaurantId.slice(-6)}_${tableNumber.replace(/[^a-z0-9]/gi, "")}_${ts}_${rand}`;
}

/** List all tables for a restaurant */
export const listByRestaurant = query({
  args: { restaurantId: v.id("restaurants") },
  handler: async (ctx, args) => {
    await requireRestaurantAccess(ctx, args.restaurantId);
    return await ctx.db
      .query("tables")
      .withIndex("by_restaurant", (q) => q.eq("restaurantId", args.restaurantId))
      .collect();
  },
});

/** Public: get table by QR token (no auth — for customer QR scan) */
export const getByQrToken = query({
  args: { qrCodeToken: v.string() },
  handler: async (ctx, args) => {
    const table = await ctx.db
      .query("tables")
      .withIndex("by_qr_token", (q) => q.eq("qrCodeToken", args.qrCodeToken))
      .unique();
    if (!table) return null;
    const restaurant = await ctx.db.get(table.restaurantId);
    return { table, restaurant };
  },
});

/** Create a new table */
export const create = mutation({
  args: {
    restaurantId: v.id("restaurants"),
    tableNumber: v.string(),
    displayName: v.optional(v.string()),
    capacity: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);

    // Check table number uniqueness within restaurant
    const existing = await ctx.db
      .query("tables")
      .withIndex("by_restaurant_table", (q) =>
        q.eq("restaurantId", args.restaurantId).eq("tableNumber", args.tableNumber),
      )
      .unique();
    if (existing) throw new Error(`Table "${args.tableNumber}" already exists`);

    const qrCodeToken = generateQrToken(args.restaurantId, args.tableNumber);
    return await ctx.db.insert("tables", {
      restaurantId: args.restaurantId,
      tableNumber: args.tableNumber,
      displayName: args.displayName,
      capacity: args.capacity,
      isActive: true,
      qrCodeToken,
      createdAt: new Date().toISOString(),
    });
  },
});

/** Update table details */
export const update = mutation({
  args: {
    tableId: v.id("tables"),
    restaurantId: v.id("restaurants"),
    displayName: v.optional(v.string()),
    capacity: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const { tableId, restaurantId: _rid, ...fields } = args;
    await ctx.db.patch(tableId, fields);
  },
});

/** Regenerate QR token for a table (permanent QR, but can be regenerated if needed) */
export const regenerateQr = mutation({
  args: {
    tableId: v.id("tables"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    const table = await ctx.db.get(args.tableId);
    if (!table) throw new Error("Table not found");
    const newToken = generateQrToken(args.restaurantId, table.tableNumber);
    await ctx.db.patch(args.tableId, { qrCodeToken: newToken });
    return newToken;
  },
});

/** Delete a table (only if no active sessions) */
export const remove = mutation({
  args: {
    tableId: v.id("tables"),
    restaurantId: v.id("restaurants"),
  },
  handler: async (ctx, args) => {
    await requireRestaurantManager(ctx, args.restaurantId);
    // Check for active sessions
    const activeSession = await ctx.db
      .query("sessions")
      .withIndex("by_table_status", (q) =>
        q.eq("tableId", args.tableId).eq("status", "ACTIVE"),
      )
      .first();
    if (activeSession) throw new Error("Cannot delete a table with an active session");
    await ctx.db.delete(args.tableId);
  },
});
