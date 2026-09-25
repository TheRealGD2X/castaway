import { newBody, bodyStep, feel, MET, eat, drink } from "../src/sim/body.js";
function night(name, ctx, mins = 480, prep) {
  const B = newBody(); if (prep) prep(B); B.asleep = true; let min = 99, maxShiver = 0;
  for (let m = 0; m < mins && B.alive; m++) { bodyStep(B, ctx); min = Math.min(min, B.core); maxShiver = Math.max(maxShiver, B.shiver); }
  console.log(name.padEnd(46), "core end", B.core.toFixed(2), "min", min.toFixed(2), "shiver max", maxShiver.toFixed(2), "wet", B.wet.toFixed(2), B.alive ? "" : "DIED " + B.cause);
}
night("8C dry calm, open ground, no fire", { met: MET.sleep, airT: 8, wind: 1.5, rain: 0, sun: 0, fireW: 0, lying: true, bedding: 0 });
night("8C dry calm, open ground, fire 1.5m", { met: MET.sleep, airT: 8, wind: 1.5, rain: 0, sun: 0, fireW: 90, lying: true, bedding: 0 });
night("8C, lean-to, bracken bed, fire", { met: MET.sleep, airT: 8, wind: 5, rain: 0, sun: 0, rainBlock: 1, windBlock: .7, fireW: 80, lying: true, bedding: .8 });
night("8C rain+wind 8m/s, open, no fire (awake, sit)", { met: MET.sit, airT: 8, wind: 8, rain: 2, sun: 0, fireW: 0, lying: false }, 480);
night("3C clear night, open, no fire", { met: MET.sleep, airT: 3, wind: 2, rain: 0, sun: 0, fireW: 0, lying: true }, 600);
night("3C, hut, bed, blanket", { met: MET.sleep, airT: 3, wind: 6, rain: 0, sun: 0, rainBlock: 1, windBlock: .95, fireW: 0, lying: true, bedding: 1, blanket: 1.2 }, 600);
// a working day at 12C, no food or water: hunger and thirst
{ const B = newBody(); for (let d = 0; d < 5 && B.alive; d++) { for (let m = 0; m < 1440; m++) { B.asleep = m > 1320 || m < 360; bodyStep(B, { met: B.asleep ? MET.sleep : MET.gather, airT: 12, wind: 3, rain: 0, sun: 200, rainBlock: 1, windBlock: .7, fireW: B.asleep ? 80 : 0, lying: B.asleep, bedding: .8 }); } const f = feel(B); console.log(`day ${d + 1} no food/water: glyco ${B.glyco.toFixed(0)} fat ${B.fat.toFixed(2)}kg waterDef ${B.waterDef.toFixed(2)}L hunger ${f.hunger.toFixed(2)} thirst ${f.thirst.toFixed(2)} ${B.alive ? "" : "DIED " + B.cause}`); } }
