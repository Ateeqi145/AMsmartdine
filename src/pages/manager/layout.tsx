import { Component, useEffect, useRef, useState } from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useQuery,
} from "convex/react";
import {
  Navigate,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  BarChart3,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  QrCode,
  Settings,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const navItems = [
  { to: "/restaurant/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    to: "/restaurant/tables",
    label: "Tables",
    icon: QrCode,
    managerOnly: true,
  },
  {
    to: "/restaurant/menu",
    label: "Menu",
    icon: UtensilsCrossed,
    managerOnly: true,
  },
  { to: "/restaurant/orders", label: "Orders", icon: ClipboardList },
  {
    to: "/restaurant/reports",
    label: "Reports",
    icon: BarChart3,
    managerOnly: true,
  },
  { to: "/restaurant/settings", label: "Settings", icon: Settings },
];

type AlertSound = "chime" | "bell" | "pulse";

function playOrderAlert(
  context: AudioContext | null,
  sound: AlertSound = "chime",
) {
  if (!context || context.state !== "running") return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type =
    sound === "bell" ? "triangle" : sound === "pulse" ? "square" : "sine";
  oscillator.frequency.value =
    sound === "bell" ? 660 : sound === "pulse" ? 440 : 880;
  const duration = sound === "pulse" ? 0.2 : sound === "bell" ? 0.65 : 0.45;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(
    sound === "pulse" ? 0.09 : 0.12,
    context.currentTime + 0.02,
  );
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    context.currentTime + duration,
  );
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + duration + 0.01);
}

function playCustomOrderAlert(
  current: HTMLAudioElement | null,
  source: string,
): HTMLAudioElement {
  const normalizedSource = new URL(source, window.location.href).href;
  const player =
    current?.src === normalizedSource ? current : new Audio(normalizedSource);
  player.currentTime = 0;
  void player.play().catch((error: unknown) => {
    console.warn("Could not play the custom order alert sound.", error);
  });
  return player;
}

