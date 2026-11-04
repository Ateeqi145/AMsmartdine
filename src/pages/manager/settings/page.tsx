import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import {
  BellRing,
  CreditCard,
  Eye,
  MonitorCog,
  Music2,
  ShieldCheck,
  Star,
  Truck,
} from "lucide-react";
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
type ManagerFeature =
  "occupied_menu_access" | "online_payment" | "feedback" | "online_ordering";
type DeliveryPricingDraft = {
  restaurantId: Id<"restaurants">;
  deliveryFee: string;
  deliveryTaxRate: string;
  deliveryDiscount: string;
};

const SOUND_OPTIONS: Array<{ value: AlertSound; label: string }> = [
  { value: "chime", label: "Chime" },
  { value: "bell", label: "Bell" },
  { value: "pulse", label: "Pulse" },
];

const MANAGER_FEATURES: Array<{
  key: ManagerFeature;
  label: string;
  description: string;
  icon: typeof Eye;
}> = [
  {
    key: "occupied_menu_access",
    label: "Menu access at occupied tables",
    description:
      "Let other guests browse the menu while the first guest controls the table session.",
    icon: Eye,
  },
  {
    key: "online_payment",
    label: "UPI payments",
    description:
      "Allow customers to use the restaurant UPI ID or view its payment QR in their bill.",
    icon: CreditCard,
  },
  {
    key: "feedback",
    label: "Customer feedback",
    description: "Collect ratings and comments after a visit.",
    icon: Star,
  },
  {
    key: "online_ordering",
    label: "Home delivery ordering",
    description:
      "Let customers browse this restaurant and place delivery orders online.",
    icon: Truck,
  },
];

