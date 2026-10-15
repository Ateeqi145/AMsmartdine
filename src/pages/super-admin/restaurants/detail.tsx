import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import {
  ArrowLeft, Store, Users, Settings, ToggleLeft, Pencil,
  UserPlus, CheckCircle, XCircle, ShieldCheck, ShieldAlert,
} from "lucide-react";

const FEATURE_LABELS: Record<string, { label: string; description: string; icon: string }> = {
  shared_cart: { label: "Shared Cart", description: "All customers at a table share one cart in real-time", icon: "🛒" },
  online_payment: { label: "Online Payment", description: "UPI and card payments via Razorpay", icon: "💳" },
  call_waiter: { label: "Call Waiter", description: "Customers can call the waiter from the app", icon: "🔔" },
  feedback: { label: "Customer Feedback", description: "Post-meal ratings and comments", icon: "⭐" },
  partial_payment: { label: "Partial Payment", description: "Split bill across multiple payments", icon: "💰" },
};

const ROLE_LABELS: Record<string, string> = {
  RESTAURANT_MANAGER: "Manager",
  RESTAURANT_STAFF: "Staff",
  SUPER_ADMIN: "Super Admin",
};

// ── Edit Restaurant Dialog ────────────────────────────────────────────────────
function EditRestaurantDialog({
  restaurant,
  open,
  onClose,
}: {
  restaurant: { _id: string; name: string; slug: string; description?: string; address?: string; phone?: string; email?: string };
  open: boolean;
  onClose: () => void;
}) {
  const update = useMutation(api.restaurants.update);
  const [form, setForm] = useState({
    name: restaurant.name,
    description: restaurant.description ?? "",
    address: restaurant.address ?? "",
    phone: restaurant.phone ?? "",
    email: restaurant.email ?? "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await update({ restaurantId: restaurant._id as Id<"restaurants">, ...form });
      toast.success("Restaurant updated");
      onClose();
    } catch {
      toast.error("Failed to update restaurant");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Restaurant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Restaurant Name</Label>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Short description..." />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} placeholder="123 Main St, City" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+91 98765 43210" />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="info@restaurant.com" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Assign Staff Dialog ───────────────────────────────────────────────────────
function AssignStaffDialog({
  restaurantId,
  open,
  onClose,
}: {
  restaurantId: Id<"restaurants">;
  open: boolean;
  onClose: () => void;
}) {
  const allUsers = useQuery(api.admin.listAllUsers, {});
  const assignRole = useMutation(api.admin.assignUserRole);
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState<"RESTAURANT_MANAGER" | "RESTAURANT_STAFF">("RESTAURANT_STAFF");
  const [loading, setLoading] = useState(false);

  // Only show users who are not already assigned to this restaurant
  const eligibleUsers = (allUsers ?? []).filter(
    (u) => u.role !== "SUPER_ADMIN" && u.restaurantId !== restaurantId,
  );

  const handleAssign = async () => {
    if (!selectedUser) { toast.error("Select a user"); return; }
    setLoading(true);
    try {
      await assignRole({
        userId: selectedUser as Id<"users">,
        role: selectedRole,
        restaurantId,
        isActive: true,
      });
      toast.success("Staff assigned successfully");
      onClose();
      setSelectedUser("");
    } catch {
      toast.error("Failed to assign staff");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign Staff to Restaurant</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>User</Label>
            <Select value={selectedUser} onValueChange={setSelectedUser}>
              <SelectTrigger>
                <SelectValue placeholder="Select a user..." />
              </SelectTrigger>
              <SelectContent>
                {allUsers === undefined ? (
                  <SelectItem value="loading" disabled>Loading...</SelectItem>
                ) : eligibleUsers.length === 0 ? (
                  <SelectItem value="none" disabled>No eligible users</SelectItem>
                ) : (
                  eligibleUsers.map((u) => (
                    <SelectItem key={u._id} value={u._id}>
                      {u.name ?? u.email ?? u._id.slice(-8)}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as typeof selectedRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="RESTAURANT_MANAGER">Manager — full restaurant control</SelectItem>
                <SelectItem value="RESTAURANT_STAFF">Staff — operational access only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleAssign} disabled={loading || !selectedUser}>
            {loading ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function SuperAdminRestaurantDetail() {
  const { restaurantId } = useParams<{ restaurantId: string }>();
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const rid = restaurantId as Id<"restaurants"> | undefined;

  const restaurant = useQuery(api.restaurants.get, rid ? { restaurantId: rid } : "skip");
  const flags = useQuery(api.featureFlags.listByRestaurant, rid ? { restaurantId: rid } : "skip");
  const staff = useQuery(api.users.listByRestaurant, rid ? { restaurantId: rid } : "skip");
  const auditLogs = useQuery(api.admin.list, rid ? { restaurantId: rid, limit: 20 } : "skip");

  const setFlag = useMutation(api.featureFlags.setFlag);
  const setActive = useMutation(api.restaurants.setActive);
  const setUserActive = useMutation(api.admin.setUserActive);

  const flagMap = Object.fromEntries((flags ?? []).map((f) => [f.key, f.enabled]));

  const handleToggleFlag = async (key: string, enabled: boolean) => {
    if (!rid) return;
    try {
      await setFlag({ restaurantId: rid, key: key as "shared_cart", enabled });
      toast.success(`${FEATURE_LABELS[key]?.label ?? key} ${enabled ? "enabled" : "disabled"}`);
    } catch {
      toast.error("Failed to update feature flag");
    }
  };

  const handleToggleActive = async () => {
    if (!rid || !restaurant) return;
    try {
      await setActive({ restaurantId: rid, isActive: !restaurant.isActive });
      toast.success(restaurant.isActive ? "Restaurant deactivated" : "Restaurant activated");
    } catch {
      toast.error("Failed to update restaurant status");
    }
  };

  if (restaurant === undefined) {
    return (
      <div className="p-6 space-y-4 max-w-4xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!restaurant) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Restaurant not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-1 -ml-1">
        <ArrowLeft className="w-4 h-4" />
        Restaurants
      </Button>

      {/* Header card */}
      <Card>
        <CardContent className="py-5">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Store className="w-7 h-7 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold truncate">{restaurant.name}</h1>
                <Badge variant={restaurant.isActive ? "default" : "secondary"}>
                  {restaurant.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground font-mono mt-0.5">/{restaurant.slug}</p>
              {restaurant.description && (
                <p className="text-sm text-muted-foreground mt-1.5">{restaurant.description}</p>
              )}
              <div className="flex flex-wrap gap-4 mt-2 text-sm text-muted-foreground">
                {restaurant.address && <span>{restaurant.address}</span>}
                {restaurant.phone && <span>{restaurant.phone}</span>}
                {restaurant.email && <span>{restaurant.email}</span>}
              </div>
            </div>
            <div className="flex flex-col gap-2 flex-shrink-0">
              <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className={restaurant.isActive ? "gap-1.5 text-destructive hover:text-destructive" : "gap-1.5 text-green-600"}
                onClick={handleToggleActive}
              >
                {restaurant.isActive ? (
                  <><XCircle className="w-3.5 h-3.5" />Deactivate</>
                ) : (
                  <><CheckCircle className="w-3.5 h-3.5" />Activate</>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="features">
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          <TabsTrigger value="features" className="gap-1.5 text-xs">
            <ToggleLeft className="w-3.5 h-3.5" />
            Features
          </TabsTrigger>
          <TabsTrigger value="staff" className="gap-1.5 text-xs">
            <Users className="w-3.5 h-3.5" />
            Staff
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 text-xs">
            <Settings className="w-3.5 h-3.5" />
            Activity
          </TabsTrigger>
        </TabsList>

        {/* ── Feature Flags ── */}
        <TabsContent value="features" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Feature Configuration</CardTitle>
              <p className="text-xs text-muted-foreground">
                Toggle features for this restaurant. Changes take effect server-side immediately.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {flags === undefined ? (
                [...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)
              ) : (
                Object.entries(FEATURE_LABELS).map(([key, { label, description, icon }]) => (
                  <div
                    key={key}
                    className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                      flagMap[key] ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{icon}</span>
                      <div>
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-medium ${flagMap[key] ? "text-primary" : "text-muted-foreground"}`}>
                        {flagMap[key] ? "ON" : "OFF"}
                      </span>
                      <Switch
                        checked={flagMap[key] ?? false}
                        onCheckedChange={(checked) => handleToggleFlag(key, checked)}
                      />
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Staff ── */}
        <TabsContent value="staff" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Staff Members ({staff?.length ?? 0})
                </CardTitle>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => setAssignOpen(true)}>
                  <UserPlus className="w-3.5 h-3.5" />
                  Assign Staff
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {staff === undefined ? (
                <div className="space-y-2">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : staff.length === 0 ? (
                <div className="text-center py-10 space-y-2">
                  <Users className="w-8 h-8 text-muted-foreground/40 mx-auto" />
                  <p className="text-sm font-medium">No staff assigned</p>
                  <p className="text-xs text-muted-foreground">Assign managers and staff to this restaurant</p>
                  <Button size="sm" variant="ghost" className="mt-2 gap-1.5" onClick={() => setAssignOpen(true)}>
                    <UserPlus className="w-3.5 h-3.5" />
                    Assign Staff
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {staff.map((u) => (
                    <div key={u._id} className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl">
                      <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                        {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{u.name ?? u.email ?? "Unknown"}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {u.role === "RESTAURANT_MANAGER" ? (
                            <ShieldCheck className="w-3 h-3 text-primary" />
                          ) : (
                            <ShieldAlert className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className="text-xs text-muted-foreground">{ROLE_LABELS[u.role ?? ""] ?? u.role}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                          {u.isActive ? "Active" : "Inactive"}
                        </Badge>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={async () => {
                            try {
                              await setUserActive({ userId: u._id, isActive: !u.isActive });
                              toast.success(!u.isActive ? "User activated" : "User deactivated");
                            } catch {
                              toast.error("Failed to update user");
                            }
                          }}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Activity ── */}
        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Restaurant Activity Log</CardTitle>
            </CardHeader>
            <CardContent>
              {auditLogs === undefined ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No activity recorded yet</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => (
                    <div key={log._id} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{log.action.replace(/_/g, " ")}</p>
                        <div className="flex flex-wrap gap-2 mt-0.5 text-xs text-muted-foreground">
                          {log.actorRole && <span>{log.actorRole}</span>}
                          {log.requestId && <span className="font-mono">{log.requestId}</span>}
                          <span>{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        {log.details && (
                          <details className="mt-1">
                            <summary className="text-xs text-muted-foreground cursor-pointer">Details</summary>
                            <pre className="text-xs font-mono bg-muted/50 rounded p-1.5 mt-1 overflow-x-auto">{log.details}</pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      {restaurant && (
        <EditRestaurantDialog
          restaurant={restaurant as { _id: string; name: string; slug: string; description?: string; address?: string; phone?: string; email?: string }}
          open={editOpen}
          onClose={() => setEditOpen(false)}
        />
      )}
      {rid && (
        <AssignStaffDialog
          restaurantId={rid}
          open={assignOpen}
          onClose={() => setAssignOpen(false)}
        />
      )}
    </div>
  );
}
