import { describe, expect, it } from "vitest";
import { buildUpiPaymentLink } from "./upi-payment";

describe("buildUpiPaymentLink", () => {
  it("includes the payee, amount in rupees, currency, and note", () => {
    const url = new URL(
      buildUpiPaymentLink({
        upiId: "9380022162@ybl",
        payeeName: "Test Restaurant",
        amountPaise: 12345,
        note: "Table bill payment",
      }),
    );

    expect(url.protocol).toBe("upi:");
    expect(url.hostname).toBe("pay");
    expect(url.searchParams.get("pa")).toBe("9380022162@ybl");
    expect(url.searchParams.get("pn")).toBe("Test Restaurant");
    expect(url.searchParams.get("am")).toBe("123.45");
    expect(url.searchParams.get("cu")).toBe("INR");
    expect(url.searchParams.get("tn")).toBe("Table bill payment");
  });

  it("rejects zero, negative, and fractional-paise amounts", () => {
    for (const amountPaise of [0, -100, 1.5]) {
      expect(() =>
        buildUpiPaymentLink({
          upiId: "shop@ybl",
          payeeName: "Shop",
          amountPaise,
          note: "Table bill",
        }),
      ).toThrow("Enter a valid payment amount.");
    }
  });
});
