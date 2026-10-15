import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Navigate } from "react-router-dom";
import { motion } from "motion/react";
import { UtensilsCrossed, ChevronRight, Shield, Store, Users, BarChart3, QrCode, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function RoleRouter() {
  const user = useQuery(api.users.getCurrentUser, {});

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (!user?.role) {
    // Signed in but no role yet — show waiting state
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-2xl font-bold">Account Pending</h2>
          <p className="text-muted-foreground max-w-sm">
            Your account is awaiting role assignment. Please contact the SmartDine administrator.
          </p>
        </div>
      </div>
    );
  }

  if (user.role === "SUPER_ADMIN") {
    return <Navigate to="/super-admin/dashboard" replace />;
  }

  if (user.role === "RESTAURANT_MANAGER" || user.role === "RESTAURANT_STAFF") {
    return <Navigate to="/manager/dashboard" replace />;
  }

  return null;
}

const features = [
  { icon: Store, title: "Multi-Restaurant", desc: "One platform, unlimited restaurants" },
  { icon: QrCode, title: "QR Ordering", desc: "Permanent QR per table, shared sessions" },
  { icon: Users, title: "Role-Based", desc: "Super Admin, Manager, Staff, Customer" },
  { icon: BarChart3, title: "Analytics", desc: "Per-restaurant insights and reporting" },
  { icon: Zap, title: "Realtime", desc: "Live shared cart and order updates" },
  { icon: Shield, title: "Secure", desc: "Server-side authorization at every layer" },
];

export default function Index() {
  return (
    <>
      <AuthLoading>
        <div className="min-h-screen flex items-center justify-center">
          <Skeleton className="h-12 w-48" />
        </div>
      </AuthLoading>

      <Authenticated>
        <RoleRouter />
      </Authenticated>

      <Unauthenticated>
        <div className="min-h-screen bg-background flex flex-col">
          {/* Navbar */}
          <nav className="flex items-center justify-between px-6 py-4 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <UtensilsCrossed className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg tracking-tight">SmartDine</span>
            </div>
            <SignInButton />
          </nav>

          {/* Hero */}
          <main className="flex-1 flex flex-col items-center justify-center px-6 py-20">
            <motion.div
              className="text-center max-w-3xl mx-auto space-y-6"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-sm font-medium">
                <Zap className="w-3.5 h-3.5" />
                Multi-Tenant Restaurant SaaS
              </div>
              <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-balance leading-tight">
                One Platform,{" "}
                <span className="text-primary">Every Restaurant</span>
              </h1>
              <p className="text-xl text-muted-foreground text-balance max-w-2xl mx-auto">
                SmartDine powers multi-restaurant operations with QR ordering, shared carts,
                realtime updates, and a central Super Admin to manage it all.
              </p>
              <div className="flex items-center justify-center gap-4 pt-2">
                <SignInButton />
                <Button variant="ghost" className="gap-1">
                  Learn more <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>

            {/* Feature grid */}
            <motion.div
              className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-20 max-w-3xl w-full"
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2, ease: "easeOut" }}
            >
              {features.map((f) => (
                <div
                  key={f.title}
                  className="bg-card border border-border rounded-xl p-5 space-y-2 hover:shadow-md transition-shadow"
                >
                  <div className="w-9 h-9 bg-primary/10 rounded-lg flex items-center justify-center">
                    <f.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <p className="font-semibold text-sm">{f.title}</p>
                  <p className="text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </motion.div>
          </main>

          <footer className="text-center py-6 text-xs text-muted-foreground border-t border-border/50">
            © {new Date().getFullYear()} SmartDine. All rights reserved.
          </footer>
        </div>
      </Unauthenticated>
    </>
  );
}
