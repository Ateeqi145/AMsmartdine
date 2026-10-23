import { lazy, Suspense } from "react";
import {
  BrowserRouter,
  Route,
  Routes,
  Navigate,
  useLocation,
} from "react-router-dom";
import { DefaultProviders } from "./components/providers/default.tsx";
import Index from "./pages/Index.tsx";
import { Skeleton } from "./components/ui/skeleton.tsx";

// Super Admin
const NotFound = lazy(() => import("./pages/NotFound.tsx"));
const Unauthorized = lazy(() => import("./pages/Unauthorized.tsx"));
const SuperAdminLayout = lazy(() => import("./pages/super-admin/layout.tsx"));
const SuperAdminDashboard = lazy(
  () => import("./pages/super-admin/dashboard/page.tsx"),
);
const SuperAdminRestaurants = lazy(
  () => import("./pages/super-admin/restaurants/page.tsx"),
);
const SuperAdminRestaurantDetail = lazy(
  () => import("./pages/super-admin/restaurants/detail.tsx"),
);
const SuperAdminUsers = lazy(
  () => import("./pages/super-admin/users/page.tsx"),
);
const SuperAdminSystemHealth = lazy(
  () => import("./pages/super-admin/system-health/page.tsx"),
);
const SuperAdminErrors = lazy(
  () => import("./pages/super-admin/errors/page.tsx"),
);
const SuperAdminSupport = lazy(
  () => import("./pages/super-admin/support/page.tsx"),
);
const SuperAdminAuditLogs = lazy(
  () => import("./pages/super-admin/audit-logs/page.tsx"),
);

// Manager Portal
const ManagerLayout = lazy(() => import("./pages/manager/layout.tsx"));
const ManagerDashboard = lazy(
  () => import("./pages/manager/dashboard/page.tsx"),
);
const ManagerTablesPage = lazy(() => import("./pages/manager/tables/page.tsx"));
const ManagerMenuPage = lazy(() => import("./pages/manager/menu/page.tsx"));
const ManagerOrdersPage = lazy(() => import("./pages/manager/orders/page.tsx"));
const ManagerReportsPage = lazy(
  () => import("./pages/manager/reports/page.tsx"),
);
const ManagerBillingPage = lazy(
  () => import("./pages/manager/billing/page.tsx"),
);
const ManagerSettingsPage = lazy(
  () => import("./pages/manager/settings/page.tsx"),
);
const TablePage = lazy(() => import("./pages/table/page.tsx"));

function LegacyRestaurantRedirect() {
  const location = useLocation();
  return (
    <Navigate
      to={
        location.pathname.replace(/^\/manager/, "/restaurant") + location.search
      }
      replace
    />
  );
}

export default function App() {
  return (
    <DefaultProviders>
      <BrowserRouter>
        <Suspense
          fallback={
            <div className="flex min-h-screen items-center justify-center">
              <Skeleton className="h-10 w-40" />
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/unauthorized" element={<Unauthorized />} />

            {/* Super Admin area */}
            <Route path="/super-admin" element={<SuperAdminLayout />}>
              <Route
                index
                element={<Navigate to="/super-admin/dashboard" replace />}
              />
              <Route path="dashboard" element={<SuperAdminDashboard />} />
              <Route path="restaurants" element={<SuperAdminRestaurants />} />
              <Route
                path="restaurants/:restaurantId"
                element={<SuperAdminRestaurantDetail />}
              />
              <Route path="users" element={<SuperAdminUsers />} />
              <Route
                path="system-health"
                element={<SuperAdminSystemHealth />}
              />
              <Route path="errors" element={<SuperAdminErrors />} />
              <Route path="support" element={<SuperAdminSupport />} />
              <Route path="audit-logs" element={<SuperAdminAuditLogs />} />
            </Route>

            {/* Restaurant Manager / Staff portal */}
            <Route path="/restaurant" element={<ManagerLayout />}>
              <Route
                index
                element={<Navigate to="/restaurant/dashboard" replace />}
              />
              <Route path="dashboard" element={<ManagerDashboard />} />
              <Route path="tables" element={<ManagerTablesPage />} />
              <Route path="menu" element={<ManagerMenuPage />} />
              <Route path="orders" element={<ManagerOrdersPage />} />
              <Route path="billing" element={<ManagerBillingPage />} />
              <Route path="reports" element={<ManagerReportsPage />} />
              <Route path="settings" element={<ManagerSettingsPage />} />
            </Route>
            <Route path="/manager/*" element={<LegacyRestaurantRedirect />} />

            {/* Customer QR table ordering */}
            <Route path="/table/:qrToken" element={<TablePage />} />

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </DefaultProviders>
  );
}
