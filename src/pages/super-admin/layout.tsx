import { Navigate, Outlet, NavLink, useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useEffect } from "react";
import {
  LayoutDashboard,
  Store,
  Activity,
  AlertTriangle,
  TicketPercent,
  ClipboardList,
  UtensilsCrossed,
  LogOut,
  Users,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth.ts";
import { cn } from "@/lib/utils.ts";

const navItems = [
  { to: "/super-admin/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/super-admin/restaurants", icon: Store, label: "Restaurants" },
  { to: "/super-admin/users", icon: Users, label: "Users" },
  { to: "/super-admin/system-health", icon: Activity, label: "System Health" },
  { to: "/super-admin/errors", icon: AlertTriangle, label: "Errors" },
  { to: "/super-admin/support", icon: TicketPercent, label: "Support" },
  { to: "/super-admin/audit-logs", icon: ClipboardList, label: "Audit Logs" },
];

function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const user = useQuery(api.users.getCurrentUser, {});

  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }

  if (user?.isActive === false) {
    return <Navigate to="/unauthorized?reason=inactive" replace />;
  }
  if (user?.role !== "SUPER_ADMIN") {
    return <Navigate to="/unauthorized" replace />;
  }
  return <>{children}</>;
}

function RedirectToHome() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/"); }, [navigate]);
  return null;
}

export default function SuperAdminLayout() {
  const { signout } = useAuth();

  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center">
          <Skeleton className="h-12 w-48" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <RedirectToHome />
      </Unauthenticated>
      <Authenticated>
        <SuperAdminGuard>
          <div className="flex h-screen overflow-hidden bg-background">
            {/* ── Desktop Sidebar ── */}
            <aside className="hidden md:flex w-56 flex-col bg-sidebar border-r border-sidebar-border flex-shrink-0">
              {/* Logo */}
              <div className="flex items-center gap-2.5 px-4 py-4 border-b border-sidebar-border">
                <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center flex-shrink-0">
                  <UtensilsCrossed className="w-3.5 h-3.5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-bold text-sidebar-foreground text-sm leading-none">SmartDine</p>
                  <p className="text-[9px] text-primary font-semibold uppercase tracking-widest mt-0.5">Super Admin</p>
                </div>
              </div>

              {/* Nav */}
              <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                      )
                    }
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>

              {/* Footer */}
              <div className="p-2 border-t border-sidebar-border">
                <button
                  onClick={() => signout()}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </aside>

            {/* ── Main content ── */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
                <Outlet />
              </main>

              {/* ── Mobile bottom nav ── */}
              <nav className="md:hidden fixed bottom-0 left-0 right-0 flex items-center justify-around bg-sidebar border-t border-sidebar-border px-2 py-2 z-50">
                {navItems.slice(0, 5).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      cn(
                        "flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
                        isActive
                          ? "text-sidebar-primary"
                          : "text-sidebar-foreground/50 hover:text-sidebar-foreground",
                      )
                    }
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        </SuperAdminGuard>
      </Authenticated>
    </>
  );
}
