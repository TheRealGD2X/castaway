// His body, as physiology. Every minute: energy is spent (basal metabolism x the activity's MET), drawn from food
// being digested, then glycogen, then fat; water is lost (breath, skin, sweat) and drunk; heat is made (metabolism,
// shivering) and lost to the air through his clothes (wind strips the still air, wet clothes insulate poorly and
// evaporate heat away, the ground draws heat from a body lying on it) or gained from a fire and the sun; his core
// temperature moves with the balance. Sleep pressure builds while awake and drains in sleep. Hunger, thirst,
// cold, tiredness and pain are signals read from this state; they are not meters that tick down.
import { clamp, dexp } from "../core/dmath.js";

export const MET = { sleep: .9, rest: 1.1, sit: 1.3, stand: 1.6, walk: 3.3, carry: 5, gather: 2.5, chop: 6, build: 4.5, craft: 2, dig: 5, swim: 7, run: 8 };
const BMR_W = 82;                                      // resting metabolism of a 75 kg man (about 1700 kcal/day)
const HEATCAP = 75 * 3470;                             // J/K
export function newBody() {
  return { gut: 400, glyco: 1400, fat: 12, waterDef: .4, core: 36.9, wet: 0, sleepP: .25, fatigue: 0, asleep: false, shiver: 0, sweat: 0, clo: .7, alive: true, cause: "", hurt: [], ill: 0, lastMeal: 0 };
}
// ctx: { met, airT, wind, rain, sun (W/m2 at ground), shelter: 0 open | 1 lean-to | 2 hut, fireW (radiant W reaching him),
//        lying: on the ground?, bedding: 0..1 (bracken, a bed), blanket: extra clo }
export function bodyStep(B, ctx) {
  if (!B.alive) return;
  const met = ctx.met ?? MET.rest;
  // ---- energy
  const shiverW = B.shiver * 260 * (B.glyco > 80 ? 1 : .4);
  const M = BMR_W * met + shiverW;                           // W of metabolic heat
  let kcal = M * 60 / 4184;                                   // kcal this minute
  const absorb = Math.min(B.gut, 2.2); B.gut -= absorb; B.glyco = Math.min(2000, B.glyco + absorb);
  const fromFat = B.glyco < 400 ? kcal * clamp(.9 - B.glyco / 500, .3, .9) : kcal * .15;
  B.fat = Math.max(0, B.fat - fromFat / 7700); B.glyco = Math.max(0, B.glyco - (kcal - fromFat));
  // ---- heat
  const wind = ctx.wind * (ctx.shelter === 2 ? .05 : ctx.shelter === 1 ? .3 : 1) * (ctx.lying ? .7 : 1);
  const rain = ctx.shelter ? 0 : ctx.rain;
  B.wet = clamp(B.wet + rain * .015 - (B.wet > 0 ? (.0006 + ctx.fireW / 180000 + ctx.sun / 900000) * (1 + wind / 6) : 0) - (M > 250 ? 0 : 0), 0, 1);
  // skin temperature: vessels close in the cold (skin cools, holding heat in) and open when he's warm (skin flushes)
  const cold = Math.max(0, 33 - ctx.airT), Ts = Math.min(36, 33 - Math.min(5.5, cold * .22) - Math.max(0, 36.9 - B.core) * .8 + Math.max(0, B.core - 36.95) * 9);
  const Rcl = (B.clo + (ctx.blanket || 0)) * .155 * (1 - .65 * B.wet);
  const hc = 3.1 + 4.3 * Math.sqrt(Math.max(0, wind)), Rair = 1 / (hc + 4.6);
  const A = ctx.lying ? 1.35 : 1.8;                          // curled on the ground less skin faces the air
  let loss = A * (Ts - ctx.airT) / (Rcl + Rair);
  loss += B.wet * 38 * (1 + wind / 6) * (ctx.airT < 20 ? 1 : .5);          // evaporation from wet clothes
  if (ctx.lying) loss += .45 * (Ts - (ctx.airT + 1.5)) * 4 * (1 - (ctx.bedding || 0) * .85);   // the ground draws heat
  loss += 10 + (met > 3 ? met * 4 : 0);                                     // breath
  const gain = (ctx.fireW || 0) + (ctx.shelter === 2 ? 0 : (ctx.sun || 0) * .3);
  // thermoregulation: sweat when hot, shiver when cold (less when exhausted or out of fuel)
  const sweatW = B.core > 37.4 ? Math.min(450, (B.core - 37.4) * 700) : 0;
  const Q = M + gain - loss - sweatW;
  B.core += Q * 60 / HEATCAP;
  B.shiver = clamp((36.7 - B.core) * 1.6 + (B.core < 36.7 && Ts < 30 ? .1 : 0), 0, 1) * (B.fatigue > .9 ? .5 : 1) * (B.core < 32 ? .2 : 1);
  B.sweat = sweatW;
  // ---- water (litres of deficit): breath and skin always, sweat, the kidneys; drinking is done by actions
  const urine = .00052 * clamp(1 - B.waterDef / 4, .25, 1);                 // kidneys save water as he dries out
  B.waterDef += .00052 + urine + sweatW / 2.43e6 * 60 + (met > 2 ? .00006 * met : 0);
  // ---- sleep and fatigue
  if (B.asleep) B.sleepP = Math.max(0, B.sleepP - B.sleepP / 150 * (ctx.sleepQ ?? 1));
  else B.sleepP = Math.min(1, B.sleepP + (1 - B.sleepP) / 1000);
  B.fatigue = clamp(B.fatigue + (met > 3 ? (met - 3) * .0012 : -(.002 + (B.asleep ? .002 : 0))), 0, 1);
  // ---- death: the body gives out
  if (B.core < 28) { B.alive = false; B.cause = "cold"; }
  else if (B.waterDef > 9) { B.alive = false; B.cause = "thirst"; }
  else if (B.fat <= .5 && B.glyco <= 0) { B.alive = false; B.cause = "starvation"; }
}
// the signals his mind reads
export function feel(B) {
  return {
    hunger: clamp(1 - B.glyco / 1500 + (B.gut < 50 ? .15 : 0), 0, 1),
    thirst: clamp(B.waterDef / 3, 0, 1),
    cold: clamp((36.8 - B.core) / 2 + B.shiver * .3, 0, 1),
    hot: clamp((B.core - 37.4) / 1.2, 0, 1),
    tired: clamp(B.sleepP, 0, 1),
    weary: B.fatigue,
    wet: B.wet,
  };
}
export function eat(B, kcal) { B.gut = Math.min(3000, B.gut + kcal); }
export function drink(B, litres) { B.waterDef = Math.max(-.5, B.waterDef - litres); }
