// Motor de futebol 11 contra 11 (simulação pura, sem React) — equipa 0 = jogador, equipa 1 = computador.
// Campo em metros: x = comprimento (-52.5..52.5), z = largura (-34..34). Equipa 0 ataca +x.

export const HALF_L = 52.5;
export const HALF_W = 34;
export const GOAL_HW = 3.66;
export const GOAL_H = 2.44;
export const BALL_R = 0.11;
export const MATCH_SECONDS = 180;
const G = 9.8;

export type Team = 0 | 1;
export type Role = "GK" | "DF" | "MF" | "FW";

export interface Player {
  id: number;
  team: Team;
  role: Role;
  num: number;
  homeX: number;
  homeZ: number;
  x: number;
  z: number;
  vx: number;
  vz: number;
  fx: number;
  fz: number;
  anim: number;
  cooldown: number;
}

export interface Ball {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  owner: number | null;
  lastTouch: Team;
  spin: number;
}

export interface Input {
  mx: number; mz: number;
  sprint: boolean;
  pass: boolean;
  shoot: number | null; // potência 0..1 quando o botão é largado
  action: boolean; // trocar jogador / desarme
}

export type Phase = "kickoff" | "play" | "goal" | "restart" | "ended";
type RestartKind = "throw" | "corner" | "goalkick";

export interface Match {
  players: Player[];
  ball: Ball;
  score: [number, number];
  time: number;
  phase: Phase;
  phaseTimer: number;
  message: string;
  messageTimer: number;
  controlled: number;
  kickoffTeam: Team;
  restart: { team: Team; kind: RestartKind; x: number; z: number } | null;
  aiTimer: number;
  dribbleX: number;
  dribbleZ: number;
  holdTimer: number;
  shots: [number, number];
  possession: [number, number];
  rand: () => number;
}

export const emptyInput = (): Input => ({ mx: 0, mz: 0, sprint: false, pass: false, shoot: null, action: false });

const FORMATION: [Role, number, number, number][] = [
  ["GK", 0.015, 0, 1],
  ["DF", 0.2, -0.62, 2], ["DF", 0.17, -0.2, 4], ["DF", 0.17, 0.2, 5], ["DF", 0.2, 0.62, 3],
  ["MF", 0.4, -0.66, 7], ["MF", 0.36, -0.2, 6], ["MF", 0.36, 0.2, 8], ["MF", 0.4, 0.66, 11],
  ["FW", 0.56, -0.18, 9], ["FW", 0.56, 0.18, 10],
];

export const side = (t: Team) => (t === 0 ? 1 : -1);
export const attackGoalX = (t: Team) => side(t) * HALF_L;
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const dist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

function P(m: Match, i: number): Player {
  return m.players[i]!;
}

export function createMatch(rand: () => number = Math.random): Match {
  const players: Player[] = [];
  for (const t of [0, 1] as Team[]) {
    for (const [role, xf, zf, num] of FORMATION) {
      const hx = side(t) * (-HALF_L + xf * 2 * HALF_L);
      const hz = zf * HALF_W * side(t);
      players.push({ id: players.length, team: t, role, num, homeX: hx, homeZ: hz, x: hx, z: hz, vx: 0, vz: 0, fx: side(t), fz: 0, anim: 0, cooldown: 0 });
    }
  }
  const m: Match = {
    players,
    ball: { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: 0, spin: 0 },
    score: [0, 0], time: 0, phase: "kickoff", phaseTimer: 0, message: "", messageTimer: 0,
    controlled: 9, kickoffTeam: 0, restart: null, aiTimer: 0, dribbleX: 0, dribbleZ: 0, holdTimer: 0,
    shots: [0, 0], possession: [0, 0], rand,
  };
  kickoff(m, 0);
  return m;
}

function say(m: Match, text: string, secs = 1.6) {
  m.message = text;
  m.messageTimer = secs;
}

