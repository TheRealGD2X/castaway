// The running world: generation + physical processes, one real minute per step, and save/load.
// Static things (terrain, where the trees stand) regenerate from the seed; only what changes is saved.
import { generate } from "../world/gen.js";
import { makeRng } from "../core/rng.js";
import { cal } from "../core/time.js";
import { envInit, envStep } from "./env.js";
import { ecoInit, ecoTen, ecoDay } from "./eco.js";
import { fireStep } from "./fire.js";
import { arrive, look, bodyContext } from "./man.js";
import { bodyStep } from "./body.js";
import { think } from "../mind/brain.js";
import { shoreInit, shoreDay } from "./shore.js";
import { waterInit, waterTen, healthStep, growthPerMin } from "./health.js";
import { fishInit, fishTen } from "./fish.js";
import { animalsInit, animalsStep, animalsDay, theDog } from "./animals.js";
import { shipsInit, shipsStep, shipsWatch } from "./ships.js";
import { thoughtsFrom, applyThoughts } from "./mindlink.js";
import { MW, MH, SP } from "../world/gen.js";

export function createWorld(seed, born, opt) {
  const W = generate(seed);
  W.born = born; W.t = 0;
  W.rng = makeRng(seed ^ 0x5eed);
  envInit(W); ecoInit(W); shoreInit(W); waterInit(W); fishInit(W);
  W.fires = []; W.structs = []; W.camp = null;
  // where the trees stand (shade, rain cover, slower walking) and a spatial index of everything rooted in place
  W.treeAt = new Uint8Array(MW * MH); W.grid = Array.from({ length: MW * MH }, () => []);
  for (const e of W.ents) { const i = Math.floor(e.y) * MW + Math.floor(e.x); W.grid[i].push(e); if (SP[e.k] && SP[e.k].kind === "tree") W.treeAt[i] = 1; }
  W.near = (cx, cy, r) => { const out = []; for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MH - 1, Math.ceil(cy + r)); y++) for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MW - 1, Math.ceil(cx + r)); x++) for (const e of W.grid[y * MW + x]) if ((e.x - cx) ** 2 + (e.y - cy) ** 2 <= r * r) out.push(e); return out; };
  animalsInit(W); shipsInit(W);
  W.thoughtQ = thoughtsFrom(opt && opt.thoughts, 0);
  if (!opt || opt.man !== false) arrive(W);
  return W;
}
export function step(W) {
  W.t++;
  envStep(W);
  if (W.t % 10 === 0) { ecoTen(W); waterTen(W); fishTen(W); }
  if (cal(W.born, W.t).mod === 360) { ecoDay(W); shoreDay(W); animalsDay(W, cal(W.born, W.t).doy); }
  animalsStep(W); shipsStep(W); shipsWatch(W);
  for (const F of W.fires) fireStep(F, W.wx);
  // the woodpile: wood under its cover dries toward seasoned; uncovered it follows the weather
  if (W.t % 10 === 0) for (const s of W.structs) if (s.k === "woodpile" && s.kg > 0) { const target = (s.props?.dry || 0) > .5 ? .14 : W.litterWet; s.moist = (s.moist ?? .25) + (target - (s.moist ?? .25)) / 300; }
  const M = W.man;
  if (M && M.B.alive) {
    look(W);
    applyThoughts(W);
    think(W);
    healthStep(W, M);
    // food he's carrying: bacteria multiply with the warmth
    if (M.inv.raw > 0) M.rawLoad = (M.rawLoad || 0) * growthPerMin(W.wx.temp);
    if (M.inv.food > 0 && M.foodLoad) M.foodLoad *= growthPerMin(W.wx.temp);
    bodyStep(M.B, bodyContext(W, M, M.met));
    if (!M.B.alive) M.log.push([W.t, "died", M.B.cause]);
  }
}
const DYN = ["deadKg", "aut", "fall", "fruit", "n"];
export function save(W) {
  return JSON.stringify({ v: 2, seed: W.seed, born: W.born, t: W.t, rng: W.rng.save(), wx: W.wx, nextId: W.nextId,
    ents: W.ents.map(e => DYN.map(k => e[k] ?? null)), litter: Array.from(W.litter), litterWet: W.litterWet, items: W.items, fires: W.fires, structs: W.structs, camp: W.camp, shore: W.shore.map(b => b.kg), water: W.water, fish: W.fish, animals: W.animals, warrens: W.warrens, runs: W.runs || {}, events: W.events || [], ships: W.ships, nextShip: W.nextShip,
    man: W.man ? Object.assign({}, W.man, { known: Array.from(W.man.known).join("") }) : null });
}
export function load(s, thoughts) {
  const o = JSON.parse(s), W = createWorld(o.seed, o.born, { man: false });
  W.thoughtQ = thoughtsFrom(thoughts, o.t);
  W.t = o.t; W.rng.load(o.rng); W.wx = o.wx; W.nextId = o.nextId; W.litterWet = o.litterWet; W.items = o.items;
  o.ents.forEach((v, i) => DYN.forEach((k, j) => { if (v[j] != null) W.ents[i][k] = v[j]; }));
  W.litter = Float32Array.from(o.litter); W.fires = o.fires; W.structs = o.structs; W.camp = o.camp; o.shore.forEach((kg, i) => { W.shore[i].kg = kg; }); W.water = o.water; W.fish = o.fish; W.animals = o.animals; W.warrens = o.warrens; W.runs = o.runs; W.events = o.events; W.ships = o.ships; W.nextShip = o.nextShip;
  if (o.man) { W.man = Object.assign(o.man, { known: Uint8Array.from(o.man.known, c => +c) }); }
  return W;
}
