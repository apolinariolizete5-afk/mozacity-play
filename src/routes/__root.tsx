import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { BottomNav } from "@/components/BottomNav";
import { subscribeToRealtimeNotifications } from "@/lib/push";
import { useApp } from "@/lib/store";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Esta página não existe ou foi movida.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight text-foreground">
          Esta página não carregou
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo falhou do nosso lado. Tenta atualizar ou voltar ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-2xl border border-input bg-background px-5 py-3 text-sm font-semibold text-foreground"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "MozaPlay — Joga. Desafia. Compete." },
      {
        name: "description",
        content: "Jogos multiplayer competitivos no telemóvel: Ludo, Damas e Xadrez.",
      },
      { name: "theme-color", content: "#12151d" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "MozaPlay" },
      { property: "og:title", content: "MozaPlay — Joga. Desafia. Compete." },
      {
        property: "og:description",
        content: "Jogos multiplayer competitivos no telemóvel: Ludo, Damas e Xadrez.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Sora:wght@600;700;800&family=Manrope:wght@400;500;600;700&display=swap",
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function AgeGate() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpen(window.localStorage.getItem("mozaplay:age-confirmed:v1") !== "1");
  }, []);
  if (!open) return null;
  const confirm = () => {
    window.localStorage.setItem("mozaplay:age-confirmed:v1", "1");
    setOpen(false);
  };
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/75 p-4 backdrop-blur-sm">
    <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-2xl">
      <p className="text-3xl">🔞</p><h2 className="mt-3 font-display text-2xl font-extrabold">18+ / Aviso de idade</h2>
      <p className="mt-3 text-sm text-muted-foreground">Confirma que tens 18 anos ou mais para continuar. Algumas funcionalidades podem exigir verificações adicionais de idade ou identidade.</p>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <a href="/responsible-play" className="rounded-2xl border border-input px-4 py-3 text-center text-sm font-bold">Jogo responsável</a>
        <button onClick={confirm} className="rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">Tenho 18+</button>
      </div>
    </div>
  </div>;
}

function LegalFooter() {
  return <footer className="border-t border-border px-4 py-6 text-center text-xs text-muted-foreground">
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2">
      <Link to="/terms">Termos e Condições</Link><Link to="/privacy">Privacidade</Link><Link to="/responsible-play">Jogo Responsável / 18+</Link>
    </div>
    <p className="mt-3">© {new Date().getFullYear()} MozaPlay</p>
  </footer>;
}

function InstallPrompt() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    if (standalone) return;

    const dismissedAt = Number(window.localStorage.getItem("mozaplay:install-dismissed:v1") || 0);
    if (dismissedAt && Date.now() - dismissedAt < 5 * 24 * 60 * 60 * 1000) return;

    const handler = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  if (!visible || !prompt) return null;

  const install = async () => {
    await prompt.prompt();
    await prompt.userChoice;
    setVisible(false);
    setPrompt(null);
  };

  const dismiss = () => {
    window.localStorage.setItem("mozaplay:install-dismissed:v1", String(Date.now()));
    setVisible(false);
  };

  return (
    <div className="fixed bottom-24 left-3 right-3 z-[70] mx-auto max-w-md rounded-2xl border border-border bg-card p-4 shadow-2xl">
      <p className="font-bold">Instalar MozaPlay</p>
      <p className="mt-1 text-xs text-muted-foreground">Adiciona o MozaPlay ao ecrã inicial para uma experiência de app.</p>
      <div className="mt-3 flex gap-2">
        <button onClick={() => void install()} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Instalar</button>
        <button onClick={dismiss} className="rounded-xl border border-input px-4 py-2.5 text-sm font-bold">Agora não</button>
      </div>
    </div>
  );
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const app = useApp();

  useEffect(() => {
    if (!app.profile.id) return;
    return subscribeToRealtimeNotifications(app.profile.id);
  }, [app.profile.id]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen pb-20">
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
      </div>
      <BottomNav />
      <AgeGate />
      <InstallPrompt />
    </QueryClientProvider>
  );
}