export function kickoff(m: Match, team: Team) {
  m.kickoffTeam = team;
  for (const p of m.players) {
    let x = p.homeX * 0.9;
    let z = p.homeZ;
    // Cada equipa fica no seu meio-campo.
    x = side(p.team) > 0 ? Math.min(x, -1.5) : Math.max(x, 1.5);
    if (p.team !== team && Math.hypot(x, z) < 9.5) {
      const a = Math.atan2(z, x);
      x = Math.cos(a) * 9.5; z = Math.sin(a) * 9.5;
    }
    p.x = x; p.z = z; p.vx = 0; p.vz = 0; p.fx = side(p.team); p.fz = 0; p.cooldown = 0;
  }
  const fw = m.players.find((p) => p.team === team && p.role === "FW")!;
  fw.x = -side(team) * 0.5; fw.z = 0;
  const b = m.ball;
  Object.assign(b, { x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, owner: fw.id, lastTouch: team });
  m.controlled = team === 0 ? fw.id : m.players.find((p) => p.team === 0 && p.role === "FW")!.id;
  m.phase = "kickoff";
  m.phaseTimer = 1.4;
  m.aiTimer = 0.8;
}

function giveBall(m: Match, p: Player) {
  m.ball.owner = p.id;
  m.ball.lastTouch = p.team;
  m.ball.vx = m.ball.vy = m.ball.vz = 0;
  m.holdTimer = 0;
  if (p.team === 0) m.controlled = p.id;
}

function setRestart(m: Match, team: Team, kind: RestartKind, x: number, z: number, text: string) {
  m.phase = "restart";
  m.phaseTimer = 1.1;
  m.restart = { team, kind, x, z };
  m.ball.vx = m.ball.vy = m.ball.vz = 0;
  m.ball.owner = null;
  say(m, text);
}

function doRestart(m: Match) {
  const r = m.restart;
  if (!r) return;
  const candidates = m.players.filter((p) => p.team === r.team && (r.kind === "goalkick" ? p.role === "GK" : p.role !== "GK"));
  let taker = candidates[0]!;
  for (const p of candidates) if (dist(p.x, p.z, r.x, r.z) < dist(taker.x, taker.z, r.x, r.z)) taker = p;
  taker.x = r.x; taker.z = r.z; taker.vx = taker.vz = 0;
  const tx = -r.x * 0.3, tz = -r.z * 0.6;
  const l = Math.hypot(tx - r.x, tz - r.z) || 1;
  taker.fx = (tx - r.x) / l; taker.fz = (tz - r.z) / l;
  for (const p of m.players) {
    if (p.team === r.team) continue;
    const d = dist(p.x, p.z, r.x, r.z);
    if (d < 6) { const k = 6 / (d || 1); p.x = r.x + (p.x - r.x) * k; p.z = r.z + (p.z - r.z) * k; }
  }
  Object.assign(m.ball, { x: r.x + taker.fx * 0.6, z: r.z + taker.fz * 0.6, y: BALL_R });
  giveBall(m, taker);
  m.aiTimer = 0.7;
  m.restart = null;
  m.phase = "play";
}

/** Escolhe o colega para o passe na direcção pedida. */
export function choosePassTarget(m: Match, passer: Player, ax: number, az: number): Player | null {
  let l = Math.hypot(ax, az);
  if (l < 0.2) { ax = passer.fx; az = passer.fz; l = Math.hypot(ax, az) || 1; }
  ax /= l; az /= l;
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const p of m.players) {
    if (p.team !== passer.team || p.id === passer.id) continue;
    const dx = p.x - passer.x, dz = p.z - passer.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d > 55) continue;
    const cos = (dx * ax + dz * az) / d;
    if (cos < 0.35) continue;
    // Penaliza passes com adversários próximos da linha.
    let blocked = 0;
    for (const o of m.players) {
      if (o.team === passer.team) continue;
      const ox = o.x - passer.x, oz = o.z - passer.z;
      const t = clamp((ox * dx + oz * dz) / (d * d), 0, 1);
      if (dist(o.x, o.z, passer.x + dx * t, passer.z + dz * t) < 1.4) blocked += 1;
    }
    const score = cos * 2 - d / 30 - blocked * 0.8;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}

