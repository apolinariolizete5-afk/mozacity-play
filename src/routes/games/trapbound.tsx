import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Flag, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/games/trapbound")({
  head: () => ({
    meta: [
      { title: "TRAPBOUND — MozaPlay" },
      { name: "description", content: "Plataformas, saltos e armadilhas inesperadas. 20 níveis." },
    ],
  }),
  component: Trapbound,
});

type Hazard = { x: number; w: number; h: number; kind: "spikes" | "block" | "trigger" };
type Level = { name: string; hint: string; hazards: Hazard[]; platforms: { x: number; y: number; w: number }[] };

const LEVELS: Level[] = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const hazards: Hazard[] = [];
  const count = Math.min(2 + Math.floor(i * 0.72), 13);
  for (let j = 0; j < count; j++) {
    const x = 205 + j * (Math.min(570, 600) / Math.max(1, count));
    const kind: Hazard["kind"] = n >= 12 && j % 5 === 4 ? "trigger" : n >= 7 && j % 4 === 3 ? "block" : "spikes";
    hazards.push({ x, w: kind === "block" ? 34 : 30, h: kind === "block" ? 42 : 24, kind });
  }
  if (n >= 4) hazards.push({ x: 480, w: 38, h: 28, kind: "spikes" });
  if (n >= 9) hazards.push({ x: 680, w: 34, h: 24, kind: "trigger" });
  const platforms = n >= 3 ? [{ x: 330, y: 370, w: 115 }, ...(n >= 8 ? [{ x: 560, y: 325, w: 105 }] : [])] : [];
  return {
    name: ["Primeiros passos", "Aprende a saltar", "Piso elevado", "Não confies no chão", "Ritmo certo"][Math.min(i, 4)] + (n > 5 ? ` · Fase ${n}` : ""),
    hint: n < 4 ? "Salta por cima dos espinhos e chega à saída." : n < 10 ? "Observa o caminho. Nem todos os pisos são seguros." : "Armadilhas mais rápidas. Mede o salto antes de avançar.",
    hazards,
    platforms,
  };
});

