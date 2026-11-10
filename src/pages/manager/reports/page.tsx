import { Component, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { format } from "date-fns";

type ReportOrderType = "DINE_IN" | "DELIVERY";

class ReportsErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Reports page failed to render.", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
          <Card>
            <CardContent className="space-y-3 py-10 text-center">
              <h1 className="text-xl font-semibold">Reports unavailable</h1>
              <p className="text-sm text-muted-foreground">
                The reports could not be loaded. Reload the page to try again.
              </p>
              <Button onClick={() => window.location.reload()}>
                Reload reports
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-xl bg-card p-5 space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ReportsContent() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant);
  const restaurantId = restaurant?._id;
  const [orderType, setOrderType] = useState<ReportOrderType>("DINE_IN");

  const revenue = useQuery(
    api.reports.dailyRevenue,
    restaurantId ? { restaurantId, days: 7, orderType } : "skip",
  );
  const topItems = useQuery(
    api.reports.topMenuItems,
    restaurantId ? { restaurantId, limit: 8, orderType } : "skip",
  );
  const stats = useQuery(
    api.reports.sessionStats,
    restaurantId ? { restaurantId, orderType } : "skip",
  );

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Revenue and performance reports by order channel
        </p>
      </div>

      <div
        className="flex w-fit gap-2 rounded-xl border bg-card p-1"
        role="group"
        aria-label="Report order type"
      >
        {(
          [
            ["DINE_IN", "Dine-in"],
            ["DELIVERY", "Home delivery"],
          ] as const
        ).map(([type, label]) => (
          <button
            key={type}
            type="button"
            aria-pressed={orderType === type}
            onClick={() => setOrderType(type)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              orderType === type
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {restaurant === null ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No restaurant is assigned to this manager account.
          </CardContent>
        </Card>
      ) : null}

      {/* Stats row */}
      {restaurant !== null && stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : restaurant !== null && stats ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Orders Today" value={stats.totalOrdersToday} />
          <StatCard
            label="Revenue Today"
            value={`₹${(stats.totalRevenueToday / 100).toFixed(0)}`}
          />
          <StatCard
            label="Avg Order Value"
            value={`₹${(stats.avgOrderValue / 100).toFixed(0)}`}
          />
          <StatCard
            label={
              orderType === "DINE_IN"
                ? "Avg Session Duration"
                : "Avg Delivery Time"
            }
            value={`${stats.avgDurationMinutes} min`}
          />
        </div>
      ) : null}

      {/* Revenue Chart */}
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="font-semibold">
          {orderType === "DINE_IN" ? "Dine-in" : "Home delivery"} revenue — last
          7 days
        </h2>
        {restaurant !== null && revenue === undefined ? (
          <Skeleton className="h-56 w-full" />
        ) : restaurant !== null && revenue ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) =>
                  format(new Date(d + "T12:00:00"), "MMM d")
                }
                className="text-xs fill-muted-foreground"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                tickFormatter={(v: number) => `₹${(v / 100).toFixed(0)}`}
                tick={{ fontSize: 11 }}
                className="fill-muted-foreground"
              />
              <Tooltip
                formatter={(value) => [
                  `₹${(Number(value ?? 0) / 100).toFixed(2)}`,
                  "Revenue",
                ]}
                labelFormatter={(label) =>
                  typeof label === "string"
                    ? format(new Date(label + "T12:00:00"), "MMM d, yyyy")
                    : ""
                }
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="oklch(0.65 0.18 45)"
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : null}
      </div>

      {/* Top Items Chart */}
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="font-semibold">
          Top {orderType === "DINE_IN" ? "dine-in" : "home delivery"} menu items
          by orders
        </h2>
        {restaurant !== null && topItems === undefined ? (
          <Skeleton className="h-56 w-full" />
        ) : restaurant !== null && topItems?.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            No order data yet
          </p>
        ) : restaurant !== null && topItems ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topItems} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fontSize: 11 }}
              />
              <Tooltip formatter={(value) => [Number(value ?? 0), "Orders"]} />
              <Bar
                dataKey="count"
                fill="oklch(0.65 0.18 45)"
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <ReportsErrorBoundary>
      <ReportsContent />
    </ReportsErrorBoundary>
  );
}
