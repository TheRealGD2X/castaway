// Health is dose and biology: dirty water makes infection likely, clean water rarely; an infection runs a course
// (incubation, fever and fluid loss, recovery as immunity builds); cooking kills what grows in food.
import { createWorld } from "../src/sim/world.js";
import { expose, healthStep, waterTen, growthPerMin } from "../src/sim/health.js";
import { bodyStep, MET } from "../src/sim/body.js";
let ok = true; const check = (n, c) => { console.log((c ? "ok   " : "FAIL ") + n); ok = ok && c; };
const trial = (org) => { let n = 0; for (let s = 0; s < 200; s++) { const W = createWorld(1000 + s, Date.UTC(2026, 8, 25, 5, 0)); expose(W, W.man, org, "test"); if (W.man.B.infection) n++; } return n / 200; };
const lo = trial(.5), hi = trial(120);
check(`a clean drink rarely infects (${lo}), a foul one usually does (${hi})`, lo < .05 && hi > .6);
const W = createWorld(7, Date.UTC(2026, 8, 25, 5, 0)), M = W.man; M.B.infection = { at: W.t + 1, load: 0, what: "test", peak: 0 };
let peak = 0, onset = null, end = null;
for (let m = 0; m < 6 * 1440; m++) { W.t++; healthStep(W, M); bodyStep(M.B, { met: MET.rest, airT: 12, wind: 2, rain: 0, sun: 0, fireW: 0, lying: false }); M.B.waterDef = Math.max(0, M.B.waterDef - .003); if (M.B.ill > 0 && onset == null) onset = m; peak = Math.max(peak, M.B.ill); if (onset != null && !M.B.infection && end == null) end = m; }
check(`the illness peaks (${peak.toFixed(2)}) and he recovers after ${end == null ? "never" : ((end - onset) / 60).toFixed(0) + " h"}`, peak > .3 && end != null && end - onset < 5 * 1440);
W.wx.rain = 4; const c0 = W.water.stream; for (let k = 0; k < 18; k++) waterTen(W); check(`rain washes filth into the stream (${c0.toFixed(2)} -> ${W.water.stream.toFixed(2)})`, W.water.stream > c0 * 3);
W.wx.rain = 0; for (let k = 0; k < 6 * 24; k++) waterTen(W); check(`and it flushes clean again in a day (${W.water.stream.toFixed(2)})`, W.water.stream < c0 * 2);
check("food rots faster warm than cold", growthPerMin(25) > growthPerMin(8) && growthPerMin(3) === 1);
process.exit(ok ? 0 : 1);
