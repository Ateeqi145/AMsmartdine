import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Skeleton } from "@/components/ui/skeleton.tsx";
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
import type { Id } from "@/convex/_generated/dataModel.d.ts";

function useRestaurantId() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant);
  return restaurant?._id as Id<"restaurants"> | undefined;
}

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="border rounded-xl bg-card p-5 space-y-1">
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
        {label}
      </p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

export default function ReportsPage() {
  const restaurantId = useRestaurantId();

  const revenue = useQuery(
    api.reports.dailyRevenue,
    restaurantId ? { restaurantId, days: 7 } : "skip"
  );
  const topItems = useQuery(
    api.reports.topMenuItems,
    restaurantId ? { restaurantId, limit: 8 } : "skip"
  );
  const stats = useQuery(
    api.reports.sessionStats,
    restaurantId ? { restaurantId } : "skip"
  );

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Revenue analytics and performance metrics
        </p>
      </div>

      {/* Stats row */}
      {stats === undefined ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Orders Today"
            value={stats.totalOrdersToday}
          />
          <StatCard
            label="Revenue Today"
            value={`₹${(stats.totalRevenueToday / 100).toFixed(0)}`}
          />
          <StatCard
            label="Avg Order Value"
            value={`₹${(stats.avgOrderValue / 100).toFixed(0)}`}
          />
          <StatCard
            label="Avg Session Duration"
            value={`${stats.avgDurationMinutes} min`}
          />
        </div>
      )}

      {/* Revenue Chart */}
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="font-semibold">Revenue — Last 7 Days</h2>
        {revenue === undefined ? (
          <Skeleton className="h-56 w-full" />
        ) : (
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
                formatter={(value) => [`₹${(Number(value ?? 0) / 100).toFixed(2)}`, "Revenue"]}
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
        )}
      </div>

      {/* Top Items Chart */}
      <div className="border rounded-xl bg-card p-5 space-y-4">
        <h2 className="font-semibold">Top Menu Items by Orders</h2>
        {topItems === undefined ? (
          <Skeleton className="h-56 w-full" />
        ) : topItems.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            No order data yet
          </p>
        ) : (
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
              <Tooltip
                formatter={(value) => [Number(value ?? 0), "Orders"]}
              />
              <Bar dataKey="count" fill="oklch(0.65 0.18 45)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
