// v2 preview: the island and Tomas, simulated in real time (UK clock). ?ff=<minutes> fast-forwards (testing only).
import { setupJournal } from "./render/journal.js";
import { setupInspection } from './render/inspect.js';
import { createWorld, step, load } from "./sim/world.js";
import { SEED, BORN } from "./config.js";
import { paintTerrain } from "./render/terrain.js";
import { createView } from "./render/view.js";
import { cal } from "./core/time.js";
import { audioStart, audioStop, audioUpdate } from "./audio.js";
import { localWeather } from './sim/atmosphere.js';
import { loadWoodlandArt } from './render/woodland-art.js';
import { loadWaterArt } from './render/water.js';
import {loadSceneArt} from './render/scene-art.js';
import {T} from './world/gen.js';

const qs = new URLSearchParams(location.search), review = qs.get('review') === 'camp', test = qs.has("seed") || qs.has("t") || review;
// the island starts from the latest checkpoint the routine saved (so every device sees the same life), plus his
// thoughts; then catches up to this minute and runs on, one step per real minute
const DATA = new URL("../../data/v2/", import.meta.url);
const getJSON = async f => { try { const r = await fetch(new URL(f, DATA), { cache: "no-cache" }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
let thoughts = test ? [] : (await getJSON("mind.json")) || [];
const cp = review ? await fetch(new URL('../assets/preview/camp.json', import.meta.url)).then(r => r.ok ? r.json() : null).catch(() => null) : test ? null : await getJSON("checkpoint.json");
await Promise.all([loadWoodlandArt(),loadWaterArt(),loadSceneArt()]);
let world = cp ? load(cp.blob, thoughts) : createWorld(test ? +(qs.get("seed") || SEED) : SEED, BORN, { thoughts });
const BORN0 = world.born;
const due = () => Math.floor((Date.now() - BORN0) / 60000);
async function catchUp(W,n){while(W.t<n){const start=performance.now();do{step(W);}while(W.t<n&&performance.now()-start<12);if(W.t<n)await new Promise(resolve=>setTimeout(resolve,0));}}
await catchUp(world,review && cp ? world.t : qs.has('t')?+qs.get('t'):due()+(+qs.get('ff')||0));
// every quarter of an hour: has his deeper mind had new thoughts? if one should already have happened, start again
// from the newest checkpoint so this screen stays true to everyone else's
if (!test) setInterval(async () => {
  const nt = await getJSON("mind.json"); if (!nt || nt.length === thoughts.length) return;
  thoughts = nt; const c2 = await getJSON("checkpoint.json");
  const W2 = c2 && c2.t > world.t - 5000 ? load(c2.blob, thoughts) : null; if (!W2) return;
  await catchUp(W2,due());
  world = W2; V.world(world); window.__v2.world = world;
}, 15 * 60000);
function seasonOf(doy) {                                  // leaf colour and leaf fall by the real calendar
  const autumn = doy < 250 ? 0 : doy < 300 ? (doy - 250) / 50 : 1, fall = doy >= 290 ? Math.min(1, (doy - 290) / 35) : doy < 100 ? 1 : doy < 125 ? 1 - (doy - 100) / 25 : 0;
  const leafAut = doy < 100 || doy > 330 ? 1 : autumn;
  return { autumn: fall >= 1 ? 1 : leafAut, fall, fruit: doy > 225 && doy < 290 ? 1 : 0, flower: Math.max(0,Math.min(1,(doy-150)/12,(200-doy)/12)) };
}
const now0 = Date.now(), c0 = cal(world.born, world.t), qd = qs.get("doy"), doy = qd ? +qd : c0.doy;
let terr = paintTerrain(world, { autumn: seasonOf(doy).autumn });
let catching=false;if(!test)setInterval(async()=>{if(catching)return;catching=true;try{await catchUp(world,due());}finally{catching=false;}},1000);
const cv = document.getElementById("c"), V = createView(cv, world, terr);
if(review && ['day','dusk','night'].includes(qs.get('light')))V.reviewLight=qs.get('light');
V.flower = seasonOf(doy).flower;
V.plantFall=seasonOf(doy).fall;
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
if(review&&qs.get('area')==='rock'){
  const seen=new Set();let largest=[];
  for(let i=0;i<world.ter.length;i++){if(world.ter[i]!==T.ROCK||seen.has(i))continue;const group=[i];seen.add(i);
    for(let k=0;k<group.length;k++){const at=group[k],x=at%world.MW,y=Math.floor(at/world.MW);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,j=ny*world.MW+nx;if(nx<0||ny<0||nx>=world.MW||ny>=world.MH||seen.has(j)||world.ter[j]!==T.ROCK)continue;seen.add(j);group.push(j);}}
    if(group.length>largest.length)largest=group;
  }
  if(largest.length){V.cam.x=largest.reduce((a,i)=>a+(i%world.MW+.5)*16,0)/largest.length;V.cam.y=largest.reduce((a,i)=>a+(Math.floor(i/world.MW)+.5)*16,0)/largest.length;setFollow(false);}
}else if(review&&qs.get('area')==='shore'){
  const bed=world.shore.slice().sort((a,b)=>(a.x-world.man.x)**2+(a.y-world.man.y)**2-(b.x-world.man.x)**2-(b.y-world.man.y)**2)[0];
  if(bed){V.cam.x=bed.x*16;V.cam.y=bed.y*16+30;setFollow(false);}
}
fb.addEventListener("click", () => setFollow(true));
if(follow){ const p = V.manPos(performance.now()); V.cam.x = p.x * 16; V.cam.y = p.y * 16; }
// what he's doing, and (tap) why, in his own words
const act = document.getElementById("act"), why = document.getElementById("why"); let showWhy = false;
act.addEventListener("click", () => { showWhy = !showWhy; why.style.display = showWhy ? "block" : "none"; });
// sound: off until you tap the speaker (phones only allow sound after a tap); remembered for next time
const sb = document.getElementById("snd"); let soundOn = false;
const icon = path => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const soundIcon=icon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>');
const mutedIcon=icon('<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>');
sb.innerHTML=mutedIcon;
document.getElementById('jbtn').innerHTML=icon('<path d="M12 5v15M3 4c4-1 6 0 9 2 3-2 5-3 9-2v14c-4-1-6 0-9 2-3-2-5-3-9-2V4Z"/>');
const pref = (() => { try { return localStorage.getItem("cw2-sound") === "1"; } catch (e) { return false; } })();
function setSound(on) {
  soundOn = on; sb.innerHTML = on ? soundIcon : mutedIcon; sb.style.opacity = on ? 1 : .6;
  sb.setAttribute('aria-pressed', String(on)); sb.setAttribute('aria-label', on ? 'Mute island sounds' : 'Listen to the island');
  sb.title = on ? 'Mute island sounds' : 'Listen to the island';
  if (on) audioStart().catch(() => { setSound(false); sb.title = 'Sound could not start. Tap to try again.'; }); else audioStop();
  try { localStorage.setItem("cw2-sound", on ? "1" : "0"); } catch (e) {}
}
sb.addEventListener("click", () => setSound(!soundOn));
// Tapping the sound button with a remembered preference should toggle once, not twice.
if (pref) addEventListener("pointerdown", e => { if (e.target.closest?.('#snd') !== sb && !soundOn) setSound(true); }, { once: true });
document.addEventListener('castaway-audio-error', () => { setSound(false); sb.title = 'Sound paused. Tap to try again.'; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) audioStop();
  else if (soundOn) audioStart().catch(() => setSound(false));
});
// Story, diary and camp: three readable views of the same simulated life.
const inspection=setupInspection(cv,V,()=>world);
setupJournal(document.getElementById('jbtn'), document.getElementById('journal'), () => world,()=>inspection.show({camp:true}));
const clk = document.getElementById("clk");
let lastFrame = null;
let reviewSamples=0,reviewDrawMs=0,reviewViewport='';
function frame(now) {
  requestAnimationFrame(frame);
  // A steady 60-Hz display budget also avoids wasting battery on 120/240-Hz screens.
  if (lastFrame != null && now - lastFrame < 1000 / 60 - .5) return;
  const dt = lastFrame == null ? 1000 / 60 : Math.min(64, now - lastFrame); lastFrame = now;
  const c = cal(world.born, world.t), M = world.man, x = localWeather(world,M.x,M.y);
  if (follow && M) { const p = V.manPos(now), easing = 1 - Math.exp(-dt / 200); V.cam.x += (p.x * 16 - V.cam.x) * easing; V.cam.y += (p.y * 16 - 8 - V.cam.y) * easing; }
  const season = seasonOf(qd ? +qd : c.doy);
  V.flower = season.flower;
  V.plantFall=season.fall;
  const groundSeason = Math.floor(season.autumn * 64);
  if (V.groundSeason !== groundSeason) { terr.recolor(season.autumn); V.groundSeason = groundSeason; }
  const renderStart=review?performance.now():0;
  if(review&&reviewViewport!==cv.width+'x'+cv.height){reviewViewport=cv.width+'x'+cv.height;reviewSamples=0;reviewDrawMs=0;delete cv.dataset.renderMs;}
  V.draw(now);
  if(review){reviewSamples++;reviewDrawMs+=performance.now()-renderStart;if(reviewSamples%60===0)cv.dataset.renderMs=(reviewDrawMs/reviewSamples).toFixed(2);}
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