export function doPass(m: Match, passer: Player, target: Player) {
  const b = m.ball;
  const tx = target.x + target.vx * 0.55, tz = target.z + target.vz * 0.55;
  const dx = tx - b.x, dz = tz - b.z;
  const d = Math.hypot(dx, dz) || 1;
  let hs: number;
  if (d > 24) {
    b.vy = 6 + d * 0.06;
    const t = (2 * b.vy) / G;
    hs = (d / t) * 0.82;
  } else {
    b.vy = 0.4;
    hs = clamp(7 + d * 0.95, 9, 24);
  }
  b.vx = (dx / d) * hs; b.vz = (dz / d) * hs;
  b.owner = null; b.lastTouch = passer.team; b.spin = hs;
  passer.cooldown = 0.35;
  if (passer.team === 0) m.controlled = target.id;
}

export function doShoot(m: Match, p: Player, power: number, aimZ: number) {
  const b = m.ball;
  const gx = attackGoalX(p.team);
  const d = dist(b.x, b.z, gx, 0);
  power = clamp(power, 0.15, 1);
  const err = (m.rand() - 0.5) * (d / 11 + Math.max(0, power - 0.88) * 7);
  const tz = clamp(aimZ, -4.4, 4.4) + err;
  const dx = gx - b.x, dz = tz - b.z;
  const l = Math.hypot(dx, dz) || 1;
  const speed = 16 + power * 16;
  b.vx = (dx / l) * speed; b.vz = (dz / l) * speed;
  b.vy = 1.2 + power * 3.6 + d * 0.05 + (power > 0.92 ? 2.2 : 0);
  b.owner = null; b.lastTouch = p.team; b.spin = speed;
  p.cooldown = 0.4;
  m.shots[p.team] += 1;
  say(m, p.team === 0 ? "Remate!" : "Remate do adversário!", 0.9);
}

function nearestTo(m: Match, team: Team, x: number, z: number, exclude = -1, outfieldOnly = true) {
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of m.players) {
    if (p.team !== team || p.id === exclude || (outfieldOnly && p.role === "GK")) continue;
    const d = dist(p.x, p.z, x, z);
    if (d < bd) { bd = d; best = p; }
  }
  return { p: best!, d: bd };
}

function cpuThink(m: Match, owner: Player, dt: number) {
  const gx = attackGoalX(owner.team);
  if (owner.role === "GK") {
    m.holdTimer += dt;
    if (m.holdTimer > 1.1) {
      const options = m.players.filter((p) => p.team === owner.team && p.role !== "GK" && p.role !== "FW");
      const t = options[Math.floor(m.rand() * options.length)]!;
      doPass(m, owner, t);
    }
    m.dribbleX = 0; m.dribbleZ = 0;
    return;
  }
  const opp = nearestTo(m, owner.team === 0 ? 1 : 0, owner.x, owner.z, -1, false);
  m.aiTimer -= dt;
  if (m.aiTimer <= 0) {
    m.aiTimer = 0.3 + m.rand() * 0.35;
    const dGoal = dist(owner.x, owner.z, gx, 0);
    const r = m.rand();
    if (dGoal < 24 && r < 0.5) {
      doShoot(m, owner, 0.55 + m.rand() * 0.4, (m.rand() - 0.5) * 6.4);
      return;
    }
    if ((opp.d < 3 && r < 0.65) || r < 0.1) {
      const t = choosePassTarget(m, owner, side(owner.team), (m.rand() - 0.5) * 1.2);
      if (t) { doPass(m, owner, t); return; }
    }
  }
  let dx = gx - owner.x, dz = -owner.z * 0.6;
  const l = Math.hypot(dx, dz) || 1;
  dx /= l; dz /= l;
  if (opp.d < 4) {
    const k = ((4 - opp.d) / 4) * 0.9;
    dx += ((owner.x - opp.p.x) / (opp.d || 1)) * k;
    dz += ((owner.z - opp.p.z) / (opp.d || 1)) * k;
  }
  const l2 = Math.hypot(dx, dz) || 1;
  m.dribbleX = dx / l2; m.dribbleZ = dz / l2;
}

