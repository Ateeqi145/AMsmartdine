import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInButton } from "./signin";

const mocks = vi.hoisted(() => ({
  isAuthenticated: false,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({ signIn: mocks.signIn, signOut: mocks.signOut }),
  useConvexAuth: () => ({ isAuthenticated: mocks.isAuthenticated, isLoading: false }),
}));

beforeEach(() => {
  mocks.isAuthenticated = false;
  mocks.signIn.mockReset().mockResolvedValue({ signingIn: false });
  mocks.signOut.mockReset().mockResolvedValue(undefined);
});

describe("SignInButton", () => {
  it("submits email and password for account creation", async () => {
    const user = userEvent.setup();
    render(<SignInButton />);

    await user.click(screen.getByRole("button", { name: "Sign in to your account" }));
    await user.click(screen.getByRole("button", { name: "New here? Create an account" }));
    await user.type(screen.getByLabelText("Email"), "manager@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledOnce());
    const formData = mocks.signIn.mock.calls[0]?.[1] as FormData;
    expect(mocks.signIn).toHaveBeenCalledWith("password", expect.any(FormData));
    expect(formData.get("flow")).toBe("signUp");
    expect(formData.get("email")).toBe("manager@example.com");
  });

  it("signs out an authenticated user", async () => {
    mocks.isAuthenticated = true;
    const user = userEvent.setup();
    render(<SignInButton />);

    await user.click(screen.getByRole("button", { name: "Sign out of your account" }));

    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it("shows a friendly message for invalid credentials instead of the server error", async () => {
    mocks.signIn.mockRejectedValue(
      new Error("InvalidSecret at retrieveAccount (../../node_modules/convex-auth/index.ts:602:9)"),
    );
    const user = userEvent.setup();
    render(<SignInButton />);

    await user.click(screen.getByRole("button", { name: "Sign in to your account" }));
    await user.type(screen.getByLabelText("Email"), "manager@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Email or password is incorrect. Check your details and try again.",
    );
    expect(screen.queryByText(/InvalidSecret|node_modules/)).not.toBeInTheDocument();
  });

  it("shows a friendly message when a sign-up account already exists", async () => {
    mocks.signIn.mockRejectedValue(
      new Error("Account manager@example.com already exists"),
    );
    const user = userEvent.setup();
    render(<SignInButton />);

    await user.click(screen.getByRole("button", { name: "Sign in to your account" }));
    await user.click(screen.getByRole("button", { name: "New here? Create an account" }));
    await user.type(screen.getByLabelText("Email"), "manager@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create Account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "We couldn't create this account. If you've used this email before, switch to Sign In.",
    );
    expect(screen.queryByText(/manager@example.com already exists/)).not.toBeInTheDocument();
  });

  it("shows immediate progress while Convex confirms the login", async () => {
    mocks.signIn.mockResolvedValue({ signingIn: true });
    const user = userEvent.setup();
    render(<SignInButton />);

    await user.click(screen.getByRole("button", { name: "Sign in to your account" }));
    await user.type(screen.getByLabelText("Email"), "manager@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign In" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Details accepted. Signing you in...",
    );
    expect(screen.getByRole("button", { name: "Signing you in..." })).toBeDisabled();
  });
});