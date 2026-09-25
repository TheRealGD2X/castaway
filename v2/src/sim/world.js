// The running world: generation + physical processes, one real minute per step, and save/load.
// Static things (terrain, where the trees stand) regenerate from the seed; only what changes is saved.
import { generate } from "../world/gen.js";
import { makeRng } from "../core/rng.js";
import { cal } from "../core/time.js";
import { envInit, envStep } from "./env.js";
import { ecoInit, ecoTen, ecoDay } from "./eco.js";

export function createWorld(seed, born) {
  const W = generate(seed);
  W.born = born; W.t = 0;
  W.rng = makeRng(seed ^ 0x5eed);
  envInit(W); ecoInit(W);
  return W;
}
export function step(W) {
  W.t++;
  envStep(W);
  if (W.t % 10 === 0) ecoTen(W);
  if (cal(W.born, W.t).mod === 360) ecoDay(W);
}
const DYN = ["deadKg", "aut", "fall", "fruit"];
export function save(W) {
  return JSON.stringify({ v: 2, seed: W.seed, born: W.born, t: W.t, rng: W.rng.save(), wx: W.wx, nextId: W.nextId,
    ents: W.ents.map(e => DYN.map(k => e[k] ?? null)), litter: Array.from(W.litter, v => +v.toFixed(3)), litterWet: W.litterWet, items: W.items });
}
export function load(s) {
  const o = JSON.parse(s), W = createWorld(o.seed, o.born);
  W.t = o.t; W.rng.load(o.rng); W.wx = o.wx; W.nextId = o.nextId; W.litterWet = o.litterWet; W.items = o.items;
  o.ents.forEach((v, i) => DYN.forEach((k, j) => { if (v[j] != null) W.ents[i][k] = v[j]; }));
  W.litter = Float32Array.from(o.litter);
  return W;
}
