// @ts-ignore -- tipos do executor de testes do Bun
import { describe, expect, test } from "bun:test";
import { createMatch, emptyInput, gameMinute, step, HALF_L, MATCH_SECONDS } from "./sim";

const run = (m: ReturnType<typeof createMatch>, secs: number) => {
  for (let t = 0; t < secs; t += 1 / 60) step(m, emptyInput(), 1 / 60);
};

describe("futebol", () => {
  test("cada equipa tem 11 jogadores", () => {
    const m = createMatch();
    expect(m.players.filter((p) => p.team === 0).length).toBe(11);
    expect(m.players.filter((p) => p.team === 1).length).toBe(11);
  });

  test("a partida termina aos 3 minutos e mostra 90'", () => {
    const m = createMatch(() => 0.99);
    run(m, MATCH_SECONDS + 20);
    expect(m.phase).toBe("ended");
    expect(gameMinute(m.time)).toBe(90);
  });

  test("bola dentro da baliza adversária conta golo para a casa", () => {
    const m = createMatch();
    m.phase = "play";
    Object.assign(m.ball, { owner: null, x: HALF_L - 0.5, y: 0.5, z: 0, vx: 30, vy: 0, vz: 0 });
    for (const p of m.players) p.cooldown = 5;
    step(m, emptyInput(), 0.05);
    expect(m.score).toEqual([1, 0]);
  });

  test("bola ao lado da baliza não é golo", () => {
    const m = createMatch();
    m.phase = "play";
    Object.assign(m.ball, { owner: null, x: HALF_L - 0.5, y: 0.5, z: 8, vx: 30, vy: 0, vz: 0, lastTouch: 0 });
    for (const p of m.players) p.cooldown = 5;
    step(m, emptyInput(), 0.05);
    expect(m.score).toEqual([0, 0]);
    expect(m.restart?.kind).toBe("goalkick");
  });
});
