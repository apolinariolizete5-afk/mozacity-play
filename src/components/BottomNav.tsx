import { Link, useRouterState } from "@tanstack/react-router";
import { Compass, Gamepad2, Home, User, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { to: "/", label: "Início", icon: Home },
  { to: "/play", label: "Jogar", icon: Gamepad2 },
  { to: "/rooms", label: "Salas", icon: Users },
  { to: "/history", label: "Atividade", icon: Compass },
  { to: "/profile", label: "Perfil", icon: User },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const hidden = pathname.startsWith("/games/") || pathname.startsWith("/auth");
  if (hidden) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+10px)]">
      <div className="mx-auto max-w-md rounded-[1.6rem] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl">
        <ul className="flex items-center justify-between">
          {ITEMS.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <Link to={to} className="flex flex-col items-center gap-1 rounded-2xl px-1 py-2 text-[10px] font-extrabold">
                  <span className={cn("grid h-9 w-12 place-items-center rounded-xl transition-all", active ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" : "text-muted-foreground")}>
                    <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.7 : 2} />
                  </span>
                  <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
