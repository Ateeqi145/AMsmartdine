import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Link } from "react-router-dom";
import {
  QrCode,
  UtensilsCrossed,
  ClipboardList,
  Circle,
  ChevronRight,
} from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

export default function ManagerDashboard() {
  const user = useQuery(api.users.getCurrentUser, {});
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const rid = restaurant?._id as Id<"restaurants"> | undefined;

  const tables = useQuery(
    api.tables.listByRestaurant,
    rid ? { restaurantId: rid } : "skip",
  );
  const categories = useQuery(
    api.menu.listCategories,
    rid ? { restaurantId: rid } : "skip",
  );
  const items = useQuery(
    api.menu.listItems,
    rid ? { restaurantId: rid } : "skip",
  );
  const flags = useQuery(
    api.featureFlags.listByRestaurant,
    rid ? { restaurantId: rid } : "skip",
  );
  const activeSessions = useQuery(
    api.sessions.listActiveSessions,
    rid ? { restaurantId: rid } : "skip",
  );
  const closeUnusedSession = useMutation(api.sessions.closeUnusedSession);
  const [closingSessionId, setClosingSessionId] =
    useState<Id<"sessions"> | null>(null);

  const loading = restaurant === undefined;
  const isManager = user?.role === "RESTAURANT_MANAGER";

  const handleCloseUnusedSession = async (sessionId: Id<"sessions">) => {
    if (
      !rid ||
      !window.confirm(
        "Close this unused session? It can only be closed if no orders or cart items exist.",
      )
    ) {
      return;
    }
    setClosingSessionId(sessionId);
    try {
      await closeUnusedSession({ sessionId, restaurantId: rid });
      toast.success("Unused table session closed");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not close this unused session.",
      );
    } finally {
      setClosingSessionId(null);
    }
  };

  if (restaurant === null) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">No restaurant assigned</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ask a super admin to assign your account to a restaurant before using
          the manager dashboard.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {loading ? (
            <Skeleton className="h-8 w-48 inline-block" />
          ) : (
            restaurant?.name
          )}
        </h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Welcome back, {user?.name ?? (isManager ? "Manager" : "Staff")} ·{" "}
          {new Date().toLocaleDateString("en-IN", {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Tables",
            value: tables?.length,
            icon: QrCode,
            href: "/restaurant/tables",
            color: "bg-primary/10 text-primary",
          },
          {
            label: "Menu Items",
            value: items?.length,
            icon: UtensilsCrossed,
            href: "/restaurant/menu",
            color: "bg-green-500/10 text-green-600 dark:text-green-400",
          },
          {
            label: "Active Sessions",
            value: activeSessions?.length,
            icon: ClipboardList,
            href: "/restaurant/orders",
            color: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
          },
          {
            label: "Categories",
            value: categories?.length,
            icon: UtensilsCrossed,
            href: "/restaurant/menu",
            color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
          },
        ]
          .filter((stat) => isManager || stat.label === "Active Sessions")
          .map((s) => (
            <Link to={s.href} key={s.label}>
              <Card className="hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer">
                <CardContent className="pt-5 pb-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        {s.label}
                      </p>
                      {s.value === undefined ? (
                        <Skeleton className="h-8 w-12 mt-1" />
                      ) : (
                        <p className="text-3xl font-bold mt-1 tabular-nums">
                          {s.value}
                        </p>
                      )}
                    </div>
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.color}`}
                    >
                      <s.icon className="w-5 h-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
      </div>

      {/* Active sessions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Circle className="w-2 h-2 fill-green-500 text-green-500" />
              Active Table Sessions
            </CardTitle>
            <Link
              to="/restaurant/orders"
              className="text-xs text-primary flex items-center gap-0.5 hover:underline"
            >
              View orders <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {activeSessions === undefined ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : activeSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No active sessions right now
            </p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {activeSessions.map((s) => (
                <div
                  key={s._id}
                  className="flex flex-col items-center gap-1 rounded-xl border border-green-500/20 bg-green-500/5 p-3 text-center"
                >
                  <p className="font-bold text-sm">
                    {s.tableNumber ?? s.tableId.slice(-4)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {s.customerCount} guests
                  </p>
                  <Badge variant="default" className="text-[10px] mt-1 h-4">
                    {s.status === "BILLING" ? "Billing" : "Active"}
                  </Badge>
                  {isManager && s.canCloseAsUnused && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      disabled={closingSessionId === s._id}
                      onClick={() => void handleCloseUnusedSession(s._id)}
                    >
                      {closingSessionId === s._id
                        ? "Closing..."
                        : "Close unused"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Feature flags */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Enabled Features
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {flags === undefined ? (
            <Skeleton className="h-8 w-full" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {flags.map((f) => (
                <Badge
                  key={f.key}
                  variant={f.enabled ? "default" : "secondary"}
                  className="text-xs"
                >
                  {f.key.replace(/_/g, " ")} {f.enabled ? "ON" : "OFF"}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
