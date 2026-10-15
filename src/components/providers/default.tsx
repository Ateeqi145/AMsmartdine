import { useEffect } from "react";
import { useMutation, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { classifyRuntimeError } from "@/lib/error-catalog";
import { ConvexProvider } from "./convex.tsx";
import { QueryClientProvider } from "./query-client.tsx";
import { ThemeProvider } from "./theme.tsx";
import { Toaster } from "../ui/sonner.tsx";
import { TooltipProvider } from "../ui/tooltip.tsx";

function RuntimeErrorReporter() {
  const report = useMutation(api.clientErrors.report);
  const { isAuthenticated } = useConvexAuth();

  useEffect(() => {
    const sendReport = (
      errorCode:
        | "CLIENT_UNHANDLED_ERROR"
        | "CLIENT_UNHANDLED_REJECTION"
        | "ASSET_LOAD_FAILED"
        | "BACKEND_CONNECTION_FAILED",
    ) => {
      if (!isAuthenticated) return;
      void report({ errorCode, route: window.location.pathname }).catch(
        (error: unknown) => {
          console.warn("Could not submit the diagnostic error report.", error);
        },
      );
    };

    const handleError = (event: ErrorEvent) => {
      if (
        event.target instanceof HTMLScriptElement ||
        event.target instanceof HTMLLinkElement
      ) {
        sendReport("ASSET_LOAD_FAILED");
        return;
      }
      if (event.message) {
        sendReport(classifyRuntimeError(event.message, event.error?.name));
      }
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "");
      sendReport(classifyRuntimeError(message, "UnhandledPromiseRejection"));
    };

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, [isAuthenticated, report]);

  return null;
}

export function DefaultProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConvexProvider>
      <RuntimeErrorReporter />
      <QueryClientProvider>
        <TooltipProvider>
          <ThemeProvider>
            <Toaster />
            {children}
          </ThemeProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ConvexProvider>
  );
}
