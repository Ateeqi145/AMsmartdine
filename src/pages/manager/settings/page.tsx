import { useState } from "react";
import { useQuery } from "convex/react";
import { BellRing, MonitorCog, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { ThemeToggle } from "@/components/theme-toggle";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RestaurantSettingsPage() {
  const user = useQuery(api.users.getCurrentUser, {});
  const restaurant = useQuery(api.users.getCurrentUserRestaurant, {});
  const [soundEnabled, setSoundEnabledState] = useState(
    () => window.localStorage.getItem("smartdine-order-sound") !== "off",
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
          Preferences
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize your{" "}
          {user?.role === "RESTAURANT_MANAGER" ? "manager" : "staff"} workspace.
        </p>
      </div>

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
          <CardContent className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">New order sound</p>
              <p className="text-xs text-muted-foreground">
                Your browser may require one click before audio can play.
              </p>
            </div>
            <Switch checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-2xl">
        <CardContent className="flex items-start gap-3 p-5">
          <ShieldCheck className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-semibold">
              {user?.role === "RESTAURANT_MANAGER"
                ? "Restaurant Manager"
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
