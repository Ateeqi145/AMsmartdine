import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convexUrl = import.meta.env.VITE_CONVEX_URL?.trim();
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexProvider({ children }: { children: React.ReactNode }) {
  if (!convex) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <section role="alert" className="max-w-lg rounded-2xl border bg-card p-6 text-center">
          <h1 className="text-lg font-semibold">App configuration required</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Set the VITE_CONVEX_URL environment variable in your hosting project to your
            Convex deployment URL, then redeploy this app.
          </p>
        </section>
      </main>
    );
  }

  return (
    <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
  );
}
