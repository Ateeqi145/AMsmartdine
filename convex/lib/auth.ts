import { ConvexError } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AuthContext = MutationCtx | QueryCtx;

export async function requireUser(ctx: AuthContext) {
	const userId = await getAuthUserId(ctx);
	if (!userId) {
		throw new ConvexError({ message: "Not authenticated", code: "UNAUTHENTICATED" });
	}

	const user = await ctx.db.get("users", userId);
	if (!user || user.isActive === false) {
		throw new ConvexError({ message: "User is not active", code: "FORBIDDEN" });
	}
	return user;
}

export async function requireSuperAdmin(ctx: AuthContext) {
	const user = await requireUser(ctx);
	if (user.role !== "SUPER_ADMIN") {
		throw new ConvexError({ message: "Super administrator access required", code: "FORBIDDEN" });
	}
	return user;
}

export async function requireRestaurantAccess(
	ctx: AuthContext,
	restaurantId: Id<"restaurants">,
) {
	const user = await requireUser(ctx);
	if (
		user.role !== "SUPER_ADMIN" &&
		(user.restaurantId !== restaurantId ||
			(user.role !== "RESTAURANT_MANAGER" && user.role !== "RESTAURANT_STAFF"))
	) {
		throw new ConvexError({ message: "Restaurant access required", code: "FORBIDDEN" });
	}
	return user;
}

export async function requireRestaurantManager(
	ctx: AuthContext,
	restaurantId: Id<"restaurants">,
) {
	const user = await requireUser(ctx);
	if (
		user.role !== "SUPER_ADMIN" &&
		(user.restaurantId !== restaurantId || user.role !== "RESTAURANT_MANAGER")
	) {
		throw new ConvexError({ message: "Restaurant manager access required", code: "FORBIDDEN" });
	}
	return user;
}

export function generateRequestId() {
	return crypto.randomUUID();
}
