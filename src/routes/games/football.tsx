import { createFileRoute, Link } from "@tanstack/react-router";
import { Canvas } from "@react-three/fiber";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { FootballScene } from "@/components/football/FootballScene";
import { createMatch, emptyInput, gameMinute, type Match } from "@/lib/football/sim";

export const Route = createFileRoute("/games/football")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Futebol 3D 11 contra 11 — MozaPlay" },
      { name: "description", content: "Joga futebol 3D 11 contra 11 contra o computador: passes, remates com potência, desarmes e guarda-redes." },
      { property: "og:title", content: "Futebol 3D 11 contra 11 — MozaPlay" },
      { property: "og:description", content: "Partidas de 3 minutos de futebol 3D contra o computador na MozaPlay." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FootballGame,
});

type Hud = { score: [number, number]; minute: number; message: string; hasBall: boolean; phase: Match["phase"]; shots: [number, number]; poss: number };

function readHud(m: Match): Hud {
  const owner = m.ball.owner !== null ? m.players[m.ball.owner] : null;
  const total = m.possession[0] + m.possession[1] || 1;
  return {
    score: [m.score[0], m.score[1]], minute: gameMinute(m.time),
    message: m.messageTimer > 0 ? m.message : "", hasBall: owner?.team === 0, phase: m.phase,
    shots: [m.shots[0], m.shots[1]], poss: Math.round((m.possession[0] / total) * 100),
  };
}