export default function RestaurantSettingsPage() {
  const user = useQuery(api.users.getCurrentUser, {});
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const featureFlags = useQuery(
    api.featureFlags.listByRestaurant,
    restaurant ? { restaurantId: restaurant._id } : "skip",
  );
  const generateUploadUrl = useMutation(
    api.restaurants.generateBrandAssetUploadUrl,
  );
  const updateSettings = useMutation(api.restaurants.updateSettings);
  const updateDeliverySettings = useMutation(
    api.restaurants.updateDeliverySettings,
  );
  const setManagerFeatureFlag = useMutation(api.featureFlags.setManagerFlag);
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
  const [upiId, setUpiId] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [paymentQrFile, setPaymentQrFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [paymentQrPreview, setPaymentQrPreview] = useState<string | null>(null);
  const [customSoundFile, setCustomSoundFile] = useState<File | null>(null);
  const [customSoundPreview, setCustomSoundPreview] = useState<string | null>(
    null,
  );
  const [removeCustomSound, setRemoveCustomSound] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingSound, setSavingSound] = useState(false);
  const [savingFeature, setSavingFeature] = useState<ManagerFeature | null>(
    null,
  );
  const [deliveryPricingDraft, setDeliveryPricingDraft] =
    useState<DeliveryPricingDraft | null>(null);
  const [savingDeliverySettings, setSavingDeliverySettings] = useState(false);
  const currentDeliveryPricing =
    restaurant && deliveryPricingDraft?.restaurantId === restaurant._id
      ? deliveryPricingDraft
      : {
          restaurantId: restaurant?._id,
          deliveryFee: String((restaurant?.deliveryFeePaise ?? 0) / 100),
          deliveryTaxRate: String(restaurant?.deliveryTaxRatePercent ?? 0),
          deliveryDiscount: String(
            (restaurant?.deliveryDiscountPaise ?? 0) / 100,
          ),
        };

  useEffect(
    () => () => {
      if (logoPreview?.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
      if (paymentQrPreview?.startsWith("blob:"))
        URL.revokeObjectURL(paymentQrPreview);
      if (customSoundPreview?.startsWith("blob:"))
        URL.revokeObjectURL(customSoundPreview);
    },
    [customSoundPreview, logoPreview, paymentQrPreview],
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

  const uploadAsset = async (file: File): Promise<Id<"_storage">> => {
    if (!restaurant) throw new Error("Business settings are not available.");
    const uploadUrl = await generateUploadUrl({
      restaurantId: restaurant._id,
    });
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType =
      file.type ||
      ({
        aac: "audio/aac",
        m4a: "audio/mp4",
        mp3: "audio/mpeg",
        ogg: "audio/ogg",
        wav: "audio/wav",
        webm: "audio/webm",
      }[extension] ??
        "application/octet-stream");
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": contentType },
      body: file,
    });
    if (!response.ok) throw new Error("File upload failed. Please try again.");
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("storageId" in body) ||
      typeof body.storageId !== "string"
    ) {
      throw new Error("The file upload returned an invalid response.");
    }
    return body.storageId as Id<"_storage">;
  };

  const selectCustomSound = (file: File | undefined): boolean => {
    if (!file) return false;
    const supportedType =
      [
        "audio/aac",
        "audio/mp4",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "audio/x-wav",
      ].includes(file.type) || /\.(aac|m4a|mp3|ogg|wav|webm)$/i.test(file.name);
    if (!supportedType) {
      toast.error("Choose an MP3, WAV, OGG, AAC, M4A, or WebM audio file.");
      return false;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Order alert sounds must be 5 MB or smaller.");
      return false;
    }
    setCustomSoundPreview(URL.createObjectURL(file));
    setCustomSoundFile(file);
    setRemoveCustomSound(false);
    return true;
  };

  const saveCustomSound = async () => {
    if (!restaurant || (!customSoundFile && !removeCustomSound)) return;
    setSavingSound(true);
    try {
      if (customSoundFile) {
        const orderSoundStorageId = await uploadAsset(customSoundFile);
        await updateSettings({
          restaurantId: restaurant._id,
          orderSoundStorageId,
        });
      } else {
        await updateSettings({
          restaurantId: restaurant._id,
          removeOrderSound: true,
        });
      }
      setCustomSoundFile(null);
      setCustomSoundPreview(null);
      setRemoveCustomSound(false);
      toast.success(
        customSoundFile
          ? "Custom order sound saved for this business."
          : "Custom order sound removed.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the order sound.",
      );
    } finally {
      setSavingSound(false);
    }
  };

  const previewCustomSound = () => {
    const source = customSoundPreview ?? restaurant?.orderSoundUrl;
    if (!source) {
      toast.error("Choose or save a custom sound before previewing it.");
      return;
    }
    window.dispatchEvent(
      new CustomEvent("smartdine:custom-order-sound-preview", {
        detail: source,
      }),
    );
  };

  const saveDeliverySettings = async () => {
    if (!restaurant) return;
    const feeRupees = Number(currentDeliveryPricing.deliveryFee);
    const taxPercent = Number(currentDeliveryPricing.deliveryTaxRate);
    const discountRupees = Number(currentDeliveryPricing.deliveryDiscount);
    if (
      !Number.isFinite(feeRupees) ||
      feeRupees < 0 ||
      !Number.isFinite(taxPercent) ||
      taxPercent < 0 ||
      taxPercent > 100 ||
      !Number.isFinite(discountRupees) ||
      discountRupees < 0
    ) {
      toast.error("Enter valid non-negative delivery settings.");
      return;
    }
    setSavingDeliverySettings(true);
    try {
      await updateDeliverySettings({
        restaurantId: restaurant._id,
        deliveryFeePaise: Math.round(feeRupees * 100),
        deliveryTaxRatePercent: taxPercent,
        deliveryDiscountPaise: Math.round(discountRupees * 100),
      });
      setDeliveryPricingDraft(null);
      toast.success("Delivery pricing saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save delivery pricing.",
      );
    } finally {
      setSavingDeliverySettings(false);
    }
  };

  const toggleManagerFeature = async (
    key: ManagerFeature,
    enabled: boolean,
  ) => {
    if (!restaurant) return;
    setSavingFeature(key);
    try {
      await setManagerFeatureFlag({
        restaurantId: restaurant._id,
        key,
        enabled,
      });
      const label = MANAGER_FEATURES.find(
        (feature) => feature.key === key,
      )?.label;
      toast.success(
        `${label ?? "Feature"} ${enabled ? "enabled" : "disabled"}.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update this feature.",
      );
    } finally {
      setSavingFeature(null);
    }
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
      const logoStorageId = logoFile ? await uploadAsset(logoFile) : undefined;
      const paymentQrStorageId = paymentQrFile
        ? await uploadAsset(paymentQrFile)
        : undefined;
      await updateSettings({
        restaurantId: restaurant._id,
        name: businessName.trim(),
        ...(upiId !== null ? { upiId } : {}),
        ...(logoStorageId ? { logoStorageId } : {}),
        ...(paymentQrStorageId ? { paymentQrStorageId } : {}),
      });
      setLogoFile(null);
      setPaymentQrFile(null);
      setUpiId(null);
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
              pages. Configure this restaurant&apos;s UPI ID for direct app
              payments or upload its payment QR.
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
            <div className="space-y-2">
              <Label htmlFor="business-upi-id">Restaurant UPI ID</Label>
              <Input
                id="business-upi-id"
                autoComplete="off"
                placeholder="name@bank"
                value={upiId ?? restaurant.upiId ?? ""}
                onChange={(event) => setUpiId(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Used to open the customer&apos;s UPI app with the bill amount.
                Payment still needs staff verification.
              </p>
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
                  Manual fallback shown to customers in the bill view.
                </p>
              </div>
            </div>
            <Button onClick={() => void saveBrand()} disabled={savingBrand}>
              {savingBrand ? "Saving..." : "Save business settings"}
            </Button>
          </CardContent>
        </Card>
      )}

      {user?.role === "RESTAURANT_MANAGER" && restaurant && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Online delivery pricing</CardTitle>
            <p className="text-sm text-muted-foreground">
              These values are applied to delivery orders on the server. The
              public menu is{" "}
              <a
                className="font-medium text-primary underline underline-offset-4"
                href={`/order/${restaurant.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                {window.location.origin}/order/{restaurant.slug}
              </a>
              .
            </p>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="delivery-fee">Delivery charge (₹)</Label>
              <Input
                id="delivery-fee"
                type="number"
                min="0"
                step="0.01"
                value={currentDeliveryPricing.deliveryFee}
                onChange={(event) =>
                  setDeliveryPricingDraft({
                    restaurantId: restaurant._id,
                    deliveryFee: event.target.value,
                    deliveryTaxRate: currentDeliveryPricing.deliveryTaxRate,
                    deliveryDiscount: currentDeliveryPricing.deliveryDiscount,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-tax">Tax rate (%)</Label>
              <Input
                id="delivery-tax"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={currentDeliveryPricing.deliveryTaxRate}
                onChange={(event) =>
                  setDeliveryPricingDraft({
                    restaurantId: restaurant._id,
                    deliveryFee: currentDeliveryPricing.deliveryFee,
                    deliveryTaxRate: event.target.value,
                    deliveryDiscount: currentDeliveryPricing.deliveryDiscount,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delivery-discount">Fixed discount (₹)</Label>
              <Input
                id="delivery-discount"
                type="number"
                min="0"
                step="0.01"
                value={currentDeliveryPricing.deliveryDiscount}
                onChange={(event) =>
                  setDeliveryPricingDraft({
                    restaurantId: restaurant._id,
                    deliveryFee: currentDeliveryPricing.deliveryFee,
                    deliveryTaxRate: currentDeliveryPricing.deliveryTaxRate,
                    deliveryDiscount: event.target.value,
                  })
                }
              />
            </div>
            <div className="sm:col-span-3">
              <Button
                onClick={() => void saveDeliverySettings()}
                disabled={savingDeliverySettings}
              >
                {savingDeliverySettings ? "Saving..." : "Save delivery pricing"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {user?.role === "RESTAURANT_MANAGER" && restaurant && (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Enabled features</CardTitle>
            <p className="text-sm text-muted-foreground">
              Control the customer features available for this business. Changes
              take effect immediately unless a Super Admin has set an
              availability override.
              {restaurant.deliveryEnabledBySuperAdmin !== undefined && (
                <span className="mt-1 block font-medium text-amber-700 dark:text-amber-400">
                  Home delivery currently follows the Super Admin override (
                  {restaurant.deliveryEnabledBySuperAdmin
                    ? "enabled"
                    : "disabled"}
                  ). Your manager preference is saved but does not override it.
                </span>
              )}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {featureFlags === undefined
              ? MANAGER_FEATURES.map(({ key, label }) => (
                  <div
                    key={key}
                    className="h-16 animate-pulse rounded-xl border bg-muted/30"
                    aria-label={`Loading ${label} setting`}
                  />
                ))
              : MANAGER_FEATURES.map(
                  ({ key, label, description, icon: Icon }) => {
                    const enabled =
                      featureFlags.find((flag) => flag.key === key)?.enabled ??
                      key === "occupied_menu_access";
                    return (
                      <div
                        key={key}
                        className={`flex items-center justify-between gap-4 rounded-xl border p-4 transition-colors ${
                          enabled
                            ? "border-primary/20 bg-primary/5"
                            : "border-border bg-muted/30"
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="rounded-lg bg-background p-2 text-primary">
                            <Icon className="size-4" />
                          </span>
                          <div>
                            <p className="text-sm font-medium">{label}</p>
                            <p className="text-xs text-muted-foreground">
                              {description}
                            </p>
                          </div>
                        </div>
                        <Switch
                          aria-label={`${label} ${enabled ? "enabled" : "disabled"}`}
                          checked={enabled}
                          disabled={savingFeature === key}
                          onCheckedChange={(checked) =>
                            void toggleManagerFeature(key, checked)
                          }
                        />
                      </div>
                    );
                  },
                )}
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
              <Label htmlFor="order-sound-tone">Built-in alert tone</Label>
              <select
                id="order-sound-tone"
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
                Used when no custom sound is saved. Selecting a tone plays a
                preview.
              </p>
            </div>
            {user?.role === "RESTAURANT_MANAGER" && restaurant && (
              <div className="space-y-3 rounded-xl border p-4">
                <div className="flex items-center gap-2">
                  <Music2 className="size-4 text-primary" />
                  <Label htmlFor="order-sound-file">Custom order sound</Label>
                </div>
                <Input
                  id="order-sound-file"
                  type="file"
                  accept="audio/aac,audio/mp4,audio/mpeg,audio/ogg,audio/wav,audio/webm,.aac,.m4a,.mp3,.ogg,.wav,.webm"
                  onChange={(event) => {
                    if (!selectCustomSound(event.target.files?.[0])) {
                      event.currentTarget.value = "";
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Upload an MP3, WAV, OGG, AAC, M4A, or WebM file up to 5 MB.
                  The saved sound is shared with staff on this business.
                </p>
                {(customSoundFile || restaurant.orderSoundUrl) &&
                  !removeCustomSound && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={previewCustomSound}
                      >
                        Preview sound
                      </Button>
                      {restaurant.orderSoundUrl && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setCustomSoundFile(null);
                            setCustomSoundPreview(null);
                            setRemoveCustomSound(true);
                          }}
                        >
                          Remove saved sound
                        </Button>
                      )}
                    </div>
                  )}
                {removeCustomSound && (
                  <p className="text-xs text-muted-foreground">
                    The saved custom sound will be removed when you save.
                  </p>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void saveCustomSound()}
                  disabled={
                    savingSound || (!customSoundFile && !removeCustomSound)
                  }
                >
                  {savingSound ? "Saving sound..." : "Save custom sound"}
                </Button>
              </div>
            )}
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