function Trapbound() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keysRef = useRef({ left: false, right: false, jump: false });
  const gameRef = useRef({ level: 0, x: 70, y: 410, vx: 0, vy: 0, grounded: false, dead: false, won: false, time: 0, jumpWasDown: false });
  const [level, setLevel] = useState(0);
  const [deaths, setDeaths] = useState(0);
  const [won, setWon] = useState(false);
  const [paused, setPaused] = useState(false);

  const restart = (nextLevel = level) => {
    const g = gameRef.current;
    g.level = nextLevel; g.x = 70; g.y = 410; g.vx = 0; g.vy = 0;
    g.grounded = false; g.dead = false; g.won = false; g.time = 0; g.jumpWasDown = false;
    setLevel(nextLevel); setWon(false);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    let raf = 0;
    let previous = performance.now();
    const g = gameRef.current;
    const onKeyDown = (e: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "a", "d", "w"].includes(e.key)) e.preventDefault();
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keysRef.current.left = true;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keysRef.current.right = true;
      if (e.key === "ArrowUp" || e.key === " " || e.key.toLowerCase() === "w") keysRef.current.jump = true;
      if (e.key === "r" || e.key === "R") restart();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key.toLowerCase() === "a") keysRef.current.left = false;
      if (e.key === "ArrowRight" || e.key.toLowerCase() === "d") keysRef.current.right = false;
      if (e.key === "ArrowUp" || e.key === " " || e.key.toLowerCase() === "w") keysRef.current.jump = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    const draw = (now: number) => {
      const dt = Math.min((now - previous) / 1000, 0.032);
      previous = now;
      const input = keysRef.current;
      const current = LEVELS[g.level] ?? LEVELS[0];
      if (!paused && !g.dead && !g.won) {
        g.time += dt;
        g.vx = (input.left ? -250 : 0) + (input.right ? 250 : 0);
        if (input.jump && !g.jumpWasDown && g.grounded) { g.vy = -610; g.grounded = false; }
        g.jumpWasDown = input.jump;
        g.vy += 1550 * dt;
        g.x += g.vx * dt;
        g.y += g.vy * dt;
        g.x = Math.max(16, Math.min(920, g.x));
        g.grounded = false;
        const player = { x: g.x, y: g.y, w: 25, h: 34 };
        const solids = [{ x: 0, y: 470, w: 960, h: 70 }, ...current.platforms.map(p => ({ x: p.x, y: p.y, w: p.w, h: 12 }))];
        for (const s of solids) {
          if (player.x + player.w > s.x && player.x < s.x + s.w && player.y + player.h > s.y && player.y + player.h < s.y + s.h + 24 && g.vy >= 0) {
            g.y = s.y - player.h; g.vy = 0; g.grounded = true; player.y = g.y;
          }
        }
        for (const h of current.hazards) {
          const active = h.kind !== "trigger" || Math.sin(g.time * (1.4 + g.level * 0.08) + h.x) > -0.25;
          if (active && player.x + player.w > h.x && player.x < h.x + h.w && player.y + player.h > 470 - h.h && player.y < 470) {
            g.dead = true; setDeaths(v => v + 1); break;
          }
          if (h.kind === "block" && active && player.x + player.w > h.x && player.x < h.x + h.w && player.y + player.h > 470 - h.h) {
            g.dead = true; setDeaths(v => v + 1); break;
          }
        }
        if (g.y > 560) { g.dead = true; setDeaths(v => v + 1); }
        if (g.x > 855 && g.y + 34 >= 400) { g.won = true; setWon(true); }
      }

      const grad = ctx.createLinearGradient(0, 0, 960, 540);
      grad.addColorStop(0, "#11152c"); grad.addColorStop(1, "#202d4b");
      ctx.fillStyle = grad; ctx.fillRect(0, 0, 960, 540);
      ctx.fillStyle = "rgba(109, 240, 207, .08)";
      for (let x = 20; x < 960; x += 48) for (let y = 20; y < 540; y += 48) { ctx.beginPath(); ctx.arc(x, y, 1.5, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = "#2b3859"; ctx.fillRect(0, 470, 960, 70);
      ctx.fillStyle = "#6df0cf"; ctx.fillRect(0, 470, 960, 5);
      current.platforms.forEach(p => { ctx.fillStyle = "#3d5075"; ctx.fillRect(p.x, p.y, p.w, 12); ctx.fillStyle = "#6df0cf"; ctx.fillRect(p.x, p.y, p.w, 3); });
      current.hazards.forEach(h => {
        const active = h.kind !== "trigger" || Math.sin(g.time * (1.4 + g.level * 0.08) + h.x) > -0.25;
        if (!active) return;
        if (h.kind === "block") {
          ctx.fillStyle = "#ff5478"; ctx.fillRect(h.x, 470 - h.h, h.w, h.h);
          ctx.fillStyle = "#ff8da5"; ctx.fillRect(h.x, 470 - h.h, h.w, 4);
        } else {
          ctx.fillStyle = h.kind === "trigger" ? "#ffbd59" : "#ff5478";
          ctx.beginPath(); ctx.moveTo(h.x, 470); ctx.lineTo(h.x + h.w / 2, 470 - h.h); ctx.lineTo(h.x + h.w, 470); ctx.closePath(); ctx.fill();
        }
      });
      ctx.fillStyle = "#6df0cf"; ctx.fillRect(870, 405, 7, 65);
      ctx.strokeStyle = "#6df0cf"; ctx.lineWidth = 4; ctx.strokeRect(877, 405, 35, 65);
      ctx.fillStyle = "#e8fff9"; ctx.font = "bold 16px system-ui"; ctx.fillText("SAÍDA", 862, 392);
      // Player is drawn with a unique geometric silhouette, not copied game art.
      ctx.fillStyle = "#f7f8ff"; ctx.beginPath(); ctx.roundRect(g.x, g.y, 25, 34, 7); ctx.fill();
      ctx.fillStyle = "#6df0cf"; ctx.fillRect(g.x + 5, g.y + 8, 5, 5); ctx.fillRect(g.x + 15, g.y + 8, 5, 5);
      ctx.fillStyle = "#17213b"; ctx.fillRect(g.x + 7, g.y + 23, 11, 3);
      ctx.fillStyle = "rgba(9, 13, 29, .82)"; ctx.fillRect(20, 18, 270, 54);
      ctx.fillStyle = "#6df0cf"; ctx.font = "800 13px system-ui"; ctx.fillText("TRAPBOUND  /  MOZAPLAY", 34, 39);
      ctx.fillStyle = "#fff"; ctx.font = "bold 17px system-ui"; ctx.fillText(`NÍVEL ${g.level + 1} / 20`, 34, 59);
      if (g.dead || g.won || won) {
        ctx.fillStyle = "rgba(8, 11, 24, .76)"; ctx.fillRect(0, 0, 960, 540);
        ctx.textAlign = "center";
        ctx.fillStyle = g.won ? "#6df0cf" : "#ff718d";
        ctx.font = "900 46px system-ui"; ctx.fillText(g.won ? (g.level === 19 ? "JOGO CONCLUÍDO!" : "NÍVEL SUPERADO!") : "OPS! CAÍSTE.", 480, 235);
        ctx.fillStyle = "#fff"; ctx.font = "18px system-ui";
        ctx.fillText(g.won ? (g.level === 19 ? "Venceste os 20 níveis." : "Pronto para o próximo desafio?") : "As armadilhas não perdoam. Tenta outra vez.", 480, 273);
        ctx.textAlign = "start";
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [level, paused, won]);

  const hold = (key: "left" | "right" | "jump", value: boolean) => { keysRef.current[key] = value; };
  const nextLevel = () => { if (level < 19) restart(level + 1); else restart(0); };
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <header className="mb-4 flex items-center justify-between gap-3">
        <Link to="/" className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-bold"><ArrowLeft className="h-4 w-4" /> MozaPlay</Link>
        <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-widest text-primary">Novo jogo · 20 níveis</span>
      </header>
      <section className="overflow-hidden rounded-[1.8rem] border border-border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4 sm:p-6">
          <div><p className="text-[10px] font-extrabold uppercase tracking-[.22em] text-primary">Plataformas & armadilhas</p><h1 className="mt-1 font-display text-3xl font-black sm:text-4xl">TRAPBOUND</h1><p className="mt-1 text-sm text-muted-foreground">{LEVELS[level].name} — {LEVELS[level].hint}</p></div>
          <div className="flex items-center gap-3 text-xs font-bold text-muted-foreground"><span className="inline-flex items-center gap-1"><Flag className="h-4 w-4 text-primary" /> {level + 1}/20</span><span>Quedas: {deaths}</span></div>
        </div>
        <div className="bg-[#11152c] p-2 sm:p-4">
          <canvas ref={canvasRef} width={960} height={540} aria-label="Jogo TRAPBOUND: usa as setas para mover e saltar até à saída" className="block w-full rounded-xl border border-white/10" style={{ aspectRatio: "16 / 9", touchAction: "none" }} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <p className="text-xs text-muted-foreground">PC: ← → para mover · Espaço/↑ para saltar · R para reiniciar</p>
          <div className="flex gap-2">
            <button onClick={() => setPaused(v => !v)} className="rounded-xl border border-border px-3 py-2 text-xs font-extrabold">{paused ? "Continuar" : "Pausar"}</button>
            <button onClick={() => restart()} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs font-extrabold"><RotateCcw className="h-4 w-4" /> Reiniciar</button>
            {(won || gameRef.current.won) && <button onClick={nextLevel} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-extrabold text-primary-foreground">{level === 19 ? <Trophy className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />}{level === 19 ? "Jogar novamente" : "Próximo nível"}</button>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-border p-3 sm:hidden">
          <button onPointerDown={() => hold("left", true)} onPointerUp={() => hold("left", false)} onPointerCancel={() => hold("left", false)} className="rounded-2xl bg-secondary py-4 text-xl font-black active:bg-primary active:text-primary-foreground">←</button>
          <button onPointerDown={() => hold("jump", true)} onPointerUp={() => hold("jump", false)} onPointerCancel={() => hold("jump", false)} className="rounded-2xl bg-primary py-4 text-sm font-black text-primary-foreground active:scale-95">SALTAR</button>
          <button onPointerDown={() => hold("right", true)} onPointerUp={() => hold("right", false)} onPointerCancel={() => hold("right", false)} className="rounded-2xl bg-secondary py-4 text-xl font-black active:bg-primary active:text-primary-foreground">→</button>
        </div>
      </section>
      <p className="mt-3 text-center text-[11px] text-muted-foreground">Jogo experimental integrado no MozaPlay. O progresso desta versão reinicia quando a página é recarregada.</p>
    </main>
  );
}
