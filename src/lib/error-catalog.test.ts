import { describe, expect, it } from "vitest";
import {
  classifyRuntimeError,
  getErrorGuide,
  getUserFacingErrorMessage,
} from "./error-catalog";

describe("error diagnostics", () => {
  it("maps known backend authorization failures to the specific role action", () => {
    expect(
      getErrorGuide(undefined, "Restaurant manager access required").code,
    ).toBe("AUTH_MANAGER_REQUIRED");
  });

  it("maps payment validation failures to a safe corrective action", () => {
    expect(
      getErrorGuide(undefined, "Payment exceeds the remaining balance").code,
    ).toBe("PAYMENT_EXCEEDS_BALANCE");
  });

  it("returns a clearly unclassified diagnosis instead of inventing a cause", () => {
    expect(
      getErrorGuide(undefined, "Unexpected new backend response").code,
    ).toBe("UNKNOWN_ERROR");
  });

  it("explains that a restaurant can only have one active manager", () => {
    const error = Object.assign(
      new Error('Uncaught ConvexError: {"code":"MANAGER_ALREADY_ASSIGNED"}'),
      { data: { code: "MANAGER_ALREADY_ASSIGNED" } },
    );

    expect(getUserFacingErrorMessage(error, "Failed to assign role")).toBe(
      "This restaurant already has an active manager. Each restaurant can have only one manager. Reassign or deactivate the current manager before assigning another.",
    );
  });

  it("classifies failed page chunks and unhandled promise rejections", () => {
    expect(classifyRuntimeError("Loading chunk 4 failed")).toBe(
      "ASSET_LOAD_FAILED",
    );
    expect(
      classifyRuntimeError("request rejected", "UnhandledPromiseRejection"),
    ).toBe("CLIENT_UNHANDLED_REJECTION");
  });
});
