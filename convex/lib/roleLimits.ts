import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function assertRoleSlotAvailable(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    role: "SUPER_ADMIN" | "RESTAURANT_MANAGER" | "RESTAURANT_STAFF";
    restaurantId?: Id<"restaurants">;
  },
) {
  if (args.role !== "SUPER_ADMIN" && !args.restaurantId) {
    throw new ConvexError({
      message: "Select a restaurant for this role",
      code: "BAD_REQUEST",
    });
  }

  if (args.role === "SUPER_ADMIN") {
    const admins = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", "SUPER_ADMIN"))
      .take(1000);
    if (
      admins.some((user) => user._id !== args.userId && user.isActive !== false)
    ) {
      throw new ConvexError({
        message: "Only one active Super Admin is allowed",
        code: "BAD_REQUEST",
      });
    }
  }

  if (args.role === "RESTAURANT_MANAGER") {
    if (!args.restaurantId) {
      throw new ConvexError({
        message: "Select a restaurant for the Manager role",
        code: "BAD_REQUEST",
      });
    }
    const managers = await ctx.db
      .query("users")
      .withIndex("by_role_and_restaurant", (q) =>
        q
          .eq("role", "RESTAURANT_MANAGER")
          .eq("restaurantId", args.restaurantId),
      )
      .take(1000);
    if (
      managers.some(
        (user) => user._id !== args.userId && user.isActive !== false,
      )
    ) {
      throw new ConvexError({
        message:
          "This restaurant already has an active manager. Each restaurant can have only one manager. Reassign or deactivate the current manager before assigning another.",
        code: "MANAGER_ALREADY_ASSIGNED",
      });
    }
  }
}
