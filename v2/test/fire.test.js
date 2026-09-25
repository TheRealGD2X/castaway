import { newFire, addFuel, ignite, fireStep, radiantAt, fuelKg } from "../src/sim/fire.js";
function run(name, wx, setup, mins = 600, bankAt = -1) {
  const F = newFire(0, 0); setup(F); const lit = ignite(F, .9); const log = [];
  let outAt = null, peak = 0;
  for (let m = 1; m <= mins; m++) { if (m === bankAt) F.banked = true; fireStep(F, wx); peak = Math.max(peak, F.heat); if (m % 30 === 0 || m === 5) log.push(`${m}m:${(F.heat / 1000).toFixed(1)}kW/${fuelKg(F).toFixed(2)}kg/e${F.embers.toFixed(3)}`); if (outAt == null && !F.lit && F.embers < .005) outAt = m; }
  console.log(name, "lit:", lit, "peak kW:", (peak / 1000).toFixed(1), "out at min:", outAt, "warmth at 1.5m (W):", radiantAt({ heat: peak, embers: 0 }, 1.5).toFixed(0)); console.log("  " + log.slice(0, 12).join("  "));
}
const calm = { wind: 2, rain: 0 }, rain = { wind: 6, rain: 3 };
run("dry camp fire", calm, F => { addFuel(F, "tinder", .08, .08); addFuel(F, "kindling", .6, .12); addFuel(F, "logs", 3, .15); });
run("wet wood", calm, F => { addFuel(F, "tinder", .08, .1); addFuel(F, "kindling", .6, .3); addFuel(F, "logs", 3, .45); });
run("damp tinder", calm, F => { addFuel(F, "tinder", .08, .3); addFuel(F, "kindling", .6, .12); });
run("in heavy rain", rain, F => { addFuel(F, "tinder", .08, .08); addFuel(F, "kindling", .6, .12); addFuel(F, "logs", 3, .15); });
run("banked for the night", calm, F => { addFuel(F, "tinder", .08, .08); addFuel(F, "kindling", .6, .12); addFuel(F, "logs", 3, .15); }, 720, 90);
