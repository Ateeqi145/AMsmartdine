import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { Users, ShieldCheck, ShieldAlert, Shield, Search } from "lucide-react";

const ROLE_META: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  SUPER_ADMIN: { label: "Super Admin", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400", icon: Shield },
  RESTAURANT_MANAGER: { label: "Manager", color: "bg-primary/10 text-primary", icon: ShieldCheck },
  RESTAURANT_STAFF: { label: "Staff", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400", icon: ShieldAlert },
};

function AssignRoleDialog({
  user,
  restaurants,
  open,
  onClose,
}: {
  user: { _id: string; name?: string; email?: string; role?: string; restaurantId?: string };
  restaurants: Array<{ _id: string; name: string }>;
  open: boolean;
  onClose: () => void;
}) {
  const assignRole = useMutation(api.admin.assignUserRole);
  const [role, setRole] = useState(user.role ?? "RESTAURANT_STAFF");
  const [restaurantId, setRestaurantId] = useState(user.restaurantId ?? "");
  const [loading, setLoading] = useState(false);

  const needsRestaurant = role === "RESTAURANT_MANAGER" || role === "RESTAURANT_STAFF";

  const handleSave = async () => {
    if (needsRestaurant && !restaurantId) { toast.error("Select a restaurant"); return; }
    setLoading(true);
    try {
      await assignRole({
        userId: user._id as Id<"users">,
        role: role as "SUPER_ADMIN",
        restaurantId: needsRestaurant ? (restaurantId as Id<"restaurants">) : undefined,
      });
      toast.success("Role assigned successfully");
      onClose();
    } catch {
      toast.error("Failed to assign role");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 bg-muted/40 rounded-lg text-sm">
            <p className="font-medium">{user.name ?? user.email ?? "Unknown user"}</p>
            {user.email && user.name && <p className="text-muted-foreground text-xs">{user.email}</p>}
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SUPER_ADMIN">Super Admin</SelectItem>
                <SelectItem value="RESTAURANT_MANAGER">Restaurant Manager</SelectItem>
                <SelectItem value="RESTAURANT_STAFF">Restaurant Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {needsRestaurant && (
            <div className="space-y-1.5">
              <Label>Restaurant</Label>
              <Select value={restaurantId} onValueChange={setRestaurantId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select restaurant..." />
                </SelectTrigger>
                <SelectContent>
                  {restaurants.map((r) => (
                    <SelectItem key={r._id} value={r._id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>{loading ? "Saving..." : "Save Role"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperAdminUsers() {
  const allUsers = useQuery(api.admin.listAllUsers, {});
  const restaurants = useQuery(api.restaurants.listAll, { includeInactive: true });
  const setUserActive = useMutation(api.admin.setUserActive);
  const [editingUser, setEditingUser] = useState<{
    _id: string;
    name?: string;
    email?: string;
    role?: string;
    restaurantId?: string;
  } | null>(null);
  const [search, setSearch] = useState("");

  const restaurantMap = Object.fromEntries((restaurants ?? []).map((r) => [r._id, r.name]));

  const filtered = (allUsers ?? []).filter((u) => {
    const q = search.toLowerCase();
    return (
      !q ||
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground text-sm mt-0.5">Manage platform users and role assignments</p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email or role..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {allUsers === undefined ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Users className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium">{search ? "No users match your search" : "No users yet"}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((u) => {
            const roleMeta = ROLE_META[u.role ?? ""] ?? null;
            const RoleIcon = roleMeta?.icon;
            return (
              <Card key={u._id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                      {(u.name ?? u.email ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium truncate">{u.name ?? "No name"}</p>
                        {u.email && <p className="text-xs text-muted-foreground truncate">{u.email}</p>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {roleMeta ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded ${roleMeta.color}`}>
                            <RoleIcon className="w-3 h-3" />
                            {roleMeta.label}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No role</span>
                        )}
                        {u.restaurantId && restaurantMap[u.restaurantId] && (
                          <span className="text-xs text-muted-foreground">
                            @ {restaurantMap[u.restaurantId]}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <Badge variant={u.isActive ? "default" : "secondary"} className="text-xs">
                        {u.isActive ? "Active" : "Inactive"}
                      </Badge>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setEditingUser(u)}
                      >
                        Edit Role
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={`h-7 text-xs ${!u.isActive ? "text-green-600" : "text-destructive"}`}
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editingUser && (
        <AssignRoleDialog
          user={editingUser}
          restaurants={restaurants ?? []}
          open={!!editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}
