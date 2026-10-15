import { forwardRef, useEffect, useState } from "react";
import { type VariantProps } from "class-variance-authority";
import { Loader2, LogIn, LogOut } from "lucide-react";
import { useAuthActions, useConvexAuth } from "@convex-dev/auth/react";
import { Button, buttonVariants } from "@/components/ui/button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

export interface SignInButtonProps
  extends
    Omit<React.ComponentProps<"button">, "onClick">,
    VariantProps<typeof buttonVariants> {
  /**
   * Custom onClick handler that runs before authentication action
   */
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Whether to show icons in the button
   * @default true
   */
  showIcon?: boolean;
  /**
   * Custom text for sign in state
   * @default "Sign In"
   */
  signInText?: string;
  /**
   * Custom text for sign out state
   * @default "Sign Out"
   */
  signOutText?: string;
  /**
   * Custom text for loading state
   * @default "Signing In..." or "Signing Out..."
   */
  loadingText?: string;
  /**
   * Whether to use the asChild pattern
   * @default false
   */
  asChild?: boolean;
}

function getFriendlyAuthError(cause: unknown, flow: "signIn" | "signUp") {
  const message = cause instanceof Error ? cause.message.toLowerCase() : String(cause).toLowerCase();

  if (/invalidsecret|invalidaccountid|invalid credential|incorrect password/.test(message)) {
    return "Email or password is incorrect. Check your details and try again.";
  }
  if (/account .* already exists|already exists/.test(message)) {
    return "We couldn't create this account. If you've used this email before, switch to Sign In.";
  }
  if (/password/.test(message) && /8|length|short|requirements/.test(message)) {
    return "Choose a password with at least 8 characters.";
  }
  if (/too many|rate.?limit/.test(message)) {
    return "Too many attempts. Wait a moment, then try again.";
  }
  if (/failed to fetch|network|fetch failed/.test(message)) {
    return "Couldn't reach the sign-in service. Check your connection and try again.";
  }

  return flow === "signUp"
    ? "We couldn't create your account. Check your details and try again."
    : "We couldn't sign you in. Check your details and try again.";
}

/**
 * A button component that handles authentication sign in/out with proper loading states
 * and accessibility features.
 */
export const SignInButton = forwardRef<HTMLButtonElement, SignInButtonProps>(
  (
    {
      onClick,
      disabled,
      showIcon = true,
      signInText = "Sign In",
      signOutText = "Sign Out",
      loadingText,
      className,
      variant,
      size,
      asChild = false,
      ...props
    },
    ref,
  ) => {
    const { signIn, signOut } = useAuthActions();
    const { isAuthenticated, isLoading } = useConvexAuth();
    const [open, setOpen] = useState(false);
    const [flow, setFlow] = useState<"signIn" | "signUp">("signIn");
    const [submitting, setSubmitting] = useState(false);
    const [awaitingAuth, setAwaitingAuth] = useState(false);
    const [statusMessage, setStatusMessage] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
      if (!isAuthenticated) return;
      setOpen(false);
      setAwaitingAuth(false);
      setStatusMessage("");
      setError("");
    }, [isAuthenticated]);

    const handleClick = async (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;

      if (isAuthenticated) {
        await signOut();
      } else {
        setStatusMessage("");
        setError("");
        setOpen(true);
      }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setStatusMessage("Checking your details...");
      setError("");
      const formData = new FormData(event.currentTarget);
      formData.set("flow", flow);

      try {
        const result = await signIn("password", formData);
        if (result.signingIn) {
          setAwaitingAuth(true);
          setStatusMessage(
            flow === "signUp"
              ? "Account created. Signing you in..."
              : "Details accepted. Signing you in...",
          );
        } else {
          setStatusMessage(
            flow === "signUp"
              ? "Account created. Sign in with your new details to continue."
              : "Sign-in needs another step. Follow the instructions and try again.",
          );
        }
      } catch (cause) {
        setStatusMessage("");
        setError(getFriendlyAuthError(cause, flow));
      } finally {
        setSubmitting(false);
      }
    };

    const isDisabled = disabled || isLoading || submitting || awaitingAuth;
    const defaultLoadingText = isAuthenticated
      ? "Signing Out..."
      : "Signing In...";
    const currentLoadingText = loadingText || (submitting ? "Please wait..." : defaultLoadingText);

    const buttonText = isLoading
      ? currentLoadingText
      : isAuthenticated
        ? signOutText
        : signInText;

    const icon = isLoading ? (
      <Loader2 className="size-4 animate-spin" />
    ) : isAuthenticated ? (
      <LogOut className="size-4" />
    ) : (
      <LogIn className="size-4" />
    );

    return (
      <>
      <Button
        ref={ref}
        onClick={handleClick}
        disabled={isDisabled}
        variant={variant}
        size={size}
        className={className}
        asChild={asChild}
        aria-label={
          isAuthenticated
            ? "Sign out of your account"
            : "Sign in to your account"
        }
        {...props}
      >
        {showIcon && icon}
        {buttonText}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{flow === "signIn" ? "Sign in to SmartDine" : "Create your account"}</DialogTitle>
            <DialogDescription>
              {flow === "signIn" ? "Enter your email and password." : "Use your email and create a password of at least 8 characters."}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="auth-email">Email</Label>
              <Input id="auth-email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="auth-password">Password</Label>
              <Input
                id="auth-password"
                name="password"
                type="password"
                autoComplete={flow === "signIn" ? "current-password" : "new-password"}
                minLength={8}
                required
              />
            </div>
            {error && (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}
            {statusMessage && (
              <p role="status" className="text-sm text-muted-foreground">
                {statusMessage}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isDisabled}>
              {(submitting || awaitingAuth) && <Loader2 className="size-4 animate-spin" />}
              {submitting
                ? "Checking..."
                : awaitingAuth
                  ? "Signing you in..."
                  : flow === "signIn"
                    ? "Sign In"
                    : "Create Account"}
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => {
                setFlow(flow === "signIn" ? "signUp" : "signIn");
                setError("");
              }}
            >
              {flow === "signIn" ? "New here? Create an account" : "Already registered? Sign in"}
            </button>
          </form>
        </DialogContent>
      </Dialog>
      </>
    );
  },
);

SignInButton.displayName = "SignInButton";
