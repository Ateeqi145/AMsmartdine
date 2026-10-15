import { useEffect } from "react";
import { Authenticated, AuthLoading, Unauthenticated, useQuery } from "convex/react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  UtensilsCrossed,
} from "lucide-react";

import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

const navItems = [
  { to: "/manager/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/manager/tables", label: "Tables", icon: QrCode },
  { to: "/manager/menu", label: "Menu", icon: UtensilsCrossed },
  { to: "/manager/orders", label: "Orders", icon: ClipboardList },
  { to: "/manager/billing", label: "Billing", icon: ClipboardList },
  { to: "/manager/reports", label: "Reports", icon: BarChart3 },
  { to: "/manager/settings", label: "Settings", icon: Settings },
];

function ManagerGuard({ children }: { children: React.ReactNode }) {
  const user = useQuery(api.users.getCurrentUser, {});
  const navigate = useNavigate();

  useEffect(() => {
    if (user === undefined) return;
    if (user?.role === "SUPER_ADMIN") navigate("/super-admin/dashboard");
    else if (user?.role !== "RESTAURANT_MANAGER" && user?.role !== "RESTAURANT_STAFF") {
      navigate("/unauthorized");
    }
  }, [user, navigate]);

  if (user === undefined) {
    return <div className="flex h-screen items-center justify-center"><Skeleton className="h-12 w-48" /></div>;
  }
  if (
    user?.role !== "RESTAURANT_MANAGER" &&
    user?.role !== "RESTAURANT_STAFF"
  ) {
    return null;
  }
  return <>{children}</>;
}

function RedirectHome() {
  const navigate = useNavigate();
  useEffect(() => { navigate("/"); }, [navigate]);
  return null;
}

export default function ManagerLayout() {
  const { signout } = useAuth();

  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center"><Skeleton className="h-12 w-48" /></div>
      </AuthLoading>
      <Unauthenticated><RedirectHome /></Unauthenticated>
      <Authenticated>
        <ManagerGuard>
          <div className="flex h-screen overflow-hidden bg-background">
            <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
              <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
                <UtensilsCrossed className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-bold">SmartDine</p>
                  <p className="text-[9px] font-semibold uppercase text-primary">Restaurant</p>
                </div>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                {navItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                      isActive ? "bg-sidebar-accent text-sidebar-primary" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50",
                    )}
                  >
                    <Icon className="h-4 w-4" />{label}
                  </NavLink>
                ))}
              </nav>
              <button onClick={() => signout()} className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground">
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </aside>
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0"><Outlet /></main>
            <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-sidebar-border bg-sidebar px-1 py-2 md:hidden">
              {navItems.slice(0, 5).map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]", isActive ? "text-sidebar-primary" : "text-muted-foreground")}>
                  <Icon className="h-5 w-5" /><span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </ManagerGuard>
      </Authenticated>
    </>
  );
}