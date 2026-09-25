// Tomas as a physical being in the world: where he is, what he carries, what his body feels, what he can see.
// His mind (mind/) chooses actions; this file carries them out physically, one minute at a time, and keeps his
// perception and memory up to date. Movement is continuous along a walked path at real walking speed.
import { newBody, bodyStep, MET } from "./body.js";
import { radiantAt } from "./fire.js";
import { MW, MH, T, idx, WATER } from "../world/gen.js";
import { findPath, SLOW } from "../mind/path.js";
import { shelterAt } from "../build/build.js";

export function arrive(W) {
  // he washes up on a sandy beach, the nearest to the middle of the island's southern shore
  let best = -1, bd = 1e9;
  for (let i = 0; i < MW * MH; i++) if (W.ter[i] === T.SAND && W.dsea[i] === 1) { const x = i % MW, y = (i / MW) | 0, d = Math.abs(x - W.cx) + Math.max(0, W.cy - y) * 2; if (d < bd) { bd = d; best = i; } }
  const B = newBody(); B.wet = 1; B.fatigue = .7; B.glyco = 700; B.waterDef = 1.4; B.core = 35.9;
  W.man = { x: best % MW + .5, y: ((best / MW) | 0) + .5, B, inv: {}, carry: 0, act: null, path: null, face: 1, known: new Uint8Array(MW * MH), mem: {}, skill: { drill: 0, knap: 0, build: 0, forage: 0 }, log: [], born: W.t, goal: null, why: "" };
  look(W);
}
export const here = M => idx(Math.floor(M.x), Math.floor(M.y));
// how far he can see: daylight, fog, and trees close in around him
export function sightRange(W, M) {
  const x = W.wx, day = x.elev > .05 ? 1 : x.elev > -.1 ? .6 : .32, fog = 1 - x.fog * .75;
  const inWood = W.ter[here(M)] === T.WOOD ? .65 : 1;
  return Math.max(2.5, 11 * day * fog * inWood);
}
// look around: remember the ground he sees, and the state of things on it (as he saw them, when he saw them)
export function look(W) {
  const M = W.man, r = sightRange(W, M), r2 = r * r, cx = M.x, cy = M.y;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MH - 1, Math.ceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MW - 1, Math.ceil(cx + r)); x++)
      if ((x + .5 - cx) ** 2 + (y + .5 - cy) ** 2 <= r2) M.known[y * MW + x] = 1;
  const seen = (k, o) => { M.mem[k] = Object.assign(M.mem[k] || {}, o, { t: W.t }); };
  for (const e of W.near(cx, cy, r)) {
    if (e.fruit != null) seen("e" + e.id, { k: e.k, x: e.x, y: e.y, fruit: e.fruit });
    else if (e.deadKg != null) seen("e" + e.id, { k: e.k, x: e.x, y: e.y, deadKg: e.deadKg });
    else if (e.k === "flint" || e.k === "fern" || e.k === "boulder" || e.k === "stones" || e.k === "reeds") seen("e" + e.id, { k: e.k, x: e.x, y: e.y, n: e.n ?? 1 });
  }
  for (const it of W.items) if ((it.x - cx) ** 2 + (it.y - cy) ** 2 <= r2) seen("i" + it.id, { k: it.k, x: it.x, y: it.y, kg: it.kg, moist: it.moist });
  for (const k in M.mem) if (k[0] === "i" && !W.items.some(it => "i" + it.id === k)) { const m = M.mem[k]; if ((m.x - cx) ** 2 + (m.y - cy) ** 2 <= r2) delete M.mem[k]; }   // gone (he sees it isn't there)
  // the shore: beds he can see when the tide has uncovered them (and how deep they lie, so when they'll show again)
  for (const b of W.shore) if ((b.x - cx) ** 2 + (b.y - cy) ** 2 <= r2 && W.wx.tide < -b.depth) seen("s" + b.id, { k: b.k, x: b.x, y: b.y, kg: b.kg, depth: b.depth, tile: b.tile });
  // animals: the dog (where it was, how it seemed), rabbits by their warren (so he knows where they run)
  for (const a of W.animals) {
    if ((a.x - cx) ** 2 + (a.y - cy) ** 2 > r2 || a.adrift || a.dead) continue;
    if (a.sp === "dog") seen("dog", { k: "dog", x: a.x, y: a.y, trust: a.trust, name: a.name, thin: a.E < .3 ? 1 : 0 });
    else if (a.sp === "rabbit" && !a.under) seen("warren" + a.home, { k: "warren", x: W.warrens[a.home].x, y: W.warrens[a.home].y, home: a.home });
  }
  for (const f of W.fires) if ((f.x - cx) ** 2 + (f.y - cy) ** 2 <= r2) seen("fire" + f.id, { k: "fire", x: f.x, y: f.y, lit: f.lit, embers: f.embers, fuelKg: (f.fuel.logs[1] < .35 ? f.fuel.logs[0] : 0) + (f.fuel.kindling[1] < .35 ? f.fuel.kindling[0] : 0), tinder: f.fuel.tinder[1] < .3 ? f.fuel.tinder[0] : 0 });   // damp tinder is no tinder
}
// the conditions his body is in this minute (shelter he stands in, the fire beside him, the weather)
export function bodyContext(W, M, met) {
  const x = W.wx, i = here(M), sh = shelterAt(W, M.x, M.y);
  // standing under a big tree keeps some rain off and some wind
  const underTree = W.treeAt && W.treeAt[i] ? .45 : 0;
  let fireW = 0;
  for (const f of W.fires) { const d = Math.hypot(f.x - M.x, f.y - M.y) * 2; if (d < 8) fireW += radiantAt(f, d); }
  fireW *= sh.fire * (1 + sh.reflect);
  // a dog asleep against him is a hot-water bottle (a dog's body gives off about 50 W; he gets some of it)
  if (M.B.asleep) for (const a of W.animals) if (a.sp === "dog" && a.curled) fireW += 22;                    // a debris hut shuts the fire out; a reflector wall throws it back in
  return { met, airT: x.temp, wind: x.wind, windBlock: 1 - (1 - underTree * .5) * (1 - sh.wind), rain: x.rain, rainBlock: 1 - (1 - underTree) * (1 - sh.rain), sun: x.sun, hum: x.hum, fireW, lying: M.B.asleep, bedding: sh.bed, sleepQ: 1 };
}
// walk along the path: real speed (about 1.2 m/s on firm grass), slower on rough ground, when tired or cold
export function walk(W, M, minutes = 1) {
  if (!M.path || M.path.length < 2) { M.path = null; return true; }
  const B = M.B, tired = 1 - B.fatigue * .35 - (B.core < 35.5 ? .3 : 0);
  let budget = 72 * minutes * tired * (M.carry > 12 ? .75 : 1);   // metres this minute
  while (budget > 0 && M.path.length > 1) {
    const a = M.path[0], b = M.path[1], bx = b % MW + .5, by = ((b / MW) | 0) + .5;
    const dx = bx - M.x, dy = by - M.y, dist = Math.hypot(dx, dy) * 2 * (SLOW[W.ter[b]] || 1);
    if (dist <= budget) { M.x = bx; M.y = by; budget -= dist; M.path.shift(); if (M.trail) M.trail.push([M.x, M.y]); }
    else { const f = budget / dist; M.x += dx * f; M.y += dy * f; budget = 0; }
    if (Math.abs(dx) > .01) M.face = dx > 0 ? 1 : -1;
  }
  if (M.trail) M.trail.push([M.x, M.y]);                      // the way he went this minute, for drawing him walking it
  if (M.path.length < 2) { M.path = null; return true; }
  return false;
}
export function goTo(W, M, targetTile, adjacent) {
  const p = findPath(W, here(M), targetTile, { adjacent });
  M.path = p; return !!p;
}
