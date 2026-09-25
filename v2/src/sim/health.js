// Health as biology, not dice.
//  * WATER: each source carries a load of gut pathogens (organisms per litre). Rain washes soil and droppings in
//    (runoff), warmth lets them persist, flow flushes a stream fast while a lake settles slowly and a marsh stays
//    foul. Drinking V litres ingests load x V; boiling kills them.
//  * FOOD: shellfish filter the water they live in and carry some of its load; caught fish and picked shellfish
//    grow bacteria at a rate set by temperature (doubling in about an hour in warm air, barely at all near 4 C).
//    Cooking kills them exponentially with the minutes on the fire.
//  * INFECTION: the chance a dose takes hold follows an exponential dose-response curve; the infection then
//    incubates, and once it breaks out it grows in him while his immune system fights it down. Rest, water and
//    food in him make the immune response stronger. While it's in him he loses fluid (diarrhoea), runs a fever,
//    loses appetite and tires.
//  * WOUNDS: a cut carries dirt; bacteria grow in it unless his body (or a wash with clean water) clears them;
//    it heals at a rate set by his condition, and hurts while it does.
// Randomness is only the seeded RNG deciding whether a given dose takes hold, as nature decides.
import { clamp, dexp } from "../core/dmath.js";

export const SRC = {                         // base load (org/L) in cool dry weather, runoff gain, flush time (h)
  stream: { base: .4, runoff: 9, flushH: 6 },
  lake: { base: 2.5, runoff: 6, flushH: 60 },
  marsh: { base: 30, runoff: 20, flushH: 120 },
  sea: { base: .3, runoff: 2, flushH: 24 },
};
const R_DOSE = .012;                          // dose-response: P(infection) = 1 - exp(-r * organisms)
export function waterInit(W) { W.water = { stream: SRC.stream.base, lake: SRC.lake.base, marsh: SRC.marsh.base, sea: SRC.sea.base }; }
// every 10 minutes: rain washes the ground in; flow and settling (and UV on sunny days) take it out again
export function waterTen(W) {
  const x = W.wx, warm = clamp((x.temp - 4) / 16, 0, 1.2);
  for (const k in SRC) {
    const s = SRC[k], target = s.base * (.6 + warm);
    let c = W.water[k] + x.rain * s.runoff * (10 / 60) * .1;
    c = target + (c - target) * dexp(-10 / (s.flushH * 60) * (1 + (x.sun || 0) / 800));
    W.water[k] = +c.toFixed(4);
  }
}
// bacteria multiply in picked food: per-minute growth factor at temperature T (degrees C)
export const growthPerMin = T => T < 4 ? 1 : 1 + Math.min(.012, (T - 4) * .0005);
// a dose of organisms reaches his gut: does it take hold?
export function expose(W, M, organisms, what) {
  if (organisms <= 0) return;
  (M.exposures || (M.exposures = [])).push([W.t, what, +organisms.toFixed(2)]);
  if (M.exposures.length > 40) M.exposures.shift();
  const p = 1 - dexp(-R_DOSE * organisms);
  if (W.rng.f() < p) {
    const B = M.B, incub = 12 * 60 + W.rng.f() * 36 * 60;
    if (!B.infection) B.infection = { at: W.t + Math.round(incub), load: 0, what, peak: 0 };
  }
}
// every minute: incubation, the fight between the infection and his immune system, wounds
export function healthStep(W, M) {
  const B = M.B, I = B.infection;
  // immune strength: better rested, watered and fed
  const imm = .9 * (1 - B.fatigue * .4) * (B.waterDef > 3 ? .6 : 1) * (B.glyco < 200 && B.fat < 3 ? .6 : 1) * (B.asleep ? 1.3 : 1);
  if (I) {
    if (W.t >= I.at) {
      if (I.load === 0) { I.load = .03; I.adapt = .3; M.log.push([W.t, "ill", I.what]); onIll(W, M); }
      // the germs multiply; his body learns to fight this one (adaptive immunity builds over a day or two)
      I.adapt = Math.min(3, I.adapt + .0008 * imm);
      I.load = clamp(I.load + I.load * (1 - I.load) * .006 - imm * I.adapt * .004 * I.load, 0, 1);
      I.peak = Math.max(I.peak, I.load);
      if (I.load < .01 && I.peak > .05) { B.infection = null; M.log.push([W.t, "recovered"]); }
    }
  }
  B.ill = I && W.t >= I.at ? I.load : 0;
  // wounds: dirt in the cut grows unless cleared; the cut knits at a rate set by his condition
  for (const h of B.hurt) {
    h.germ = clamp(h.germ + h.germ * (1 - h.germ) * .002 - imm * .0012 * h.germ, 0, 1);
    h.sev = Math.max(0, h.sev - .00035 * imm * (1 - h.germ));
    if (h.germ > .5 && !B.infection) B.infection = { at: W.t, load: 0, what: "wound", peak: 0 };
  }
  B.hurt = B.hurt.filter(h => h.sev > .01);
}
// working with sharp stone or heavy wood: the hazard of a cut depends on skill, tiredness and cold hands
export function hazard(W, M, rate, skill) {
  const B = M.B, h = rate * (1 - Math.min(.8, skill * .3)) * (1 + B.fatigue) * (B.core < 36 ? 1.5 : 1);
  if (W.rng.f() < h) { B.hurt.push({ k: "cut", sev: .3 + W.rng.f() * .4, germ: .05 + W.rng.f() * .1, t: W.t }); M.say = "Ah. Cut myself. Stupid."; M.log.push([W.t, "cut"]); return true; }
  return false;
}
// when he falls ill he thinks back over the last three days: what did he drink and eat? Each suspect gets more
// suspicious (what he believes, not what's true: he may blame the wrong thing)
function onIll(W, M) {
  const bel = M.belief || (M.belief = {});
  const sus = (M.exposures || []).filter(e => W.t - e[0] < 72 * 60 && W.t - e[0] > 6 * 60);
  const kinds = [...new Set(sus.map(e => e[1]))];
  for (const k of kinds) bel[k] = Math.min(1, (bel[k] ?? .15) + .6 / kinds.length);
  M.say = kinds.length ? `Sick as a dog. Was it the ${kinds.map(k => k.replace("water:", "") + (k.startsWith("water:") ? " water" : "")).join(" or the ")}?` : "Sick. Don't know why.";
}
export const pain = B => B.hurt.reduce((a, h) => a + h.sev, 0);
