import { createWorld, step, save, load } from "../src/sim/world.js";
import { cal } from "../src/core/time.js";
import { feel } from "../src/sim/body.js";
const days = +(process.argv[2] || 3), seed = +(process.argv[3] || 1404719350), born = Date.UTC(2026, 8, 25, 5, 0);
const W = createWorld(seed, born), M = W.man; let last = "", t0 = Date.now(), mid = null;
const hhmm = t => { const c = cal(born, t); return `d${Math.floor(t / 1440) + 1} ${String(c.h).padStart(2, "0")}:${String(c.mi).padStart(2, "0")}`; };
for (let i = 0; i < days * 1440 && M.B.alive; i++) {
  step(W);
  const line = `${M.doing || "-"} | ${M.why || ""}`;
  if (line !== last) { const f = feel(M.B); console.log(`${hhmm(W.t)}  ${line.padEnd(90)} core ${M.B.core.toFixed(1)} wet ${M.B.wet.toFixed(2)} thirst ${f.thirst.toFixed(2)} hunger ${f.hunger.toFixed(2)} tired ${f.tired.toFixed(2)} ${W.wx.rain > 0 ? "RAIN" : ""}`); last = line; }
  if (i === 1500) mid = save(W);
}
console.log("alive", M.B.alive, M.B.cause, "fires", W.fires.map(f => `${f.lit ? "lit" : "out"} embers ${f.embers.toFixed(2)}`), "log", JSON.stringify(M.log.slice(-10)), "ms", Date.now() - t0);
if (mid) { const W2 = load(mid); while (W2.t < W.t && W2.man.B.alive) step(W2); console.log("deterministic from checkpoint:", save(W2) === save(W)); }