function moveBall(m: Match, dt: number) {
  const b = m.ball;
  b.vy -= G * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  if (b.y < BALL_R) {
    b.y = BALL_R;
    b.vy = b.vy < -1.2 ? -b.vy * 0.45 : 0;
  }
  const onGround = b.y <= BALL_R + 0.01;
  const k = Math.exp(-(onGround ? 0.85 : 0.08) * dt);
  b.vx *= k; b.vz *= k;
  b.spin = Math.hypot(b.vx, b.vz);
}

function checkBounds(m: Match) {
  const b = m.ball;
  if (Math.abs(b.x) > HALF_L + BALL_R) {
    const defending: Team = b.x > 0 ? 1 : 0;
    const attacker: Team = defending === 0 ? 1 : 0;
    const sx = Math.sign(b.x);
    if (Math.abs(b.z) < GOAL_HW && b.y < GOAL_H) {
      m.score[attacker] += 1;
      m.phase = "goal";
      m.phaseTimer = 3;
      m.kickoffTeam = defending;
      say(m, attacker === 0 ? "GOLO!" : "Golo do adversário", 3);
      return;
    }
    if (b.lastTouch === defending) {
      setRestart(m, attacker, "corner", sx * (HALF_L - 0.4), Math.sign(b.z || 1) * (HALF_W - 0.4), "Pontapé de canto");
    } else {
      setRestart(m, defending, "goalkick", sx * (HALF_L - 5.5), 0, "Pontapé de baliza");
    }
    return;
  }
  if (Math.abs(b.z) > HALF_W + BALL_R) {
    const team: Team = b.lastTouch === 0 ? 1 : 0;
    setRestart(m, team, "throw", clamp(b.x, -HALF_L + 1, HALF_L - 1), Math.sign(b.z) * (HALF_W - 0.3), "Lançamento lateral");
  }
}

function tryPickup(m: Match) {
  const b = m.ball;
  let best: Player | null = null;
  let bd = Infinity;
  for (const p of m.players) {
    if (p.cooldown > 0) continue;
    const inBox = p.role === "GK" && Math.abs(p.x - side(p.team) * -HALF_L) < 16.5 && Math.abs(p.z) < 20.2;
    const reach = inBox ? 1.7 : 0.85;
    const maxY = inBox ? 2.5 : 1.0;
    if (b.y > maxY) continue;
    const d = dist(p.x, p.z, b.x, b.z);
    if (d < reach && d < bd) { bd = d; best = p; }
  }
  if (!best) return;
  const speed = Math.hypot(b.vx, b.vz);
  if (best.role === "GK" && speed > 22 && m.rand() < 0.45) {
    // Defesa para a frente/lado em vez de agarrar.
    b.vx = -b.vx * 0.25; b.vz = (m.rand() - 0.5) * 14; b.vy = 3;
    b.lastTouch = best.team;
    best.cooldown = 0.6;
    say(m, "Grande defesa!", 1.2);
    return;
  }
  if (best.role === "GK" && speed > 14) say(m, "Defendeu!", 1);
  giveBall(m, best);
}

