// v2 preview: the island and Tomas, simulated in real time (UK clock). ?ff=<minutes> fast-forwards (testing only).
import { createWorld, step } from "./sim/world.js";
import { paintTerrain } from "./render/terrain.js";
import { createView } from "./render/view.js";
import { cal } from "./core/time.js";

const qs = new URLSearchParams(location.search), seed = +(qs.get("seed") || 1404719350);
// the island was born this morning (preview): catch up to now, then one step per real minute
const BORN = Date.UTC(2026, 8, 25, 5, 0), world = createWorld(seed, BORN);
const due = () => Math.floor((Date.now() - BORN) / 60000);
for (let n = qs.get("t") ? +qs.get("t") : due() + (+qs.get("ff") || 0); world.t < n;) step(world);
function seasonOf(doy) {                                  // leaf colour and leaf fall by the real calendar
  const autumn = doy < 250 ? 0 : doy < 300 ? (doy - 250) / 50 : 1, fall = doy >= 290 ? Math.min(1, (doy - 290) / 35) : doy < 100 ? 1 : doy < 125 ? 1 - (doy - 100) / 25 : 0;
  const leafAut = doy < 100 || doy > 330 ? 1 : autumn;
  return { autumn: fall >= 1 ? 1 : leafAut, fall, fruit: doy > 225 && doy < 290 ? 1 : 0, flower: doy > 150 && doy < 200 };
}
const now0 = Date.now(), c0 = cal(now0, 0), qd = qs.get("doy"), doy = qd ? +qd : c0.doy;
const terr = paintTerrain(world, { autumn: seasonOf(doy).autumn });
setInterval(() => { for (let n = due(); world.t < n;) step(world); }, 1000);
const cv = document.getElementById("c"), V = createView(cv, world, terr);
V.flower = seasonOf(doy).flower;
addEventListener("resize", () => V.resize());
// touch like a map: one finger pans, two fingers zoom in steps; wheel zooms on desktop
const pts = new Map(); let pinch = null;
cv.addEventListener("pointerdown", e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
cv.addEventListener("pointermove", e => {
  const p = pts.get(e.pointerId); if (!p) return; const dpr = devicePixelRatio || 1;
  if (pts.size === 1) { V.cam.x -= (e.clientX - p[0]) * dpr / V.k; V.cam.y -= (e.clientY - p[1]) * dpr / V.k; if (Math.abs(e.clientX - p[0]) + Math.abs(e.clientY - p[1]) > 2) setFollow(false); }
  pts.set(e.pointerId, [e.clientX, e.clientY]);
  if (pts.size === 2 && pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d / pinch > 1.35) { V.zoom(1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; } else if (d / pinch < .74) { V.zoom(-1, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); pinch = d; } }
});
const up = e => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
cv.addEventListener("wheel", e => { e.preventDefault(); V.zoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY); }, { passive: false });
// the camera follows Tomas (gently) until you pan away; the button brings it back to him
let follow = true; const fb = document.getElementById("follow");
function setFollow(v) { follow = v; fb.style.display = v ? "none" : "block"; }
fb.addEventListener("click", () => setFollow(true));
{ const p = V.manPos(performance.now()); V.cam.x = p.x * 16; V.cam.y = p.y * 16; }
// what he's doing, and (tap) why, in his own words
const act = document.getElementById("act"), why = document.getElementById("why"); let showWhy = false;
act.addEventListener("click", () => { showWhy = !showWhy; why.style.display = showWhy ? "block" : "none"; });
const clk = document.getElementById("clk");
function frame(now) {
  const c = cal(world.born, world.t), x = world.wx, M = world.man;
  if (follow && M) { const p = V.manPos(now); V.cam.x += (p.x * 16 - V.cam.x) * .08; V.cam.y += (p.y * 16 - 8 - V.cam.y) * .08; }
  V.draw(now);
  if (M) {
    const doing = M.B.alive ? (M.act ? M.doing : M.pose === "sleep" ? "Sleeping" : "Resting") : "Tomas is gone";
    if (act.firstChild.textContent !== doing) act.firstChild.textContent = doing;
    const w = (M.why || "") + (M.say ? `\n“${M.say}”` : ""); if (why.textContent !== w) why.textContent = w;
  }
  const wxs = x.fog > .4 ? "Fog" : x.rain > 1.5 ? "Heavy rain" : x.rain > 0 ? "Rain" : x.cloud > .75 ? "Overcast" : x.cloud > .4 ? "Cloudy" : x.elev > 0 ? "Sunny" : "Clear";
  clk.textContent = `${String(c.h).padStart(2, "0")}:${String(c.mi).padStart(2, "0")} · ${wxs} · ${Math.round(x.temp)}°C · wind ${Math.round(x.wind * 2.237)} mph`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__v2 = { world, V, terr };