function FootballGame() {
  const match = useRef<Match>(createMatch());
  const input = useRef(emptyInput());
  const [started, setStarted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [hud, setHud] = useState<Hud>(() => readHud(match.current));
  const [power, setPower] = useState<number | null>(null);
  const shootStart = useRef<number | null>(null);
  const [gameKey, setGameKey] = useState(0);

  const onTick = useCallback((m: Match) => {
    const next = readHud(m);
    setHud((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, []);

  // Barra de potência enquanto o botão de remate está premido.
  useEffect(() => {
    if (power === null) return;
    const id = window.setInterval(() => {
      if (shootStart.current !== null) setPower(Math.min(1, (performance.now() - shootStart.current) / 900));
    }, 40);
    return () => window.clearInterval(id);
  }, [power === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const pressShoot = useCallback(() => {
    if (!hud.hasBall) { input.current.action = true; return; }
    shootStart.current = performance.now();
    setPower(0);
  }, [hud.hasBall]);
  const releaseShoot = useCallback(() => {
    if (shootStart.current === null) return;
    const p = Math.min(1, Math.max(0.2, (performance.now() - shootStart.current) / 900));
    shootStart.current = null;
    setPower(null);
    input.current.shoot = p;
  }, []);
  const pressPass = useCallback(() => {
    if (hud.hasBall) input.current.pass = true;
    else input.current.action = true;
  }, [hud.hasBall]);

  // Teclado: setas/WASD; A passe (ou esquerda sem bola); B remate; C sprint/desarme; P pausa.
  useEffect(() => {
    const keys = new Set<string>();
    const sync = () => {
      const i = input.current;
      i.mx = (keys.has("arrowright") || keys.has("d") ? 1 : 0) -
        (keys.has("arrowleft") || (keys.has("a") && !hud.hasBall) ? 1 : 0);
      i.mz = (keys.has("arrowdown") || keys.has("s") ? 1 : 0) -
        (keys.has("arrowup") || keys.has("w") ? 1 : 0);
      i.sprint = keys.has("shift") || keys.has("c");
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      if (e.repeat) return;
      if (k === "p" || k === "escape") { if (started) setIsPaused(v => !v); return; }
      if (k === "a" && hud.hasBall) { pressPass(); return; }
      if (k === "b") { pressShoot(); return; }
      if (k === "c" && !hud.hasBall) input.current.action = true;
      keys.add(k); sync();
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === "b") releaseShoot();
      keys.delete(k); sync();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [pressPass, pressShoot, releaseShoot, hud.hasBall, started]);

  const restart = () => {
    match.current = createMatch();
    input.current = emptyInput();
    setHud(readHud(match.current));
    setGameKey((k) => k + 1);
    setIsPaused(false);
    setStarted(true);
  };

  const paused = !started || isPaused;

  return (
    <main className="football-game touch-none select-none overflow-hidden bg-background text-foreground">
      <Canvas key={gameKey} resize={{ offsetSize: true }} shadows dpr={[1, 1.5]} camera={{ position: [0, 17, 24], fov: 50 }} frameloop={paused ? "demand" : "always"}>
        <FootballScene match={match} input={input} onTick={onTick} />
      </Canvas>

      {/* Marcador */}
      <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
        <div className="flex items-stretch overflow-hidden rounded-lg border border-border/40 bg-background/85 text-sm font-black shadow-lg backdrop-blur">
          <span className="flex items-center gap-2 bg-destructive px-3 py-1.5 text-destructive-foreground">VENTO AZUL</span>
          <span className="px-3 py-1.5 tabular-nums">{hud.score[0]} - {hud.score[1]}</span>
          <span className="flex items-center bg-primary px-3 py-1.5 text-primary-foreground">ROCHA DOURADA</span>
          <span className="px-3 py-1.5 tabular-nums text-muted-foreground">{hud.minute}'</span>
        </div>
      </div>
      <button type="button" onClick={() => setIsPaused(v => !v)} className="absolute right-3 top-2 z-20 grid h-9 w-9 place-items-center rounded-full border border-border/50 bg-background/85 text-lg font-black backdrop-blur" aria-label={isPaused ? "Continuar" : "Pausar"}>{isPaused ? "▶" : "Ⅱ"}</button>
      <Link to="/" className="absolute left-3 top-2 grid h-9 w-9 place-items-center rounded-full bg-background/80 backdrop-blur" aria-label="Voltar">
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {hud.message && (
        <div className="pointer-events-none absolute inset-x-0 top-1/3 flex justify-center">
          <p className={`rounded-xl bg-background/80 px-6 py-3 font-black tracking-wide backdrop-blur ${hud.message === "GOLO!" ? "text-5xl text-accent" : "text-xl"}`}>{hud.message}</p>
        </div>
      )}

      {started && hud.phase !== "ended" && (
        <>
          <Joystick onMove={(x, z) => { input.current.mx = x; input.current.mz = z; }} />
          <div className="absolute bottom-6 right-4 flex items-end gap-3">
            <HoldButton label="C · CORRER" className="h-14 w-14 bg-secondary text-secondary-foreground"
              onDown={() => { input.current.sprint = true; if (!hud.hasBall) input.current.action = true; }} onUp={() => { input.current.sprint = false; }} />
            <div className="flex flex-col items-center gap-3">
              <HoldButton label="B · REMATE" className="h-20 w-20 bg-destructive text-destructive-foreground"
                onDown={pressShoot} onUp={releaseShoot} />
              <HoldButton label="A · PASSE" className="h-16 w-16 bg-primary text-primary-foreground"
                onDown={pressPass} onUp={() => {}} />
            </div>
          </div>
          {power !== null && (
            <div className="pointer-events-none absolute bottom-32 right-28 h-3 w-36 overflow-hidden rounded-full bg-background/70">
              <div className="h-full bg-gradient-to-r from-accent to-destructive" style={{ width: `${power * 100}%` }} />
            </div>
          )}
        </>
      )}

      {!started && (
        <Overlay>
          <h1 className="text-3xl font-black">FUTEBOL <span className="text-primary">3D</span></h1>
          <p className="text-sm text-muted-foreground">11 contra 11 · 3 minutos · Partida grátis contra o computador</p>
          <ul className="space-y-1 text-left text-xs text-muted-foreground">
            <li><b className="text-foreground">Mover:</b> joystick à esquerda (ou setas / WASD)</li>
            <li><b className="text-foreground">Passe:</b> botão azul na direcção do joystick (A)</li>
            <li><b className="text-foreground">Remate:</b> segura o botão vermelho para mais força (B)</li>
            <li><b className="text-foreground">Sem bola:</b> azul troca de jogador, vermelho tenta desarmar</li>
            <li><b className="text-foreground">Sprint:</b> segura o botão SPRINT (C ou Shift)</li>
          </ul>
          <button onClick={() => setStarted(true)} className="w-full rounded-xl bg-primary py-3 font-black text-primary-foreground">COMEÇAR PARTIDA</button>
        </Overlay>
      )}

      {started && isPaused && hud.phase !== "ended" && (
        <Overlay>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Partida pausada</p>
          <h2 className="text-3xl font-black">PAUSA</h2>
          <p className="text-sm text-muted-foreground">O relógio e a partida estão parados.</p>
          <button onClick={() => setIsPaused(false)} className="w-full rounded-xl bg-primary py-3 font-black text-primary-foreground">CONTINUAR</button>
          <button onClick={restart} className="w-full rounded-xl border border-border py-3 font-bold">RECOMEÇAR PARTIDA</button>
        </Overlay>
      )}

      {hud.phase === "ended" && (
        <Overlay>
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Fim de jogo</p>
          <p className="text-5xl font-black tabular-nums">{hud.score[0]} - {hud.score[1]}</p>
          <p className="text-lg font-black">{hud.score[0] > hud.score[1] ? "Vitória!" : hud.score[0] < hud.score[1] ? "Derrota" : "Empate"}</p>
          <div className="grid w-full grid-cols-3 gap-2 text-center text-xs">
            <span className="tabular-nums">{hud.shots[0]}</span><span className="text-muted-foreground">Remates</span><span className="tabular-nums">{hud.shots[1]}</span>
            <span className="tabular-nums">{hud.poss}%</span><span className="text-muted-foreground">Posse</span><span className="tabular-nums">{100 - hud.poss}%</span>
          </div>
          <button onClick={restart} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 font-black text-primary-foreground"><RotateCcw className="h-4 w-4" /> JOGAR DE NOVO</button>
          <Link to="/" className="text-sm font-bold text-muted-foreground">Voltar ao início</Link>
        </Overlay>
      )}
    </main>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-background/60 p-4 backdrop-blur-sm">
      <div className="football-overlay-panel flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-border bg-card p-6 text-center shadow-2xl">{children}</div>
    </div>
  );
}

function HoldButton({ label, className, onDown, onUp }: { label: string; className: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      type="button"
      onPointerDown={(e) => { e.preventDefault(); (e.target as HTMLElement).setPointerCapture?.(e.pointerId); onDown(); }}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      className={`grid touch-none place-items-center rounded-full text-[11px] font-black shadow-xl ring-2 ring-background/40 active:scale-95 ${className}`}
    >
      {label}
    </button>
  );
}

// Joystick flutuante escrito de raiz, com ideias do html5-virtual-game-controller
// (Copyright (c) Austin Hallock, licença MIT): nasce onde o dedo toca na metade esquerda,
// segue um único dedo (multi-toque com os botões) e tem zona morta.
function Joystick({ onMove }: { onMove: (x: number, z: number) => void }) {
  const zone = useRef<HTMLDivElement>(null);
  const pid = useRef<number | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const R = 50;
  const DEAD = 0.12;
  const local = (e: React.PointerEvent) => {
    const r = zone.current!.getBoundingClientRect();
    const game = zone.current!.closest(".football-game");
    const rotated = game && getComputedStyle(game).getPropertyValue("--football-rotated").trim() === "1";
    // Em ecrã rodado, converter para coordenadas do palco.
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    return rotated ? { x: sy, y: r.width - sx } : { x: sx, y: sy };
  };
  const update = (e: React.PointerEvent, o: { x: number; y: number }) => {
    const p = local(e);
    let dx = p.x - o.x, dy = p.y - o.y;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    setKnob({ x: dx, y: dy });
    const n = Math.min(l, R) / R;
    if (n < DEAD) onMove(0, 0);
    else onMove(dx / R, dy / R);
  };
  const end = (e: React.PointerEvent) => {
    if (pid.current !== e.pointerId) return;
    pid.current = null; setOrigin(null); setKnob({ x: 0, y: 0 }); onMove(0, 0);
  };
  const o = origin ?? { x: 84, y: -1 };
  return (
    <div
      ref={zone}
      onPointerDown={(e) => {
        if (pid.current !== null) return;
        pid.current = e.pointerId;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        const p = local(e); setOrigin(p); update(e, p);
      }}
      onPointerMove={(e) => { if (pid.current === e.pointerId && origin) update(e, origin); }}
      onPointerUp={end}
      onPointerCancel={end}
      className="absolute bottom-0 left-0 h-3/5 w-1/2 touch-none"
    >
      <div
        className={`pointer-events-none absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-foreground/20 bg-background/30 backdrop-blur ${origin ? "" : "opacity-70"}`}
        style={origin ? { left: o.x, top: o.y } : { left: 84, bottom: -40 }}
      >
        <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-foreground/70 shadow-lg"
          style={{ transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))` }} />
      </div>
    </div>
  );
}