export function step(m: Match, input: Input, rawDt: number) {
  const dt = Math.min(rawDt, 0.05);
  if (m.messageTimer > 0) m.messageTimer -= dt;
  const consume = () => { input.pass = false; input.shoot = null; input.action = false; };
  if (m.phase === "ended") { consume(); return; }

  if (m.phase !== "play") {
    m.phaseTimer -= dt;
    if (m.phase === "goal") {
      moveBall(m, dt);
      const b = m.ball;
      if (Math.abs(b.x) > HALF_L + 1.8) { b.x = Math.sign(b.x) * (HALF_L + 1.8); b.vx = 0; }
      b.z = clamp(b.z, -GOAL_HW + 0.2, GOAL_HW - 0.2);
      for (const p of m.players) { p.vx *= 0.9; p.vz *= 0.9; }
    }
    if (m.phaseTimer <= 0) {
      if (m.phase === "goal") kickoff(m, m.kickoffTeam);
      else if (m.phase === "restart") doRestart(m);
      else m.phase = "play";
    }
    consume();
    return;
  }

  m.time += dt;
  if (m.time >= MATCH_SECONDS) {
    m.time = MATCH_SECONDS;
    m.phase = "ended";
    say(m, "Fim de jogo", 99);
    consume();
    return;
  }

  const b = m.ball;
  for (const p of m.players) if (p.cooldown > 0) p.cooldown -= dt;
  let owner = b.owner !== null ? P(m, b.owner) : null;
  if (owner) m.possession[owner.team] += dt;

  // Controlo do jogador humano: troca e desarme.
  if (owner && owner.team === 0) m.controlled = owner.id;
  else {
    const ctrl = P(m, m.controlled);
    if (input.action) {
      if (owner && owner.team === 1 && dist(ctrl.x, ctrl.z, owner.x, owner.z) < 2) {
        if (m.rand() < 0.62) {
          owner.cooldown = 0.8;
          giveBall(m, ctrl);
          say(m, "Desarme!", 0.9);
          owner = ctrl;
        } else {
          ctrl.cooldown = 0.6;
        }
      } else {
        m.controlled = nearestTo(m, 0, b.x, b.z, m.controlled).p.id;
      }
    } else {
      const n = nearestTo(m, 0, b.x, b.z);
      const cd = dist(ctrl.x, ctrl.z, b.x, b.z);
      if (cd - n.d > 9) m.controlled = n.p.id;
    }
  }

  if (owner && owner.team === 1) cpuThink(m, owner, dt);
  owner = b.owner !== null ? P(m, b.owner) : null;

  const possTeam = owner ? owner.team : null;
  const predX = b.x + b.vx * 0.35, predZ = b.z + b.vz * 0.35;
  const chaser: [number, number] = [-1, -1];
  for (const t of [0, 1] as Team[]) {
    if (possTeam === t) continue;
    chaser[t] = nearestTo(m, t, predX, predZ, t === 0 ? m.controlled : -1).p.id;
  }

  for (const p of m.players) {
    let dvx = 0, dvz = 0;
    if (p.id === m.controlled) {
      let ix = input.mx, iz = input.mz;
      const l = Math.hypot(ix, iz);
      if (l > 1) { ix /= l; iz /= l; }
      const sp = (input.sprint ? 8.6 : 6.6) * (owner === p ? 0.92 : 1);
      dvx = ix * sp; dvz = iz * sp;
    } else {
      let tx: number, tz: number, sp = 6.4;
      const s = side(p.team);
      if (owner === p) {
        tx = p.x + m.dribbleX * 5; tz = p.z + m.dribbleZ * 5; sp = 6.6;
      } else if (p.role === "GK") {
        const goalX = -s * HALF_L;
        tx = goalX + s * 1.2;
        tz = clamp(b.z * 0.18, -2.8, 2.8);
        const towards = (b.vx * -s) > 8 && b.owner === null;
        if (towards) {
          const t = (goalX - b.x) / (b.vx || 1);
          if (t > 0 && t < 2) { tz = clamp(b.z + b.vz * t, -GOAL_HW - 0.4, GOAL_HW + 0.4); sp = 8.5; }
        } else if (b.owner === null && Math.abs(b.x - goalX) < 14 && Math.abs(b.z) < 18) {
          tx = b.x; tz = b.z; sp = 7.5; // sai para apanhar a bola solta
        }
      } else if (chaser[p.team] === p.id && (p.team === 1 || dist(p.x, p.z, b.x, b.z) < 7)) {
        tx = predX; tz = predZ; sp = p.team === 1 ? 7.6 : 7.2;
      } else {
        const attacking = possTeam === p.team;
        const push = attacking ? 10 : -2;
        tx = clamp(p.homeX + b.x * 0.5 + s * push, -HALF_L + 3, HALF_L - 3);
        tz = clamp(p.homeZ * 0.85 + b.z * 0.25, -HALF_W + 2, HALF_W - 2);
        if (p.role === "FW" && attacking) tx = clamp(tx + s * 6, -HALF_L + 8, HALF_L - 8);
        if (p.role === "DF" && !attacking) tx = s > 0 ? Math.min(tx, b.x - 2) : Math.max(tx, b.x + 2);
      }
      const dx = tx - p.x, dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const want = d < 0.6 ? 0 : Math.min(sp, d * 2.2);
      if (d > 0.01) { dvx = (dx / d) * want; dvz = (dz / d) * want; }
    }
    const k = 1 - Math.exp(-7 * dt);
    p.vx += (dvx - p.vx) * k;
    p.vz += (dvz - p.vz) * k;
    p.x = clamp(p.x + p.vx * dt, -HALF_L - 2, HALF_L + 2);
    p.z = clamp(p.z + p.vz * dt, -HALF_W - 2, HALF_W + 2);
    const sp2 = Math.hypot(p.vx, p.vz);
    if (sp2 > 0.4) {
      const fk = 1 - Math.exp(-10 * dt);
      p.fx += (p.vx / sp2 - p.fx) * fk; p.fz += (p.vz / sp2 - p.fz) * fk;
      const fl = Math.hypot(p.fx, p.fz) || 1;
      p.fx /= fl; p.fz /= fl;
    }
    p.anim += sp2 * dt * 1.7;
  }

  // Separação simples entre jogadores.
  for (let i = 0; i < m.players.length; i++) {
    for (let j = i + 1; j < m.players.length; j++) {
      const a = P(m, i), c = P(m, j);
      const dx = c.x - a.x, dz = c.z - a.z;
      const d = Math.hypot(dx, dz);
      if (d > 0 && d < 0.85) {
        const push = (0.85 - d) / 2;
        a.x -= (dx / d) * push; a.z -= (dz / d) * push;
        c.x += (dx / d) * push; c.z += (dz / d) * push;
      }
    }
  }

  if (owner) {
    if (owner.team === 0) {
      if (input.shoot !== null) doShoot(m, owner, input.shoot, input.mz * 3.6);
      else if (input.pass) {
        const t = choosePassTarget(m, owner, input.mx, input.mz);
        if (t) doPass(m, owner, t);
      }
    }
    if (b.owner === owner.id) {
      b.x = owner.x + owner.fx * 0.62;
      b.z = owner.z + owner.fz * 0.62;
      b.y = BALL_R;
      b.vx = owner.vx; b.vz = owner.vz; b.vy = 0;
      b.spin = Math.hypot(owner.vx, owner.vz);
      // Desarmes automáticos dos defesas.
      for (const p of m.players) {
        if (p.team === owner.team || p.role === "GK" || p.id === m.controlled || p.cooldown > 0) continue;
        if (dist(p.x, p.z, owner.x, owner.z) < 1.1 && m.rand() < (p.team === 1 ? 1.5 : 0.7) * dt) {
          owner.cooldown = 0.8;
          b.owner = null;
          b.vx = (b.x - p.x) * 6 + p.fx * 3; b.vz = (b.z - p.z) * 6 + p.fz * 3; b.vy = 0.5;
          b.lastTouch = p.team;
          break;
        }
      }
    }
  }
  if (b.owner === null) {
    moveBall(m, dt);
    tryPickup(m);
    if (b.owner === null) checkBounds(m);
  }
  consume();
}

/** Minuto exibido no marcador (3 minutos reais = 90 minutos de jogo). */
export const gameMinute = (time: number) => Math.min(90, Math.floor((time / MATCH_SECONDS) * 90));
