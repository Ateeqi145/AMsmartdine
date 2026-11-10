/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("restaurant user role management", () => {
  it("allows a manager to edit staff roles in their restaurant", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, managerId, staffId } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Role Test Restaurant",
        slug: "role-test-restaurant",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      });
      const staffId = await ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId,
        isActive: true,
      });
      return { restaurantId, managerId, staffId };
    });

    await t
      .withIdentity({ subject: managerId })
      .mutation(api.users.updateRestaurantUserRole, {
        userId: staffId,
        role: "DELIVERY_PERSON",
      });

    await expect(
      t.run((ctx) => ctx.db.get("users", staffId)),
    ).resolves.toMatchObject({
      role: "DELIVERY_PERSON",
      restaurantId,
    });
  });

  it("prevents a manager from editing users outside their restaurant", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { managerId, otherRestaurantStaffId } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Manager Restaurant",
        slug: "manager-restaurant",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const otherRestaurantId = await ctx.db.insert("restaurants", {
        name: "Other Restaurant",
        slug: "other-restaurant",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        isActive: true,
      });
      const otherRestaurantStaffId = await ctx.db.insert("users", {
        role: "RESTAURANT_STAFF",
        restaurantId: otherRestaurantId,
        isActive: true,
      });
      return { managerId, otherRestaurantStaffId };
    });

    await expect(
      t
        .withIdentity({ subject: managerId })
        .mutation(api.users.updateRestaurantUserRole, {
          userId: otherRestaurantStaffId,
          role: "DELIVERY_PERSON",
        }),
    ).rejects.toThrow("You can only edit staff roles in your restaurant");
  });

  it("keeps the one-manager-per-restaurant limit for Super Admin role changes", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, adminId, existingManagerId, staffId } = await t.run(
      async (ctx) => {
        const restaurantId = await ctx.db.insert("restaurants", {
          name: "Unique Manager Restaurant",
          slug: "unique-manager-restaurant",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        const adminId = await ctx.db.insert("users", {
          role: "SUPER_ADMIN",
          isActive: true,
        });
        const existingManagerId = await ctx.db.insert("users", {
          role: "RESTAURANT_MANAGER",
          restaurantId,
          isActive: true,
        });
        const staffId = await ctx.db.insert("users", {
          role: "RESTAURANT_STAFF",
          restaurantId,
          isActive: true,
        });
        return { restaurantId, adminId, existingManagerId, staffId };
      },
    );

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.admin.assignUserRole, {
        userId: staffId,
        role: "RESTAURANT_MANAGER",
        restaurantId,
      }),
    ).rejects.toThrow("This restaurant already has an active manager");

    await expect(
      t.run((ctx) => ctx.db.get("users", existingManagerId)),
    ).resolves.toMatchObject({ role: "RESTAURANT_MANAGER", restaurantId });
  });

  it("lets a manager delete staff, but not the manager account", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const { restaurantId, managerId, staffId, otherStaffId } = await t.run(
      async (ctx) => {
        const restaurantId = await ctx.db.insert("restaurants", {
          name: "Delete Test Restaurant",
          slug: "delete-test-restaurant",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        const otherRestaurantId = await ctx.db.insert("restaurants", {
          name: "Outside Restaurant",
          slug: "outside-restaurant",
          isActive: true,
          createdAt: now,
          updatedAt: now,
        });
        const managerId = await ctx.db.insert("users", {
          role: "RESTAURANT_MANAGER",
          restaurantId,
          isActive: true,
        });
        const staffId = await ctx.db.insert("users", {
          role: "RESTAURANT_STAFF",
          restaurantId,
          isActive: true,
        });
        const otherStaffId = await ctx.db.insert("users", {
          role: "RESTAURANT_STAFF",
          restaurantId: otherRestaurantId,
          isActive: true,
        });
        return { restaurantId, managerId, staffId, otherStaffId };
      },
    );
    const manager = t.withIdentity({ subject: managerId });

    await expect(
      manager.mutation(api.users.deleteRestaurantUser, { userId: managerId }),
    ).rejects.toThrow("You can only remove staff in your restaurant");
    await expect(
      manager.mutation(api.users.deleteRestaurantUser, {
        userId: otherStaffId,
      }),
    ).rejects.toThrow("You can only remove staff in your restaurant");

    await manager.mutation(api.users.deleteRestaurantUser, {
      userId: staffId,
    });

    await expect(
      t.run((ctx) => ctx.db.get("users", staffId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("users", managerId)),
    ).resolves.toMatchObject({ role: "RESTAURANT_MANAGER", restaurantId });
  });

  it("lets a Super Admin delete a manager and their sign-in data", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const {
      adminId,
      managerId,
      accountId,
      verificationCodeId,
      sessionId,
      refreshTokenId,
      addressId,
      auditLogId,
    } = await t.run(async (ctx) => {
      const restaurantId = await ctx.db.insert("restaurants", {
        name: "Admin Delete Restaurant",
        slug: "admin-delete-restaurant",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      const adminId = await ctx.db.insert("users", {
        role: "SUPER_ADMIN",
        isActive: true,
      });
      const managerId = await ctx.db.insert("users", {
        role: "RESTAURANT_MANAGER",
        restaurantId,
        email: "manager@example.com",
        isActive: true,
      });
      const accountId = await ctx.db.insert("authAccounts", {
        userId: managerId,
        provider: "password",
        providerAccountId: "manager@example.com",
        secret: "hashed-secret",
      });
      const verificationCodeId = await ctx.db.insert("authVerificationCodes", {
        accountId,
        provider: "password",
        code: "verification-code",
        expirationTime: Date.now() + 60_000,
      });
      const sessionId = await ctx.db.insert("authSessions", {
        userId: managerId,
        expirationTime: Date.now() + 60_000,
      });
      const refreshTokenId = await ctx.db.insert("authRefreshTokens", {
        sessionId,
        expirationTime: Date.now() + 60_000,
      });
      const addressId = await ctx.db.insert("deliveryAddresses", {
        userId: managerId,
        name: "Manager",
        phone: "1234567890",
        street: "1 Main Street",
        area: "Central",
        city: "Test City",
        pincode: "123456",
        createdAt: now,
        updatedAt: now,
      });
      const auditLogId = await ctx.db.insert("auditLogs", {
        actorId: managerId,
        actorRole: "RESTAURANT_MANAGER",
        restaurantId,
        action: "TEST_ACTION",
        timestamp: now,
      });
      return {
        adminId,
        managerId,
        accountId,
        verificationCodeId,
        sessionId,
        refreshTokenId,
        addressId,
        auditLogId,
      };
    });

    await t.withIdentity({ subject: adminId }).mutation(api.admin.deleteUser, {
      userId: managerId,
    });

    await expect(
      t.run((ctx) => ctx.db.get("users", managerId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("authAccounts", accountId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("authVerificationCodes", verificationCodeId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("authSessions", sessionId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("authRefreshTokens", refreshTokenId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("deliveryAddresses", addressId)),
    ).resolves.toBeNull();
    await expect(
      t.run((ctx) => ctx.db.get("auditLogs", auditLogId)),
    ).resolves.toMatchObject({ actorId: managerId });
  });

  it("prevents a Super Admin from deleting the active admin account", async () => {
    const t = convexTest(schema, modules);
    const adminId = await t.run((ctx) =>
      ctx.db.insert("users", { role: "SUPER_ADMIN", isActive: true }),
    );

    await expect(
      t.withIdentity({ subject: adminId }).mutation(api.admin.deleteUser, {
        userId: adminId,
      }),
    ).rejects.toThrow(
      "You cannot delete the Super Admin account you are using",
    );

    await expect(
      t.run((ctx) => ctx.db.get("users", adminId)),
    ).resolves.toMatchObject({ role: "SUPER_ADMIN", isActive: true });
  });
});
