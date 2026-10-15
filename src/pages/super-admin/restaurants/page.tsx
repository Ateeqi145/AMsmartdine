import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { Plus, Store, ChevronRight, CheckCircle, XCircle } from "lucide-react";
import { Link } from "react-router-dom";

function CreateRestaurantDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useMutation(api.restaurants.create);
  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    address: "",
    phone: "",
    email: "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.slug) {
      toast.error("Name and slug are required");
      return;
    }
    setLoading(true);
    try {
      await create(form);
      toast.success("Restaurant created successfully");
      onClose();
      setForm({ name: "", slug: "", description: "", address: "", phone: "", email: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create restaurant");
    } finally {
      setLoading(false);
    }
  };

  const autoSlug = (name: string) =>
    name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Restaurant</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Restaurant Name *</Label>
            <Input
              placeholder="The Grand Kitchen"
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, slug: autoSlug(name) }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>URL Slug *</Label>
            <Input
              placeholder="the-grand-kitchen"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              placeholder="Fine dining experience..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input
              placeholder="123 Main St, City"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                placeholder="+91 98765 43210"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                placeholder="info@restaurant.com"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create Restaurant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function SuperAdminRestaurants() {
  const restaurants = useQuery(api.restaurants.listAll, { includeInactive: true });
  const setActive = useMutation(api.restaurants.setActive);
  const [createOpen, setCreateOpen] = useState(false);

  const handleToggle = async (restaurantId: string, current: boolean) => {
    try {
      await setActive({ restaurantId: restaurantId as Parameters<typeof setActive>[0]["restaurantId"], isActive: !current });
      toast.success(!current ? "Restaurant activated" : "Restaurant deactivated");
    } catch {
      toast.error("Failed to update restaurant status");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Restaurants</h1>
          <p className="text-muted-foreground mt-1">Manage all restaurants on the platform</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          New Restaurant
        </Button>
      </div>

      {restaurants === undefined ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : restaurants.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Store className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No restaurants yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first restaurant to get started</p>
            <Button className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Create Restaurant
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {restaurants.map((r) => (
            <Card key={r._id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Store className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{r.name}</p>
                      <Badge variant={r.isActive ? "default" : "secondary"} className="text-xs">
                        {r.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">/{r.slug}{r.address ? ` • ${r.address}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      className={r.isActive ? "text-destructive hover:text-destructive" : "text-green-600 hover:text-green-600"}
                      onClick={() => handleToggle(r._id, r.isActive)}
                    >
                      {r.isActive ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      {r.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Link to={`/super-admin/restaurants/${r._id}`}>
                      <Button size="sm" variant="ghost">
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateRestaurantDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </div>
  );
}
