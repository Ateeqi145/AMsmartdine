import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function deleteUserAccount(ctx: MutationCtx, userId: Id<"users">) {
  for await (const address of ctx.db
    .query("deliveryAddresses")
    .withIndex("by_user", (q) => q.eq("userId", userId))) {
    await ctx.db.delete("deliveryAddresses", address._id);
  }

  for await (const account of ctx.db
    .query("authAccounts")
    .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))) {
    for await (const verificationCode of ctx.db
      .query("authVerificationCodes")
      .withIndex("accountId", (q) => q.eq("accountId", account._id))) {
      await ctx.db.delete("authVerificationCodes", verificationCode._id);
    }
    await ctx.db.delete("authAccounts", account._id);
  }

  for await (const session of ctx.db
    .query("authSessions")
    .withIndex("userId", (q) => q.eq("userId", userId))) {
    for await (const refreshToken of ctx.db
      .query("authRefreshTokens")
      .withIndex("sessionId", (q) => q.eq("sessionId", session._id))) {
      await ctx.db.delete("authRefreshTokens", refreshToken._id);
    }
    await ctx.db.delete("authSessions", session._id);
  }

  await ctx.db.delete("users", userId);
  return null;
}
