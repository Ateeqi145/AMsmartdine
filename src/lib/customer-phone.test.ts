import { describe, expect, it } from "vitest";
import { normalizeCustomerPhone } from "./customer-phone";

describe("normalizeCustomerPhone", () => {
  it.each([
    ["9876543210", "+919876543210"],
    ["09876543210", "+919876543210"],
    ["+91 98765 43210", "+919876543210"],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeCustomerPhone(input)).toBe(expected);
  });

  it.each([
    "1234567890",
    "987654321",
    "abc9876543210",
    "+0123456789",
    "+1 (415) 555-2671",
  ])("rejects invalid phone number %s", (input) => {
    expect(normalizeCustomerPhone(input)).toBeNull();
  });
});
