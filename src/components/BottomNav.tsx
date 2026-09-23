import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Gamepad2, Wallet, Users, User } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Início", icon: Home },
  { to: "/play", label: "Jogar", icon: Gamepad2 },
  { to: "/wallet", label: "Carteira", icon: Wallet },
  { to: "/rooms", label: "Salas", icon: Users },
  { to: "/profile", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hidden = pathname.startsWith("/games/") || pathname.startsWith("/auth");
  if (hidden) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2">
        {ITEMS.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 rounded-2xl text-[11px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-9 w-12 items-center justify-center rounded-2xl transition-all",
                    active && "bg-primary/15",
                  )}
                >
                  <Icon className="h-5 w-5" strokeWidth={active ? 2.6 : 2} />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
