import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id, Doc } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Switch } from "@/components/ui/switch.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  UtensilsCrossed,
  Tag,
  Leaf,
  ToggleLeft,
  ChevronDown,
  ChevronUp,
  ImagePlus,
} from "lucide-react";

type Category = Doc<"menuCategories">;
type MenuItem = Doc<"menuItems">;

// ─── Category Dialog ──────────────────────────────────────────────
function CategoryDialog({
  restaurantId,
  edit,
  open,
  onClose,
}: {
  restaurantId: Id<"restaurants">;
  edit?: Category;
  open: boolean;
  onClose: () => void;
}) {
  const create = useMutation(api.menu.createCategory);
  const update = useMutation(api.menu.updateCategory);
  const [form, setForm] = useState({
    name: edit?.name ?? "",
    description: edit?.description ?? "",
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Category name is required");
      return;
    }
    setLoading(true);
    try {
      if (edit) {
        await update({
          categoryId: edit._id,
          restaurantId,
          name: form.name,
          description: form.description || undefined,
        });
        toast.success("Category updated");
      } else {
        await create({
          restaurantId,
          name: form.name,
          description: form.description || undefined,
        });
        toast.success("Category created");
      }
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save category",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Category Name *</Label>
            <Input
              placeholder="Starters, Mains, Drinks…"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              placeholder="Short description…"
              value={form.description}
              onChange={(e) =>
                setForm((f) => ({ ...f, description: e.target.value }))
              }
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : edit ? "Save" : "Add Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Menu Item Dialog ─────────────────────────────────────────────
function MenuItemDialog({
  restaurantId,
  categories,
  edit,
  defaultCategoryId,
  open,
  onClose,
}: {
  restaurantId: Id<"restaurants">;
  categories: Category[];
  edit?: MenuItem;
  defaultCategoryId?: Id<"menuCategories">;
  open: boolean;
  onClose: () => void;
}) {
  const create = useMutation(api.menu.createItem);
  const update = useMutation(api.menu.updateItem);
  const generateUploadUrl = useMutation(api.menu.generateItemImageUploadUrl);
  const [form, setForm] = useState({
    name: edit?.name ?? "",
    description: edit?.description ?? "",
    price: edit ? (edit.price / 100).toFixed(2) : "",
    categoryId:
      edit?.categoryId ??
      defaultCategoryId ??
      ("" as Id<"menuCategories"> | ""),
    isVeg: edit?.isVeg ?? false,
    tags: edit?.tags?.join(", ") ?? "",
  });
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(
    edit?.imageUrl ?? null,
  );
  const [loading, setLoading] = useState(false);
  const imageInputId = `menu-item-image-${edit?._id ?? defaultCategoryId ?? "new"}`;

  const uploadImage = async (file: File): Promise<Id<"_storage">> => {
    const uploadUrl = await generateUploadUrl({ restaurantId });
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    if (!response.ok) throw new Error("Image upload failed. Please try again.");
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("storageId" in body) ||
      typeof body.storageId !== "string"
    ) {
      throw new Error("The image upload returned an invalid response.");
    }
    return body.storageId as Id<"_storage">;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Item name is required");
      return;
    }
    if (!form.price || isNaN(parseFloat(form.price))) {
      toast.error("Valid price is required");
      return;
    }
    if (!form.categoryId) {
      toast.error("Select a category");
      return;
    }

    const priceInPaise = Math.round(parseFloat(form.price) * 100);
    const tagsArr = form.tags
      ? form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : undefined;

    setLoading(true);
    try {
      const imageStorageId = imageFile
        ? await uploadImage(imageFile)
        : undefined;
      if (edit) {
        await update({
          itemId: edit._id,
          restaurantId,
          name: form.name,
          description: form.description || undefined,
          price: priceInPaise,
          categoryId: form.categoryId as Id<"menuCategories">,
          isVeg: form.isVeg,
          tags: tagsArr,
          ...(imageStorageId ? { imageStorageId } : {}),
        });
        toast.success("Item updated");
      } else {
        await create({
          restaurantId,
          categoryId: form.categoryId as Id<"menuCategories">,
          name: form.name,
          description: form.description || undefined,
          price: priceInPaise,
          isVeg: form.isVeg,
          tags: tagsArr,
          ...(imageStorageId ? { imageStorageId } : {}),
        });
        toast.success("Item added");
      }
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{edit ? "Edit Item" : "Add Menu Item"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label>Item Name *</Label>
              <Input
                placeholder="Butter Chicken, Mango Lassi…"
                value={form.name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, name: e.target.value }))
                }
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor={imageInputId}>Item photo</Label>
              <label
                htmlFor={imageInputId}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed p-3 transition-colors hover:border-primary/50 hover:bg-muted/40"
              >
                {imagePreview ? (
                  <img
                    src={imagePreview}
                    alt="Menu item preview"
                    className="size-16 rounded-lg object-cover"
                  />
                ) : (
                  <span className="grid size-16 place-items-center rounded-lg bg-muted text-muted-foreground">
                    <ImagePlus className="size-6" />
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  {imageFile?.name ??
                    "Choose a photo (JPEG, PNG, WebP; up to 5 MB)"}
                </span>
                <input
                  id={imageInputId}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    if (!file) return;
                    if (
                      !["image/jpeg", "image/png", "image/webp"].includes(
                        file.type,
                      )
                    ) {
                      toast.error("Choose a JPEG, PNG, or WebP image");
                      event.target.value = "";
                      return;
                    }
                    if (file.size > 5 * 1024 * 1024) {
                      toast.error("Choose an image smaller than 5 MB");
                      event.target.value = "";
                      return;
                    }
                    setImageFile(file);
                    const reader = new FileReader();
                    reader.onload = () => {
                      if (typeof reader.result === "string") {
                        setImagePreview(reader.result);
                      }
                    };
                    reader.onerror = () =>
                      toast.error("Could not preview the selected image");
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="A short description…"
                rows={2}
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Price (₹) *</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                placeholder="299.00"
                value={form.price}
                onChange={(e) =>
                  setForm((f) => ({ ...f, price: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select
                value={form.categoryId}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    categoryId: v as Id<"menuCategories">,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c._id} value={c._id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tags (comma-separated)</Label>
              <Input
                placeholder="spicy, popular, chef's special"
                value={form.tags}
                onChange={(e) =>
                  setForm((f) => ({ ...f, tags: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Diet</Label>
              <div className="flex items-center gap-3 h-10">
                <Switch
                  checked={form.isVeg}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, isVeg: v }))}
                />
                <span
                  className={`text-sm font-medium ${form.isVeg ? "text-green-600" : "text-orange-600"}`}
                >
                  {form.isVeg ? "🟢 Veg" : "🔴 Non-Veg"}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Saving…" : edit ? "Save Changes" : "Add Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Item Card ────────────────────────────────────────────────────
function ItemCard({
  item,
  restaurantId,
  categories,
  onEdit,
}: {
  item: MenuItem;
  restaurantId: Id<"restaurants">;
  categories: Category[];
  onEdit: (item: MenuItem) => void;
}) {
  const deleteItem = useMutation(api.menu.deleteItem);
  const updateItem = useMutation(api.menu.updateItem);

  return (
    <div className="flex items-start gap-3 p-3 rounded-xl border hover:shadow-sm transition-shadow">
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt=""
          className="size-16 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs">{item.isVeg ? "🟢" : "🔴"}</span>
          <p className="text-sm font-semibold truncate">{item.name}</p>
          {item.tags?.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px] h-4">
              {tag}
            </Badge>
          ))}
        </div>
        {item.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {item.description}
          </p>
        )}
        <p className="text-sm font-bold text-primary mt-1">
          ₹{(item.price / 100).toFixed(0)}
        </p>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <Switch
          checked={item.isAvailable}
          onCheckedChange={async (v) => {
            try {
              await updateItem({
                itemId: item._id,
                restaurantId,
                isAvailable: v,
              });
              toast.success(v ? "Item available" : "Item unavailable");
            } catch {
              toast.error("Failed to update");
            }
          }}
        />
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={() => onEdit(item)}
        >
          <Pencil className="w-3 h-3" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
          onClick={async () => {
            try {
              await deleteItem({ itemId: item._id, restaurantId });
              toast.success("Item deleted");
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Failed to delete item",
              );
            }
          }}
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────
function CategorySection({
  category,
  items,
  restaurantId,
  allCategories,
}: {
  category: Category;
  items: MenuItem[];
  restaurantId: Id<"restaurants">;
  allCategories: Category[];
}) {
  const deleteCategory = useMutation(api.menu.deleteCategory);
  const [collapsed, setCollapsed] = useState(false);
  const [editCat, setEditCat] = useState(false);
  const [addItem, setAddItem] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-2 flex-1 text-left cursor-pointer"
          >
            {collapsed ? (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="font-semibold">{category.name}</span>
            <Badge variant="secondary" className="text-xs">
              {items.length} items
            </Badge>
            {!category.isActive && (
              <Badge variant="secondary" className="text-xs">
                Hidden
              </Badge>
            )}
          </button>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => setAddItem(true)}
            >
              <Plus className="w-3 h-3" />
              Add Item
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setEditCat(true)}
            >
              <Pencil className="w-3 h-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={async () => {
                try {
                  await deleteCategory({
                    categoryId: category._id,
                    restaurantId,
                  });
                  toast.success("Category deleted");
                } catch (err) {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Cannot delete category",
                  );
                }
              }}
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      {!collapsed && (
        <CardContent className="pt-0 space-y-2">
          {items.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              No items yet —{" "}
              <button
                className="text-primary hover:underline cursor-pointer"
                onClick={() => setAddItem(true)}
              >
                add the first item
              </button>
            </div>
          ) : (
            items.map((item) => (
              <ItemCard
                key={item._id}
                item={item}
                restaurantId={restaurantId}
                categories={allCategories}
                onEdit={setEditItem}
              />
            ))
          )}
        </CardContent>
      )}

      {/* Dialogs */}
      {editCat && (
        <CategoryDialog
          restaurantId={restaurantId}
          edit={category}
          open
          onClose={() => setEditCat(false)}
        />
      )}
      {addItem && (
        <MenuItemDialog
          restaurantId={restaurantId}
          categories={allCategories}
          defaultCategoryId={category._id}
          open
          onClose={() => setAddItem(false)}
        />
      )}
      {editItem && (
        <MenuItemDialog
          restaurantId={restaurantId}
          categories={allCategories}
          edit={editItem}
          open={!!editItem}
          onClose={() => setEditItem(null)}
        />
      )}
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function ManagerMenuPage() {
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const rid = restaurant?._id as Id<"restaurants"> | undefined;

  const categories = useQuery(
    api.menu.listCategories,
    rid ? { restaurantId: rid } : "skip",
  );
  const items = useQuery(
    api.menu.listItems,
    rid ? { restaurantId: rid } : "skip",
  );
  const addSampleMenu = useMutation(api.menu.addSampleMenu);

  const [addCatOpen, setAddCatOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [seedingSampleMenu, setSeedingSampleMenu] = useState(false);

  const handleAddSampleMenu = async () => {
    if (!rid || seedingSampleMenu) return;
    setSeedingSampleMenu(true);
    try {
      const seeded = await addSampleMenu({ restaurantId: rid });
      toast.success(
        seeded
          ? "Sample menu added"
          : "Sample menu is only added to an empty menu",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add sample menu",
      );
    } finally {
      setSeedingSampleMenu(false);
    }
  };

  // Group items by category
  const itemsByCategory = (items ?? []).reduce<Record<string, MenuItem[]>>(
    (acc, item) => {
      const key = item.categoryId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    },
    {},
  );

  const totalItems = items?.length ?? 0;
  const availableItems = (items ?? []).filter((i) => i.isAvailable).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Menu</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {totalItems} items · {availableItems} available
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            className="gap-1.5"
            onClick={() => setAddCatOpen(true)}
          >
            <Tag className="w-4 h-4" />
            Add Category
          </Button>
          <Button
            className="gap-1.5"
            onClick={() => setAddItemOpen(true)}
            disabled={!categories?.length}
          >
            <Plus className="w-4 h-4" />
            Add Item
          </Button>
        </div>
      </div>

      {categories === undefined ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center space-y-3">
            <UtensilsCrossed className="w-10 h-10 text-muted-foreground/40 mx-auto" />
            <p className="font-medium">No menu categories</p>
            <p className="text-sm text-muted-foreground">
              Start by creating categories (Starters, Mains, Drinks…)
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                className="mt-2 gap-2"
                disabled={seedingSampleMenu || !rid}
                onClick={() => void handleAddSampleMenu()}
              >
                <UtensilsCrossed className="size-4" />
                {seedingSampleMenu
                  ? "Adding sample menu..."
                  : "Load sample menu"}
              </Button>
              <Button
                className="mt-2 gap-2"
                variant="outline"
                onClick={() => setAddCatOpen(true)}
              >
                <Plus className="w-4 h-4" />
                Add First Category
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {categories.map((cat) => (
            <CategorySection
              key={cat._id}
              category={cat}
              items={itemsByCategory[cat._id] ?? []}
              restaurantId={rid!}
              allCategories={categories}
            />
          ))}
        </div>
      )}

      {rid && (
        <>
          {addCatOpen && (
            <CategoryDialog
              restaurantId={rid}
              open
              onClose={() => setAddCatOpen(false)}
            />
          )}
          {categories && categories.length > 0 && addItemOpen && (
            <MenuItemDialog
              restaurantId={rid}
              categories={categories}
              open
              onClose={() => setAddItemOpen(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
