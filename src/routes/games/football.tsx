import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, MoveUpRight, RotateCcw, Swords } from "lucide-react";
import { FootballPitch3D } from "@/components/FootballPitch3D";

export const Route = createFileRoute("/games/football")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Futebol 3D — MozaPlay" },
      { name: "description", content: "Protótipo de futebol com campo em perspectiva e controlos tácteis." },
    ],
  }),
  component: FootballPrototype,
});

type Point = { x: number; y: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function FootballPrototype() {
  const [player, setPlayer] = useState<Point>({ x: 50, y: 70 });
  const [ball, setBall] = useState<Point>({ x: 52, y: 67 });
  const [keeper, setKeeper] = useState<Point>({ x: 50, y: 8 });
  const shotTimer = useRef<number | null>(null);
  const [score, setScore] = useState({ home: 0, away: 0 });
  const [message, setMessage] = useState("Move o jogador e tenta marcar!");
  const [shot, setShot] = useState(false);
  const holdTimer = useRef<number | null>(null);

  const stopMove = useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  useEffect(() => () => {
    if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
  }, []);

  const move = useCallback((dx: number, dy: number) => {
    setPlayer((current) => {
      const next = { x: clamp(current.x + dx, 7, 93), y: clamp(current.y + dy, 7, 93) };
      setBall((currentBall) => {
        const distance = Math.hypot(currentBall.x - current.x, currentBall.y - current.y);
        return distance < 13 ? { x: next.x + 2, y: next.y - 3 } : currentBall;
      });
      setMessage("Jogador em movimento");
      return next;
    });
  }, []);

  const startMove = (dx: number, dy: number) => {
    stopMove();
    move(dx, dy);
    holdTimer.current = window.setInterval(() => move(dx, dy), 115);
  };

  const pass = () => {
    if (shotTimer.current !== null) window.clearInterval(shotTimer.current);
    const closeEnough = Math.hypot(ball.x - player.x, ball.y - player.y) < 22;
    if (!closeEnough) {
      setMessage("Aproxima-te da bola para fazer o passe.");
      return;
    }
    const target = { x: clamp(player.x + (player.x < 50 ? 17 : -17), 7, 93), y: clamp(player.y - 18, 7, 93) };
    const from = { ...ball };
    let step = 0;
    setMessage("Passe em movimento!");
    shotTimer.current = window.setInterval(() => {
      step += 1;
      const t = Math.min(step / 8, 1);
      setBall({ x: from.x + (target.x - from.x) * t, y: from.y + (target.y - from.y) * t });
      if (t >= 1 && shotTimer.current !== null) {
        window.clearInterval(shotTimer.current);
        shotTimer.current = null;
        setMessage("Passe recebido.");
      }
    }, 35);
    setShot(false);
  };

  const shoot = () => {
    const closeEnough = Math.hypot(ball.x - player.x, ball.y - player.y) < 22;
    if (!closeEnough) {
      setMessage("Aproxima-te da bola para rematar.");
      return;
    }
    if (shotTimer.current !== null) window.clearInterval(shotTimer.current);
    setShot(true);
    setMessage("Remate em direcção à baliza!");
    const from = { ...ball };
    const targetX = clamp(50 + (ball.x - player.x) * 1.25, 8, 92);
    let step = 0;
    let keeperX = keeper.x;
    shotTimer.current = window.setInterval(() => {
      step += 1;
      const t = Math.min(step / 12, 1);
      const curve = Math.sin(t * Math.PI) * (targetX - from.x) * 0.12;
      const nextX = from.x + (targetX - from.x) * t + curve;
      const nextY = from.y + (5 - from.y) * t;
      setBall({ x: clamp(nextX, 5, 95), y: nextY });
      keeperX = clamp(keeperX + (nextX - keeperX) * 0.24, 35, 65);
      setKeeper({ x: keeperX, y: 8 });
      if (t >= 1) {
        if (shotTimer.current !== null) window.clearInterval(shotTimer.current);
        shotTimer.current = null;
        const saved = Math.abs(targetX - keeperX) < 10;
        const goal = !saved && Math.abs(targetX - 50) < 24;
        if (goal) {
          setScore((current) => ({ ...current, home: current.home + 1 }));
          setMessage("GOLO! ⚽");
        } else if (saved) {
          setMessage("O guarda-redes defendeu o remate!");
        } else {
          setMessage("Remate para fora!");
        }
        window.setTimeout(() => {
          setBall({ x: 50, y: 51 });
          setPlayer({ x: 50, y: 70 });
          setKeeper({ x: 50, y: 8 });
          setShot(false);
        }, 650);
      }
    }, 35);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const directions: Record<string, [number, number]> = {
        arrowup: [0, -4], w: [0, -4],
        arrowdown: [0, 4], s: [0, 4],
        arrowleft: [-4, 0], a: [-4, 0],
        arrowright: [4, 0], d: [4, 0],
      };
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (directions[key]) {
        event.preventDefault();
        if (!event.repeat) move(directions[key][0], directions[key][1]);
      } else if (key === " " || key === "spacebar") {
        event.preventDefault();
        if (!event.repeat) pass();
      } else if (key === "enter") {
        event.preventDefault();
        if (!event.repeat) shoot();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, pass, shoot]);

  const reset = () => {
    if (holdTimer.current !== null) window.clearInterval(holdTimer.current);
    holdTimer.current = null;
    if (shotTimer.current !== null) window.clearInterval(shotTimer.current);
    shotTimer.current = null;
    setPlayer({ x: 50, y: 70 });
    setBall({ x: 52, y: 67 });
    setKeeper({ x: 50, y: 8 });
    setScore({ home: 0, away: 0 });
    setMessage("Partida reiniciada.");
    setShot(false);
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#07120e] text-white">
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-4">
        <div>
          <Link to="/" className="text-xs font-bold text-emerald-300">← MOZAPLAY</Link>
          <h1 className="mt-1 text-xl font-black tracking-tight sm:text-2xl">FUTEBOL <span className="text-emerald-400">3D</span></h1>
          <p className="text-xs text-emerald-100/60">Protótipo jogável · Fase 2</p>
        </div>
        <button onClick={reset} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold hover:bg-white/10">
          <RotateCcw className="h-4 w-4" /> Reiniciar
        </button>
      </header>

      <section className="mx-auto w-full max-w-6xl px-3 sm:px-5">
        <div className="relative overflow-hidden rounded-3xl border border-emerald-300/20 bg-gradient-to-b from-[#163e2b] to-[#071a12] p-3 shadow-2xl sm:p-5">
          <div className="mb-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-4 py-3">
            <div><p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-200/60">Casa</p><p className="text-2xl font-black tabular-nums">{score.home}</p></div>
            <div className="text-center"><p className="text-[10px] font-bold tracking-[.2em] text-white/50">AMIGÁVEL · DEMO</p><p className="mt-1 text-xs font-bold text-emerald-200">{message}</p></div>
            <div className="text-right"><p className="text-[10px] font-bold uppercase tracking-[.2em] text-emerald-200/60">Visitante</p><p className="text-2xl font-black tabular-nums">{score.away}</p></div>
          </div>

          <div className="relative mx-auto h-[360px] w-full max-w-3xl overflow-hidden rounded-2xl border border-white/20 bg-[#0b2b1d] shadow-inner sm:h-[490px]">
            <FootballPitch3D player={player} ball={ball} keeper={keeper} />
            {shot && <div className="absolute left-1/2 top-[9%] -translate-x-1/2 rounded-full bg-yellow-300 px-3 py-1 text-xs font-black text-green-950">REMATE!</div>}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-[#06130d]/50 to-transparent" />
            <div className="absolute bottom-3 left-3 rounded-lg bg-black/35 px-2 py-1 text-[10px] font-bold text-white/80">AMARELO: O TEU JOGADOR · AZUL/VERMELHO: EQUIPAS</div>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto] items-end gap-4">
            <div>
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.2em] text-emerald-200/60">Movimento</p>
              <div className="grid w-36 grid-cols-3 gap-1.5 sm:w-44">
                <span />
                <button aria-label="Mover para cima" onPointerDown={() => startMove(0, -4)} onPointerUp={stopMove} onPointerLeave={stopMove} onPointerCancel={stopMove} className="grid h-11 touch-none place-items-center rounded-xl border border-white/15 bg-white/10 active:bg-emerald-500"><ArrowUp /></button>
                <span />
                <button aria-label="Mover para esquerda" onPointerDown={() => startMove(-4, 0)} onPointerUp={stopMove} onPointerLeave={stopMove} onPointerCancel={stopMove} className="grid h-11 touch-none place-items-center rounded-xl border border-white/15 bg-white/10 active:bg-emerald-500"><ArrowLeft /></button>
                <button aria-label="Mover para baixo" onPointerDown={() => startMove(0, 4)} onPointerUp={stopMove} onPointerLeave={stopMove} onPointerCancel={stopMove} className="grid h-11 touch-none place-items-center rounded-xl border border-white/15 bg-white/10 active:bg-emerald-500"><ArrowDown /></button>
                <button aria-label="Mover para direita" onPointerDown={() => startMove(4, 0)} onPointerUp={stopMove} onPointerLeave={stopMove} onPointerCancel={stopMove} className="grid h-11 touch-none place-items-center rounded-xl border border-white/15 bg-white/10 active:bg-emerald-500"><ArrowRight /></button>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={pass} className="flex h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-2xl border border-white/15 bg-white/10 px-3 text-xs font-black active:scale-95"><MoveUpRight className="h-5 w-5" /> PASSE</button>
              <button onClick={shoot} className="flex h-14 min-w-16 flex-col items-center justify-center gap-1 rounded-2xl bg-emerald-400 px-3 text-xs font-black text-emerald-950 active:scale-95"><Swords className="h-5 w-5" /> REMATE</button>
            </div>
          </div>
        </div>
        <div className="mx-auto mt-4 max-w-3xl rounded-2xl border border-white/10 bg-white/5 p-4">
          <p className="text-sm font-bold">O que já podes testar</p>
          <p className="mt-1 text-xs leading-5 text-white/65">Campo em perspectiva, movimento contínuo ao manter os controlos pressionados, equipas, passe, remate e marcador. A finalização já não depende de um resultado totalmente aleatório. Esta versão continua local e experimental: ainda não tem modelos 3D completos, física realista de colisões ou adversário online.</p>
          <p className="mt-2 text-xs text-amber-200">Os passes e remates já percorrem uma trajectória animada, com reacção básica do guarda-redes. Próxima fase: colisões e sincronização online 1 contra 1.</p>
        </div>
      </section>
    </main>
  );
}
