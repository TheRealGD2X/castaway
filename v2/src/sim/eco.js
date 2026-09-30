// Living and dying wood, leaves and fruit, as physical processes.
//  * Every tree grows dead wood with age (kg/day by species and size). Some drops as sticks to the woodland floor
//    (litter kg per tile, which rots slowly); the rest hangs on as dead limbs until a gale snaps them off, and they
//    land nearby as branches (items with mass and moisture).
//  * Wood takes up rain and dries in sun and wind toward the air's equilibrium moisture (fraction of dry mass).
//  * Leaves turn as nights get cold and short, and fall with frost and gales; they come back when spring warms.
//  * Fruit swells in its season on each plant, then rots on the plant if nobody takes it.
import { liquidRain } from "./seasons.js";
import { dsin, dcos, clamp } from "../core/dmath.js";
import { hash3 } from "../core/rng.js";
import { SP, MW, MH, idx, T } from "../world/gen.js";
import { cal } from "../core/time.js";
import { growPlants, moveLeaves, moveFruit } from './biomass.js';

export const FRUIT = {                                  // season (day of year: start, peak, end), kcal at full crop
  bramble: { from: 212, peak: 245, to: 285, kcal: 900, what: "blackberries" },
  hazel: { from: 245, peak: 270, to: 305, kcal: 2400, what: "hazelnuts" },
  rowan: { from: 225, peak: 260, to: 320, kcal: 0, what: "rowan berries" },   // bitter raw; birds love them
};
const LEAF = { oak: 1, birch: 1, rowan: 1, hazel: 1 };

export function ecoInit(W) {
  W.litter = new Float64Array(MW * MH);                 // dry litter, kg per tile
  W.litterWet = .25;                                    // moisture of the woodland floor litter (fraction)
  const C = cal(W.born, 0);
  for (const e of W.ents) {
    const sp = SP[e.k];
    if (sp && sp.deadKgDay) { e.deadKg = +(sp.maxKg * e.size * (.3 + hash3(e.id, 1, W.seed) * .4)).toFixed(3); W.litter[idx(e.x | 0, e.y | 0)] += +(sp.maxKg * e.size * .3).toFixed(3); }
    if (e.k === "hazel" || e.k === "birch") e.shoots = 16 * e.size;
    if (LEAF[e.k]) { e.aut = C.doy > 250 ? clamp((C.doy - 250) / 55, 0, 1) : 0; e.fall = C.doy < 110 ? 1 : C.doy > 295 ? clamp((C.doy - 295) / 30, 0, 1) : 0; }
    const F = FRUIT[e.k]; if (F) e.fruit = fruitTarget(F, C.doy) * (.6 + hash3(e.id, 2, W.seed) * .4);
  }
  W.items = [];                                         // things lying on the ground: branches, later everything he drops
  // Non-woodland soil also starts with finite fallen vegetation, rather than free gatherable cover.
  for(let i=0;i<W.litter.length;i++)if(W.ter[i]>1&&W.ter[i]!==T.ROCK&&W.ter[i]!==T.LAKE&&W.ter[i]!==T.STREAM)W.litter[i]+=W.ter[i]===T.WOOD?1.6:.18;
}
function fruitTarget(F, doy) { return doy < F.from || doy > F.to ? 0 : doy < F.peak ? (doy - F.from) / (F.peak - F.from) : 1; }
const eqMoist = hum => .1 + hum * .12;                  // wood's equilibrium moisture in air of this humidity

// every 10 minutes: wetting, drying, gales
export function ecoTen(W) {
  const x = W.wx, dt = 10;
  if(W.bio)W.bio.solarJ+=Math.max(0,x.sun)*dt*60;
  const dry = (x.sun / 700 + x.wind / 18 + (1 - x.hum)) * .0009 * dt;
  const rain = liquidRain(W), wetUp = rain * .004 * dt;
  const moist = m => rain > 0 ? Math.min(.6, m + wetUp) : m > eqMoist(x.hum) ? Math.max(eqMoist(x.hum), m - dry) : m + (eqMoist(x.hum) - m) * .02;
  W.litterWet = moist(W.litterWet);
  for (const it of W.items) if (it.moist != null) it.moist = moist(it.moist);
  // a gale snaps dead limbs: the stronger the gust and the more dead wood aloft, the likelier
  if (x.gust > 14) for (const e of W.ents) {
    if (!e.deadKg || e.deadKg < .4) continue;
    const p = (x.gust - 14) / 14 * (e.deadKg / (SP[e.k].maxKg * e.size + .01)) * .003;
    if (W.rng.f() < p) {
      const kg = Math.min(e.deadKg, .6 + W.rng.f() * 1.8);
      e.deadKg -= kg;
      const a = W.rng.f() * 6.283, d = .6 + W.rng.f() * 1.2;
      addItem(W, { k: "branch", x: clamp(e.x + dcos(a) * d, 1, MW - 2), y: clamp(e.y + dsin(a) * d * .7 + .3, 1, MH - 2), kg, moist: .3, len: kg > 1.2 ? 2 : 1, from: e.id, t: W.t });
      W.log && W.log.push([W.t, "branch", e.id, kg]);
    }
  }
}
// once a day, at dawn: dead wood grows, sticks fall, litter rots, leaves turn and fall, fruit swells or rots
export function ecoDay(W) {
  const C = cal(W.born, W.t), x = W.wx, cold = x.temp < 8, frost = x.temp < 3;
  growPlants(W);
  for (const e of W.ents) {
    const sp = SP[e.k];
    const tile = idx(Math.floor(e.x), Math.floor(e.y)), trace = W.traces?.[tile];
    if (LEAF[e.k]) {
      const autumn = C.doy > 240 && C.doy < 360, spring = C.doy > 80 && C.doy < 170;
      if (autumn) { e.aut = clamp(e.aut + (cold ? .035 : .015) * (.7 + hash3(e.id, 3, W.seed) * .6), 0, 1); if (e.aut > .6) e.fall = clamp(e.fall + (frost ? .08 : .025) + (x.wind > 12 ? .05 : 0), 0, 1); }
      if (spring && x.temp > 7) { e.fall = clamp(e.fall - .05, 0, 1); if (e.fall < .3) e.aut = clamp(e.aut - .1, 0, 1); }
      moveLeaves(W,e);
    }
    const F = FRUIT[e.k];
    if (F) { const tg = fruitTarget(F, C.doy) * (.7 + hash3(e.id, 2, W.seed) * .3); moveFruit(W,e,tg>=e.fruit?Math.min(tg,e.fruit+.08*Math.max(0,Math.min(1,(x.temp-3)/8))):Math.max(tg,e.fruit-.06)); }
  }
}
export function addItem(W, it) {
  it.id = W.nextId++;
  W.items.push(it);
}
