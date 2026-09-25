// Fire as combustion, calibrated to a real small campfire.
// Fuel is held by size class (tinder, kindling, logs): mass (kg), moisture (fraction of dry mass) and how much of it
// is alight (0..1). Each minute:
//  * alight fuel burns first-order with its class's time constant (tinder ~1 min, kindling ~10, logs ~60), slowed
//    by wetness and helped by air (wind);
//  * the heat of the fire (and glowing embers) sets unlit fuel alight at a rate by class (tinder catches at once,
//    logs need minutes of strong heat) and drives the water out of wet fuel, which costs heat;
//  * fuel that isn't getting enough heat smoulders out; rain damps the flames (not a banked fire under its ash);
//  * burning leaves embers, which glow for an hour or two in the open and many hours banked, and relight dry
//    fuel laid on them.
// Heat output (W) = burning mass x 18 MJ/kg, less what the water took. Radiant heat falls off with distance squared.
import { clamp, dexp } from "../core/dmath.js";

export const WOOD_J = 18e6;
const CLS = {
  tinder: { tau: 1.2, catchK: 1.5, sustain: 0 },
  kindling: { tau: 10, catchK: .35, sustain: 800 },
  logs: { tau: 70, catchK: .045, sustain: 2500 },
};
const ORDER = ["tinder", "kindling", "logs"];
export function newFire(x, y) { return { k: "fire", x, y, fuel: { tinder: [0, 0, 0], kindling: [0, 0, 0], logs: [0, 0, 0] }, embers: 0, heat: 0, lit: false, banked: false, burned: 0 }; }
export function addFuel(F, cls, kg, moist) {                 // [kg, moisture, alight fraction]
  const f = F.fuel[cls], tot = f[0] + kg;
  if (tot > 0) { f[1] = (f[0] * f[1] + kg * moist) / tot; f[2] = f[0] * f[2] / tot; }
  f[0] = tot; F.banked = false;
}
// a coal from a bow drill or hand drill laid in the tinder: it catches if the tinder is dry enough
export function ignite(F, quality) {
  const t = F.fuel.tinder; if (t[0] < .01) return false;
  if (quality * clamp(1 - t[1] / .42, 0, 1) > .3) { t[2] = Math.max(t[2], .4); F.lit = true; return true; }
  return false;
}
const dry = m => clamp(1 - m / .42, .04, 1);
export function fireStep(F, wx) {
  const air = F.banked ? .12 : clamp(.75 + wx.wind / (F.ring ? 28 : 14), .75, 1.5);   // a stone ring turns the wind
  const Henv = F.heat + F.embers * 2500;                        // W of heat bathing the fuel
  let J = 0, kgBurn = 0;
  for (const c of ORDER) {
    const f = F.fuel[c], C = CLS[c]; if (f[0] < 1e-5) { f[0] = 0; f[2] = 0; continue; }
    // fuel lying cold in the hearth soaks up rain, and slowly dries again in dry weather
    if (F.heat < 200 && !F.banked) f[1] = wx.rain > 0 ? Math.min(.6, f[1] + wx.rain * .0015 / (c === "logs" ? 3 : 1)) : f[1] > .15 ? f[1] - .00015 : f[1];
    // catching: unlit fuel takes light from the heat around it (tinder from embers or a coal)
    const heatK = c === "tinder" ? (F.embers > .03 ? 1 : 0) + Henv / 2000 : Henv / 8000;
    f[2] = clamp(f[2] + C.catchK * heatK * dry(f[1]) * (1 - f[2]), 0, 1);
    // without enough heat it smoulders out
    if (Henv < C.sustain && c !== "tinder") f[2] = Math.max(0, f[2] - .08 * (1 - Henv / C.sustain));
    if (wx.rain > 0 && !F.banked) f[2] = Math.max(0, f[2] - wx.rain * .012);
    // wet fuel steams: the heat drives its water off first
    if (f[1] > .1 && Henv > 300) { const dm = Math.min(f[1] - .1, .0012 * Henv / 1000 / Math.max(.2, f[0])); f[1] -= dm; J -= dm * f[0] * 2.3e6; }
    // burning
    const kg = f[0] * f[2] * (1 - dexp(-1 / C.tau)) * dry(f[1]) * air;
    f[0] -= kg; kgBurn += kg; J += kg * WOOD_J * (1 - f[1]);
    F.embers += kg * (c === "logs" ? .1 : c === "kindling" ? .04 : 0);
  }
  // embers glow down: slowly banked under ash, faster in wind and rain
  const tauE = (F.banked ? 600 : 100 / (1 + wx.wind / 12) / (1 + wx.rain * .6)) * (F.ring ? 1.4 : 1);   // and the hot stones hold the embers
  F.embers = F.embers * dexp(-1 / tauE);
  if (F.embers < 1e-4) F.embers = 0;
  F.heat = clamp(J / 60, 0, 80000);
  F.burned += kgBurn;
  F.lit = F.heat > 200;
}
// radiant heat (W) felt by a person d metres away on the side facing the fire
export function radiantAt(F, d) { const P = F.heat * .35 + F.embers * 1200; d = Math.max(.7, d); return Math.min(700, P / (12.57 * d * d)); }
export const fuelKg = F => F.fuel.tinder[0] + F.fuel.kindling[0] + F.fuel.logs[0];
