// v2 preview: the island and Tomas, simulated in real time (UK clock). ?ff=<minutes> fast-forwards (testing only).
import { setupJournal } from "./render/journal.js";
import { setupInspection } from './render/inspect.js';
import { createWorld, step, load } from "./sim/world.js";
import { SEED, BORN } from "./config.js";
import { paintTerrain } from "./render/terrain.js";
import { createView } from "./render/view.js";
import { cal } from "./core/time.js";
import { audioStart, audioStop, audioUpdate } from "./audio.js";

const qs = new URLSearchParams(location.search), test = qs.has("seed") || qs.has("t");
// the island starts from the latest checkpoint the routine saved (so every device sees the same life), plus his
// thoughts; then catches up to this minute and runs on, one step per real minute
const DATA = new URL("../../data/v2/", import.meta.url);
const getJSON = async f => { try { const r = await fetch(new URL(f, DATA), { cache: "no-cache" }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
let thoughts = test ? [] : (await getJSON("mind.json")) || [];
const cp = test ? null : await getJSON("checkpoint.json");
let world = cp ? load(cp.blob, thoughts) : createWorld(test ? +(qs.get("seed") || SEED) : SEED, BORN, { thoughts });
const BORN0 = world.born;
const due = () => Math.floor((Date.now() - BORN0) / 60000);
for (let n = qs.get("t") ? +qs.get("t") : due() + (+qs.get("ff") || 0); world.t < n;) step(world);
// every quarter of an hour: has his deeper mind had new thoughts? if one should already have happened, start again
// from the newest checkpoint so this screen stays true to everyone else's
if (!test) setInterval(async () => {
  const nt = await getJSON("mind.json"); if (!nt || nt.length === thoughts.length) return;
  thoughts = nt; const c2 = await getJSON("checkpoint.json");
  const W2 = c2 && c2.t > world.t - 5000 ? load(c2.blob, thoughts) : null; if (!W2) return;
  for (let n = due(); W2.t < n;) step(W2);
  world = W2; V.world(world); window.__v2.world = world;
}, 15 * 60000);
function seasonOf(doy) {                                  // leaf colour and leaf fall by the real calendar
  const autumn = doy < 250 ? 0 : doy < 300 ? (doy - 250) / 50 : 1, fall = doy >= 290 ? Math.min(1, (doy - 290) / 35) : doy < 100 ? 1 : doy < 125 ? 1 - (doy - 100) / 25 : 0;
  const leafAut = doy < 100 || doy > 330 ? 1 : autumn;
  return { autumn: fall >= 1 ? 1 : leafAut, fall, fruit: doy > 225 && doy < 290 ? 1 : 0, flower: doy > 150 && doy < 200 };
}
const now0 = Date.now(), c0 = cal(world.born, world.t), qd = qs.get("doy"), doy = qd ? +qd : c0.doy;
let terr = paintTerrain(world, { autumn: seasonOf(doy).autumn });
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
// sound: off until you tap the speaker (phones only allow sound after a tap); remembered for next time
const sb = document.getElementById("snd"); let soundOn = false;
const pref = (() => { try { return localStorage.getItem("cw2-sound") === "1"; } catch (e) { return false; } })();
function setSound(on) { soundOn = on; sb.textContent = on ? "♪" : "♪̸"; sb.style.opacity = on ? 1 : .6; if (on) audioStart(); else audioStop(); try { localStorage.setItem("cw2-sound", on ? "1" : "0"); } catch (e) {} }
sb.addEventListener("click", () => setSound(!soundOn));
if (pref) addEventListener("pointerdown", () => { if (!soundOn) setSound(true); }, { once: true });
// Story, diary and camp: three readable views of the same simulated life.
const inspection=setupInspection(cv,V,()=>world);
setupJournal(document.getElementById('jbtn'), document.getElementById('journal'), () => world,()=>inspection.show({camp:true}));
const clk = document.getElementById("clk");
let lastFrame = null;
function frame(now) {
  requestAnimationFrame(frame);
  // A steady 60-Hz display budget also avoids wasting battery on 120/240-Hz screens.
  if (lastFrame != null && now - lastFrame < 1000 / 60 - .5) return;
  const dt = lastFrame == null ? 1000 / 60 : Math.min(64, now - lastFrame); lastFrame = now;
  const c = cal(world.born, world.t), x = world.wx, M = world.man;
  if (follow && M) { const p = V.manPos(now), easing = 1 - Math.exp(-dt / 200); V.cam.x += (p.x * 16 - V.cam.x) * easing; V.cam.y += (p.y * 16 - 8 - V.cam.y) * easing; }
  const season = seasonOf(qd ? +qd : c.doy);
  V.flower = season.flower;
  const groundSeason = Math.floor(season.autumn * 8);
  if (V.groundSeason !== groundSeason) { terr.recolor(season.autumn); V.groundSeason = groundSeason; }
  V.draw(now);
  inspection.refresh();
  if (soundOn) audioUpdate(world, V, now);
  if (M) {
    const doing = M.B.alive ? (M.act || (M.goal && M.plan && M.plan.length) ? M.doing : M.pose === "sleep" ? "Sleeping" : "Resting") : "Tomas is gone";
    if (act.firstChild.textContent !== doing) act.firstChild.textContent = doing;
    const w = (M.why || "") + (M.thought && world.t - (M.thoughtT || 0) < 360 ? `\n\n${M.thought}` : "") + (M.say && world.t - (M.sayT || 0) < 45 ? `\n“${M.say}”` : "") + (M.B.ill > .1 ? "\n(He's ill.)" : "") + (M.B.hurt && M.B.hurt.length ? "\n(A cut on his hand is healing.)" : ""); if (why.textContent !== w) why.textContent = w;
  }
  const wxs = x.rain > .05 && x.temp <= 1 ? "Snow" : x.fog > .4 ? "Fog" : x.rain > 1.5 ? "Heavy rain" : x.rain > 0 ? "Rain" : x.cloud > .75 ? "Overcast" : x.cloud > .4 ? "Cloudy" : x.elev > 0 ? "Sunny" : "Clear";
  clk.textContent = `Day ${Math.floor(world.t / 1440) + 1} · ${String(c.h).padStart(2, "0")}:${String(c.mi).padStart(2, "0")} · ${wxs} ${Math.round(x.temp)}°`;
}
requestAnimationFrame(frame);
document.getElementById("load")?.remove();
window.__v2 = { world, V, terr };