function StaffAlerts({
  restaurantId,
  soundEnabled,
  soundTone,
  customSoundUrl,
}: {
  restaurantId: Id<"restaurants">;
  soundEnabled: boolean;
  soundTone: AlertSound;
  customSoundUrl?: string;
}) {
  const notifications = useQuery(api.waiterRequests.listRecentCustomerActions, {
    restaurantId,
  });
  const navigate = useNavigate();
  const audioContext = useRef<AudioContext | null>(null);
  const customAudio = useRef<HTMLAudioElement | null>(null);
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);

  useEffect(() => {
    const unlockAudio = () => {
      if (!audioContext.current) {
        const AudioContextClass =
          window.AudioContext ??
          (
            window as typeof window & {
              webkitAudioContext?: typeof AudioContext;
            }
          ).webkitAudioContext;
        if (AudioContextClass) audioContext.current = new AudioContextClass();
      }
      if (audioContext.current?.state === "suspended") {
        void audioContext.current.resume();
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, []);

  useEffect(() => {
    const previewSound = (event: Event) => {
      const sound = (event as CustomEvent<AlertSound>).detail;
      if (sound === "chime" || sound === "bell" || sound === "pulse") {
        playOrderAlert(audioContext.current, sound);
      }
    };
    window.addEventListener("smartdine:order-sound-preview", previewSound);
    return () =>
      window.removeEventListener(
        "smartdine:order-sound-preview",
        previewSound,
      );
  }, []);

  useEffect(() => {
    const previewCustomSound = (event: Event) => {
      const source = (event as CustomEvent<string>).detail;
      if (typeof source === "string" && source.length > 0) {
        customAudio.current = playCustomOrderAlert(customAudio.current, source);
      }
    };
    window.addEventListener(
      "smartdine:custom-order-sound-preview",
      previewCustomSound,
    );
    return () =>
      window.removeEventListener(
        "smartdine:custom-order-sound-preview",
        previewCustomSound,
      );
  }, []);

  useEffect(() => {
    if (!notifications) return;
    if (!initialized.current) {
      for (const notification of notifications)
        seen.current.add(notification._id);
      initialized.current = true;
      return;
    }

    const fresh = notifications
      .filter((notification) => !seen.current.has(notification._id))
      .slice()
      .reverse();
    for (const notification of fresh) {
      seen.current.add(notification._id);
      if (notification.eventType === "ORDER_PLACED" && soundEnabled) {
        if (customSoundUrl) {
          customAudio.current = playCustomOrderAlert(
            customAudio.current,
            customSoundUrl,
          );
        } else {
          playOrderAlert(audioContext.current, soundTone);
        }
      }
      toast(notification.message, {
        description: `${notification.tableDisplayName} · ${new Date(notification.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        duration: 9000,
        action: {
          label: "Open orders",
          onClick: () => navigate("/restaurant/orders"),
        },
      });
    }
  }, [customSoundUrl, navigate, notifications, soundEnabled, soundTone]);

  return null;
}

class StaffAlertsBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Staff notifications could not be loaded.", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-xl border border-destructive/30 bg-background p-4 text-sm shadow-lg"
        >
          <p className="font-semibold">Staff notifications unavailable</p>
          <p className="mt-1 text-muted-foreground">
            The backend needs to be updated before live customer alerts can
            load. The rest of the restaurant workspace is still available.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

function ManagerGuard({ children }: { children: React.ReactNode }) {
  const user = useQuery(api.users.getCurrentUser, {});
  const location = useLocation();
  const managerOnlyPage = [
    "/restaurant/tables",
    "/restaurant/menu",
    "/restaurant/reports",
  ].includes(location.pathname);

  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Skeleton className="h-12 w-48" />
      </div>
    );
  }
  if (user?.isActive === false) {
    return <Navigate to="/unauthorized?reason=inactive" replace />;
  }
  if (user?.role === "SUPER_ADMIN") {
    return <Navigate to="/super-admin/dashboard" replace />;
  }
  if (
    user?.role !== "RESTAURANT_MANAGER" &&
    user?.role !== "RESTAURANT_STAFF"
  ) {
    return <Navigate to="/unauthorized" replace />;
  }
  if (user.role === "RESTAURANT_STAFF" && managerOnlyPage) {
    return <Navigate to="/restaurant/orders" replace />;
  }
  return <>{children}</>;
}

function RedirectHome() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate("/");
  }, [navigate]);
  return null;
}

export default function ManagerLayout() {
  const { signout } = useAuth();
  const user = useQuery(api.users.getCurrentUser, {});
  const restaurant = useQuery(
    api.users.getCurrentUserRestaurant,
    user?.isActive === false ? "skip" : {},
  );
  const actionCounts = useQuery(
    api.sessions.getManagerActionCounts,
    restaurant?._id ? { restaurantId: restaurant._id } : "skip",
  );
  const isManager = user?.role === "RESTAURANT_MANAGER";
  const [soundEnabled, setSoundEnabled] = useState(
    () => window.localStorage.getItem("smartdine-order-sound") !== "off",
  );
  const [soundTone, setSoundTone] = useState<AlertSound>(() => {
    const tone = window.localStorage.getItem("smartdine-order-sound-tone");
    return tone === "bell" || tone === "pulse" ? tone : "chime";
  });

  useEffect(() => {
    const updateSound = (event: Event) => {
      const enabled = (event as CustomEvent<boolean>).detail;
      setSoundEnabled(enabled);
    };
    window.addEventListener("smartdine:order-sound", updateSound);
    return () =>
      window.removeEventListener("smartdine:order-sound", updateSound);
  }, []);

  useEffect(() => {
    const updateTone = (event: Event) => {
      const tone = (event as CustomEvent<AlertSound>).detail;
      if (tone === "chime" || tone === "bell" || tone === "pulse") {
        setSoundTone(tone);
      }
    };
    window.addEventListener("smartdine:order-sound-tone", updateTone);
    return () =>
      window.removeEventListener("smartdine:order-sound-tone", updateTone);
  }, []);

  const visibleNav = navItems.filter((item) => !item.managerOnly || isManager);
  const restaurantId = restaurant?._id;
  const getActionCount = (to: string) => {
    if (to === "/restaurant/orders") {
      return (
        (actionCounts?.orders ?? 0) + (actionCounts?.unusedSessions ?? 0)
      );
    }
    if (to === "/restaurant/dashboard" && isManager) {
      return actionCounts?.unusedSessions ?? 0;
    }
    return 0;
  };

  return (
    <>
      <AuthLoading>
        <div className="flex h-screen items-center justify-center">
          <Skeleton className="h-12 w-48" />
        </div>
      </AuthLoading>
      <Unauthenticated>
        <RedirectHome />
      </Unauthenticated>
      <Authenticated>
        <ManagerGuard>
          <div className="flex h-screen overflow-hidden bg-background">
            <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
              <div className="flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4">
                {restaurant?.logoUrl ? (
                  <img
                    src={restaurant.logoUrl}
                    alt=""
                    className="size-8 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <UtensilsCrossed className="h-5 w-5 text-primary" />
                )}
                <div>
                  <p className="max-w-40 truncate text-sm font-bold">
                    {restaurant?.name ?? "SmartDine"}
                  </p>
                  <p className="text-[9px] font-semibold uppercase text-primary">
                    {restaurant?.businessType === "CAFE"
                      ? isManager
                        ? "Cafe Manager"
                        : "Cafe Staff"
                      : isManager
                        ? "Restaurant Manager"
                        : "Restaurant Staff"}
                  </p>
                </div>
              </div>
              <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-3">
                {visibleNav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center justify-between gap-2.5 rounded-md px-3 py-2 text-sm font-medium",
                        isActive
                          ? "bg-sidebar-accent text-sidebar-primary"
                          : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50",
                      )
                    }
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="relative">
                        <Icon className="h-4 w-4" />
                        {getActionCount(to) > 0 && (
                          <span
                            aria-label={`${getActionCount(to)} action${getActionCount(to) === 1 ? "" : "s"} available`}
                            className="absolute -right-2 -top-2 inline-flex size-4 animate-pulse items-center justify-center rounded-full bg-destructive text-[9px] font-bold leading-none text-destructive-foreground md:hidden"
                          >
                            {Math.min(getActionCount(to), 9)}
                          </span>
                        )}
                      </span>
                      {label}
                    </span>
                    {getActionCount(to) > 0 && (
                      <span
                        aria-label={`${getActionCount(to)} action${getActionCount(to) === 1 ? "" : "s"} available`}
                        className="hidden min-w-5 animate-pulse items-center justify-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground md:inline-flex"
                      >
                        {getActionCount(to) > 99
                          ? "99+"
                          : getActionCount(to)}
                      </span>
                    )}
                  </NavLink>
                ))}
              </nav>
              <button
                onClick={() => signout()}
                className="flex items-center gap-2 border-t border-sidebar-border px-4 py-3 text-sm text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" /> Sign Out
              </button>
            </aside>
            <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
              {restaurantId && (
                <StaffAlertsBoundary key={restaurantId}>
                  <StaffAlerts
                    restaurantId={restaurantId}
                    soundEnabled={soundEnabled}
                    soundTone={soundTone}
                    customSoundUrl={restaurant?.orderSoundUrl}
                  />
                </StaffAlertsBoundary>
              )}
              <header className="sticky top-0 z-30 flex h-14 items-center justify-end gap-2 border-b bg-background/90 px-4 backdrop-blur">
                <div className="mr-auto flex min-w-0 items-center gap-2">
                  {restaurant?.logoUrl && (
                    <img
                      src={restaurant.logoUrl}
                      alt=""
                      className="size-8 shrink-0 rounded-lg object-cover"
                    />
                  )}
                  <span className="truncate text-sm font-medium">
                    {restaurant?.name ??
                      (isManager ? "Manager workspace" : "Staff workspace")}
                  </span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  aria-label={
                    soundEnabled
                      ? "Turn order sounds off"
                      : "Turn order sounds on"
                  }
                  title={soundEnabled ? "Order sounds on" : "Order sounds off"}
                  onClick={() => {
                    const next = !soundEnabled;
                    window.localStorage.setItem(
                      "smartdine-order-sound",
                      next ? "on" : "off",
                    );
                    setSoundEnabled(next);
                  }}
                >
                  {soundEnabled ? (
                    <Volume2 className="size-4" />
                  ) : (
                    <VolumeX className="size-4" />
                  )}
                </Button>
                <ThemeToggle />
              </header>
              <Outlet />
            </main>
            <nav className="fixed inset-x-0 bottom-0 z-50 flex justify-around border-t border-sidebar-border bg-sidebar px-1 py-2 md:hidden">
              {visibleNav.slice(0, 5).map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  className={({ isActive }) =>
                    cn(
                      "relative flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]",
                      isActive
                        ? "text-sidebar-primary"
                        : "text-muted-foreground",
                    )
                  }
                >
                  <Icon className="h-5 w-5" />
                  {getActionCount(to) > 0 && (
                    <span
                      aria-label={`${getActionCount(to)} action${getActionCount(to) === 1 ? "" : "s"} available`}
                      className="absolute right-1 top-0 inline-flex size-4 animate-pulse items-center justify-center rounded-full bg-destructive text-[9px] font-bold leading-none text-destructive-foreground"
                    >
                      {Math.min(getActionCount(to), 9)}
                    </span>
                  )}
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>
        </ManagerGuard>
      </Authenticated>
    </>
  );
}
