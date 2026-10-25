import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BellRing, MonitorCog, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";

type AlertSound = "chime" | "bell" | "pulse";
type BrandAsset = "logo" | "paymentQr";

const SOUND_OPTIONS: Array<{ value: AlertSound; label: string }> = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "pulse", label: "Pulse" },
];

export default function RestaurantSettingsPage() {
  const user = useQuery(api.users.getCurrentUser, {});
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const generateUploadUrl = useMutation(
    api.restaurants.generateBrandAssetUploadUrl,
  );
  const updateSettings = useMutation(api.restaurants.updateSettings);
  const [soundEnabled, setSoundEnabledState] = useState(
    () => window.localStorage.getItem("smartdine-order-sound") !== "off",
  );
  const [alertSound, setAlertSound] = useState<AlertSound>(() => {
    const saved = window.localStorage.getItem("smartdine-order-sound-tone");
    return SOUND_OPTIONS.some((option) => option.value === saved)
      ? (saved as AlertSound)
      : "chime";
  });
  const [name, setName] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [paymentQrPreview, setPaymentQrPreview] = useState<string | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);

  useEffect(
    () => () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      if (paymentQrPreview?.startsWith("blob:"))
        URL.revokeObjectURL(paymentQrPreview);
    },
    [logoPreview, paymentQrPreview],
  );

  const setSoundEnabled = (enabled: boolean) => {
    setSoundEnabledState(enabled);
    window.localStorage.setItem(
      "smartdine-order-sound",
      enabled ? "on" : "off",
    );
    window.dispatchEvent(
      new CustomEvent("smartdine:order-sound", { detail: enabled }),
    );
  };

  const setSound = (sound: AlertSound) => {
    setAlertSound(sound);
    window.localStorage.setItem("smartdine-order-sound-tone", sound);
    window.dispatchEvent(
      new CustomEvent("smartdine:order-sound-tone", { detail: sound }),
    );
    window.dispatchEvent(
      new CustomEvent("smartdine:order-sound-preview", {
        detail: sound,
      }),
    );
  };

  const selectImage = (file: File | undefined, kind: BrandAsset) => {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images must be 5 MB or smaller.");
      return;
    }
    const preview = URL.createObjectURL(file);
    if (kind === "logo") {
      setLogoPreview(preview);
      setLogoFile(file);
    } else {
      setPaymentQrPreview(preview);
      setPaymentQrFile(file);
    }
  };

  const uploadImage = async (file: File): Promise<Id<"_storage">> => {
    if (!restaurant) throw new Error("Business settings are not available.");
    const uploadUrl = await generateUploadUrl({
      restaurantId: restaurant._id,
    });
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

  const saveBrand = async () => {
    if (!restaurant) return;
    const businessName = name ?? restaurant.name;
    if (!businessName.trim()) {
      toast.error("Business name is required.");
      return;
    }
    setSavingBrand(true);
    try {
      const logoStorageId = logoFile ? await uploadImage(logoFile) : undefined;
      const paymentQrStorageId = paymentQrFile
        ? await uploadImage(paymentQrFile)
        : undefined;
      await updateSettings({
        restaurantId: restaurant._id,
        name: businessName.trim(),
        ...(logoStorageId ? { logoStorageId } : {}),
        ...(paymentQrStorageId ? { paymentQrStorageId } : {}),
      });
      setLogoFile(null);
      setPaymentQrFile(null);
      toast.success("Business branding saved.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save settings.",
      );
    } finally {
      setSavingBrand(false);
    }
  };

  const businessLabel =
    restaurant?.businessType === "CAFE" ? "cafe" : "restaurant";

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Preferences
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize your {businessLabel} workspace.
        </p>
      </div>

      {user?.role === "RESTAURANT_MANAGER" && restaurant && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">
              Business branding and payments
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              The name and logo appear in the staff workspace and on customer QR
              pages. Upload the payment QR used on your table stands.
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="business-name">Business name</Label>
              <Input
                id="business-name"
                value={name ?? restaurant.name}
                maxLength={100}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="business-logo">Business logo</Label>
                <Input
                  id="business-logo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    selectImage(event.target.files?.[0], "logo")
                  }
                />
                {(logoPreview ?? restaurant.logoUrl) && (
                  <img
                    src={logoPreview ?? restaurant.logoUrl}
                    alt={`${name || restaurant.name} logo preview`}
                    className="size-16 rounded-xl border object-cover"
                  />
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="payment-qr">UPI payment QR image</Label>
                <Input
                  id="payment-qr"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    selectImage(event.target.files?.[0], "paymentQr")
                  }
                />
                {(paymentQrPreview ?? restaurant.paymentQrUrl) && (
                  <img
                    src={paymentQrPreview ?? restaurant.paymentQrUrl}
                    alt="UPI payment QR preview"
                    className="size-28 rounded-xl border bg-white object-contain p-1"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Shown to customers in the bill view after scanning the table
                  QR.
                </p>
              </div>
            </div>
            <Button onClick={() => void saveBrand()} disabled={savingBrand}>
              {savingBrand ? "Saving..." : "Save business settings"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <MonitorCog className="size-5" />
            </div>
            <CardTitle className="text-base">Appearance</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Light / dark theme</p>
              <p className="text-xs text-muted-foreground">
                Saved in this browser for your next visit.
              </p>
            </div>
            <ThemeToggle />
          </CardContent>
        </Card>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center gap-3 space-y-0">
            <div className="rounded-xl bg-amber-500/10 p-2.5 text-amber-600">
              <BellRing className="size-5" />
            </div>
            <CardTitle className="text-base">Order alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">New order sound</p>
                <p className="text-xs text-muted-foreground">
                  Your browser may require one click before audio can play.
                </p>
              </div>
              <Switch
                checked={soundEnabled}
                onCheckedChange={setSoundEnabled}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order-sound">Alert tone</Label>
              <select
                id="order-sound"
                value={alertSound}
                onChange={(event) => setSound(event.target.value as AlertSound)}
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              >
                {SOUND_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Selecting a tone plays a preview.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-semibold">
              {user?.role === "RESTAURANT_MANAGER"
                ? "Manager"
                : "Restaurant Staff"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {user?.name ?? user?.email ?? "Signed-in account"}
              {restaurant?.name ? ` · ${restaurant.name}` : ""}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
