import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { getUserFacingErrorMessage } from "@/lib/error-catalog";
import { DeleteUserDialog } from "@/components/users/delete-user-dialog";
import { Search, ShieldCheck, Trash2, Truck, Users } from "lucide-react";
import { toast } from "sonner";

type EditableRole = "RESTAURANT_STAFF" | "DELIVERY_PERSON";

function EditUserRoleDialog({
  user,
  onClose,
}: {
  user: Doc<"users">;
  onClose: () => void;
}) {
  const updateRole = useMutation(api.users.updateRestaurantUserRole);
  const [role, setRole] = useState<EditableRole>(
    user.role === "DELIVERY_PERSON" ? "DELIVERY_PERSON" : "RESTAURANT_STAFF",
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateRole({ userId: user._id, role });
      toast.success("User role updated");
      onClose();
    } catch (error) {
      toast.error(
        getUserFacingErrorMessage(error, "Failed to update user role"),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit user role</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <p className="font-medium">
              {user.name ?? user.email ?? "Unknown user"}
            </p>
            {user.name && user.email && (
              <p className="text-xs text-muted-foreground">{user.email}</p>
            )}
          </div>
          <Select
            value={role}
            onValueChange={(value) => {
              if (value === "RESTAURANT_STAFF" || value === "DELIVERY_PERSON") {
                setRole(value);
              }
            }}
          >
            <SelectTrigger aria-label="User role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RESTAURANT_STAFF">Restaurant Staff</SelectItem>
              <SelectItem value="DELIVERY_PERSON">Delivery Person</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Manager roles are assigned by a Super Admin. Each restaurant can
            have only one active manager.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ManagerUsersPage() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant);
  const currentUser = useQuery(api.users.getCurrentUser, {});
  const users = useQuery(
    api.users.listByRestaurant,
    restaurant ? { restaurantId: restaurant._id } : "skip",
  );
  const deleteUser = useMutation(api.users.deleteRestaurantUser);
  const [editingUser, setEditingUser] = useState<Doc<"users"> | null>(null);
  const [deletingUser, setDeletingUser] = useState<Doc<"users"> | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [search, setSearch] = useState("");

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    try {
      await deleteUser({ userId: deletingUser._id });
      toast.success("User deleted");
      setDeletingUser(null);
    } catch (error) {
      toast.error(getUserFacingErrorMessage(error, "Failed to delete user"));
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredUsers = (users ?? []).filter((user) => {
    const query = search.trim().toLowerCase();
    return (
      !query ||
      user.name?.toLowerCase().includes(query) ||
      user.email?.toLowerCase().includes(query) ||
      user.role?.toLowerCase().includes(query)
    );
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Users</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Manage user roles for {restaurant?.name ?? "your restaurant"}. The
          manager account can only be removed by a Super Admin.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          aria-label="Search users"
          placeholder="Search by name, email or role..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="pl-9"
        />
      </div>

      {restaurant === undefined ||
      currentUser === undefined ||
      (restaurant !== null && users === undefined) ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton key={item} className="h-16 w-full" />
          ))}
        </div>
      ) : restaurant === null ? (
        <Card>
          <CardContent className="py-14 text-center text-sm text-muted-foreground">
            No restaurant is assigned to this account.
          </CardContent>
        </Card>
      ) : filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Users className="mx-auto mb-2 size-8 text-muted-foreground/40" />
            <p className="text-sm font-medium">
              {search ? "No users match your search" : "No users yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((user) => {
            const isManager = user.role === "RESTAURANT_MANAGER";
            const isDelivery = user.role === "DELIVERY_PERSON";
            const isCurrentUser = user._id === currentUser?._id;
            const RoleIcon = isManager
              ? ShieldCheck
              : isDelivery
                ? Truck
                : Users;
            const roleLabel = isManager
              ? "Manager"
              : isDelivery
                ? "Delivery Person"
                : user.role === "RESTAURANT_STAFF"
                  ? "Staff"
                  : "No role";

            return (
              <Card key={user._id}>
                <CardContent className="py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {(user.name ?? user.email ?? "?")[0].toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {user.name ?? "No name"}
                      </p>
                      {user.email && (
                        <p className="truncate text-xs text-muted-foreground">
                          {user.email}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <Badge
                        variant={
                          user.isActive === false ? "secondary" : "default"
                        }
                      >
                        {user.isActive === false ? "Inactive" : "Active"}
                      </Badge>
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-2 py-1 text-xs">
                        <RoleIcon className="size-3" />
                        {roleLabel}
                      </span>
                      {!isCurrentUser &&
                        (user.role === "RESTAURANT_STAFF" ||
                          user.role === "DELIVERY_PERSON") && (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={() => setEditingUser(user)}
                            >
                              Edit Role
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs text-destructive hover:text-destructive"
                              onClick={() => setDeletingUser(user)}
                              aria-label={`Delete ${user.name ?? user.email ?? "user"}`}
                            >
                              <Trash2 className="mr-1 size-3.5" />
                              Delete
                            </Button>
                          </>
                        )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editingUser && (
        <EditUserRoleDialog
          key={editingUser._id}
          user={editingUser}
          onClose={() => setEditingUser(null)}
        />
      )}
      {deletingUser && (
        <DeleteUserDialog
          userName={deletingUser.name ?? deletingUser.email ?? "this user"}
          open={!!deletingUser}
          isDeleting={isDeleting}
          onOpenChange={(open) => {
            if (!open) setDeletingUser(null);
          }}
          onConfirm={() => void handleDeleteUser()}
        />
      )}
    </div>
  );
}
