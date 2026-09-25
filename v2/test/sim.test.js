import { createWorld, step, save, load } from "../src/sim/world.js";
import { cal } from "../src/core/time.js";
const born = Date.UTC(2026, 8, 25, 5, 0), days = +(process.argv[2] || 60);
const t0 = Date.now(), W = createWorld(1404719350, born);
const st = { rainMin: 0, rainDays: new Set(), fogMin: 0, galeMin: 0, tmin: 99, tmax: -99, regs: {}, branches: 0 };
let mid = null;
for (let i = 0; i < days * 1440; i++) {
  step(W); const x = W.wx, d = Math.floor(W.t / 1440);
  if (x.rain > .1) { st.rainMin++; st.rainDays.add(d); } if (x.fog > .5) st.fogMin++; if (x.gust > 17) st.galeMin++;
  st.tmin = Math.min(st.tmin, x.temp); st.tmax = Math.max(st.tmax, x.temp); st.regs[x.reg] = (st.regs[x.reg] || 0) + 1;
  if (i === 20000) mid = save(W);
}
const ms = Date.now() - t0, end = save(W);
const W2 = load(mid); while (W2.t < W.t) step(W2);
const trees = W.ents.filter(e => e.deadKg != null), oak = W.ents.find(e => e.k === "oak"), br = W.ents.find(e => e.k === "bramble");
console.log(JSON.stringify({ days, msPerDay: +(ms / days).toFixed(1), usPerMin: +(ms * 1000 / days / 1440).toFixed(1),
  rainHoursPerDay: +(st.rainMin / 60 / days).toFixed(2), rainDays: st.rainDays.size, fogHours: +(st.fogMin / 60).toFixed(1), galeHours: +(st.galeMin / 60).toFixed(1),
  temp: [+st.tmin.toFixed(1), +st.tmax.toFixed(1)], regimes: Object.fromEntries(Object.entries(st.regs).map(([k, v]) => [k, Math.round(v / 60)])),
  branchesDown: W.items.length, deadAloftKg: +trees.reduce((a, e) => a + e.deadKg, 0).toFixed(0), litterKg: +W.litter.reduce((a, v) => a + v, 0).toFixed(0),
  oak: { aut: oak.aut, fall: oak.fall }, bramble: br && br.fruit, date: cal(born, W.t),
  deterministicFromCheckpoint: save(W2) === end }));
