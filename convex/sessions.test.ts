/// <reference types="vite/client" />

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("table session access", () => {
  it("lets the opening device resume but blocks a different device", async () => {
    const t = convexTest(schema, modules);
    const now = new Date().toISOString();
    const restaurantId = await t.run((ctx) =>
      ctx.db.insert("restaurants", {
        name: "Test Cafe",
        businessType: "CAFE",
        slug: "test-cafe",
        isActive: true,
        createdAt: now,
        updatedAt: now,
      }),
    );
    const tableId = await t.run((ctx) =>
      ctx.db.insert("tables", {
        restaurantId,
        tableNumber: "T1",
        isActive: true,
        qrCodeToken: "test-qr",
        createdAt: now,
      }),
    );
    const args = {
      tableId,
      restaurantId,
      customerCount: 1,
    };

    const firstVisit = await t.mutation(api.sessions.openOrJoinSession, {
      ...args,
      customerId: "device-a",
    });
    const resumedVisit = await t.mutation(api.sessions.openOrJoinSession, {
      ...args,
      customerId: "device-a",
    });

    expect(resumedVisit).toEqual({ ...firstVisit, isNew: false });
    await expect(
      t.mutation(api.sessions.openOrJoinSession, {
        ...args,
        customerId: "device-b",
      }),
    ).rejects.toThrow(/occupied/i);
  });
});
