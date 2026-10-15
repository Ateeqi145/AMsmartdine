import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  Store,
  TrendingUp,
  AlertTriangle,
  TicketPercent,
  Users,
  Circle,
  Activity,
  ChevronRight,
  CheckCircle2,
} from "lucide-react";

type StatCardProps = {
  title: string;
  value: number | undefined;
  icon: React.ElementType;
  colorClass: string;
  href: string;
  loading: boolean;
  subtitle?: string;
};

function StatCard({ title, value, icon: Icon, colorClass, href, loading, subtitle }: StatCardProps) {
  return (
    <Link to={href}>
      <Card className="hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer group">
        <CardContent className="pt-6 pb-5">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{title}</p>
              {loading ? (
                <Skeleton className="h-9 w-16 mt-1" />
              ) : (
                <p className="text-3xl font-bold tabular-nums">{value ?? 0}</p>
              )}
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${colorClass}`}>
              <Icon className="w-5 h-5" />
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

const systemServices = [
  { label: "API / Backend", status: "operational" },
  { label: "Database", status: "operational" },
  { label: "Authentication", status: "operational" },
  { label: "Realtime", status: "operational" },
];

export default function SuperAdminDashboard() {
  const stats = useQuery(api.admin.platformStats, {});
  const recentAudit = useQuery(api.admin.list, { limit: 5 });
  const recentErrors = useQuery(api.admin.listErrors, { status: "NEW", limit: 5 });

  const loading = stats === undefined;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            SmartDine platform overview · {new Date().toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <Badge variant="secondary" className="text-xs font-mono">v1.0.0</Badge>
      </div>

      {/* Stats grid */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <StatCard
          title="Total Restaurants"
          value={stats?.totalRestaurants}
          icon={Store}
          colorClass="bg-primary/10 text-primary"
          href="/super-admin/restaurants"
          loading={loading}
          subtitle="All time"
        />
        <StatCard
          title="Active Now"
          value={stats?.activeRestaurants}
          icon={TrendingUp}
          colorClass="bg-green-500/10 text-green-600 dark:text-green-400"
          href="/super-admin/restaurants"
          loading={loading}
          subtitle="Currently serving"
        />
        <StatCard
          title="New Errors"
          value={stats?.newErrorCount}
          icon={AlertTriangle}
          colorClass="bg-destructive/10 text-destructive"
          href="/super-admin/errors"
          loading={loading}
          subtitle="Needs review"
        />
        <StatCard
          title="Open Tickets"
          value={stats?.openTicketCount}
          icon={TicketPercent}
          colorClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
          href="/super-admin/support"
          loading={loading}
          subtitle="Support queue"
        />
      </motion.div>

      {/* System health row */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              System Status
            </CardTitle>
            <Link to="/super-admin/system-health" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
              Details <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {systemServices.map((s) => (
              <div key={s.label} className="flex items-center gap-2 p-3 bg-muted/40 rounded-lg">
                <Circle className="w-2 h-2 fill-green-500 text-green-500 flex-shrink-0" />
                <span className="text-sm">{s.label}</span>
                <span className="text-xs text-green-600 dark:text-green-400 ml-auto font-medium">OK</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Recent errors */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Recent Errors
              </CardTitle>
              <Link to="/super-admin/errors" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1">
            {recentErrors === undefined ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : recentErrors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mb-2" />
                <p className="text-sm font-medium">No new errors</p>
                <p className="text-xs text-muted-foreground mt-0.5">All systems clean</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentErrors.map((e) => (
                  <div key={e._id} className="flex items-start gap-3 p-3 bg-destructive/5 border border-destructive/10 rounded-lg">
                    <AlertTriangle className="w-3.5 h-3.5 text-destructive mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{e.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {e.module ?? "unknown module"} · {new Date(e.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent audit logs */}
        <Card className="flex flex-col">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recent Activity
              </CardTitle>
              <Link to="/super-admin/audit-logs" className="text-xs text-primary flex items-center gap-0.5 hover:underline">
                View all <ChevronRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0 flex-1">
            {recentAudit === undefined ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
              </div>
            ) : recentAudit.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Activity className="w-8 h-8 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium">No activity yet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Actions will appear here</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAudit.map((a) => (
                  <div key={a._id} className="flex items-start gap-3 p-3 bg-muted/40 rounded-lg">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{a.action.replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {a.actorRole} · {new Date(a.timestamp).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
