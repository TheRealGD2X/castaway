import { dceil, dsq, dhypot } from "../core/dmath.js";
// Tomas as a physical being in the world: where he is, what he carries, what his body feels, what he can see.
// His mind (mind/) chooses actions; this file carries them out physically, one minute at a time, and keeps his
// perception and memory up to date. Movement is continuous along a walked path at real walking speed.
import { newBody, bodyStep, MET } from "./body.js";
import { radiantAt } from "./fire.js";
import { MW, MH, T, idx, WATER } from "../world/gen.js";
import { findPath, SLOW } from "../mind/path.js";
import { groundCost, liquidRain } from "./seasons.js";
import { footfall } from "./heritage.js";
import { shelterAt } from "../build/build.js";
import { climateAtHome } from './microclimate.js';
import { loadFactor, effortMet } from './effort.js';
import { visible } from './senses.js';
import { localWeather } from './atmosphere.js';
import { walkable, floodDepth } from '../mind/path.js';
import { elevation } from './geomorph.js';
import { seaLevel } from './ocean.js';

export function arrive(W) {
  // he washes up on a sandy beach, the nearest to the middle of the island's southern shore
  let best = -1, bd = 1e9;
  for (let i = 0; i < MW * MH; i++) if (W.ter[i] === T.SAND && W.dsea[i] === 1) { const x = i % MW, y = (i / MW) | 0, d = Math.abs(x - W.cx) + Math.max(0, W.cy - y) * 2; if (d < bd) { bd = d; best = i; } }
  const B = newBody(); B.wet = 1; B.fatigue = .7; B.glyco = 700; B.waterDef = 1.4; B.core = 35.9;
  W.man = { x: best % MW + .5, y: ((best / MW) | 0) + .5, B, inv: {}, carry: 0, act: null, path: null, face: 1, known: new Uint8Array(MW * MH), mem: {}, skill: { drill: 0, knap: 0, build: 0, forage: 0 }, log: [], born: W.t, goal: null, why: "" };
  look(W);
}
export const here = M => idx(Math.floor(M.x), Math.floor(M.y));
// how far he can see: daylight, fog, and trees close in around him
export function sightRange(W, M) {
  const x = localWeather(W,M.x,M.y), day = x.elev > .05 ? 1 : x.elev > -.1 ? .6 : .32, fog = 1 - x.fog * .75;
  const inWood = W.ter[here(M)] === T.WOOD ? .65 : 1;
  return Math.max(2.5, 11 * day * fog * inWood);
}
// look around: remember the ground he sees, and the state of things on it (as he saw them, when he saw them)
export function look(W) {
  const M = W.man, r = sightRange(W, M), r2 = r * r, cx = M.x, cy = M.y;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(MH - 1, dceil(cy + r)); y++)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(MW - 1, dceil(cx + r)); x++)
      if (dsq(x + .5 - cx) + dsq(y + .5 - cy) <= r2 && (!M.known[y*MW+x]||floodDepth(W,y*MW+x)>=.5) && visible(W,M,{x:x+.5,y:y+.5})){const i=y*MW+x;M.known[i]=1;if(floodDepth(W,i)>=.5)(M.floodMem||={})[i]=floodDepth(W,i);}
  for(const k in M.floodMem||{}){const i=+k,p={x:i%MW+.5,y:Math.floor(i/MW)+.5};if(dsq(p.x-cx)+dsq(p.y-cy)<=r2&&visible(W,M,p)){const depth=floodDepth(W,i);if(depth<.5)delete M.floodMem[k];else M.floodMem[k]=depth;}}
  const seen = (k, o) => { const m=M.mem[k]||(M.mem[k]={});Object.assign(m,o);m.t=W.t;m.confidence=1; };
  for (const e of W.near(cx, cy, r)) {
    if(!visible(W,M,e))continue;
    if (e.fruit != null) seen("e" + e.id, { k: e.k, x: e.x, y: e.y, fruit: e.fruit, shoots: e.shoots });
    else if (e.deadKg != null) seen("e" + e.id, { k: e.k, x: e.x, y: e.y, deadKg: e.deadKg, shoots: e.shoots, leafKg:e.leafKg });
    else if (e.k === "flint" || e.k === "fern" || e.k === "boulder" || e.k === "stones" || e.k === "reeds") seen("e" + e.id, { k: e.k, x: e.x, y: e.y, n: e.n ?? 1 });
  }
  for (const it of W.items) if (dsq(it.x - cx) + dsq(it.y - cy) <= r2 && visible(W,M,it)) seen("i" + it.id, { k: it.k, x: it.x, y: it.y, kg: it.kg, moist: it.moist });
  const remainingItems=new Set(W.items.map(it=>"i"+it.id));
  for (const k in M.mem) if (k[0] === "i" && !remainingItems.has(k)) { const m = M.mem[k]; if (dsq(m.x - cx) + dsq(m.y - cy) <= r2 && visible(W,M,m)) delete M.mem[k]; }   // gone (he sees it isn't there)
  // the shore: beds he can see when the tide has uncovered them (and how deep they lie, so when they'll show again)
  for (const b of W.shore) if (dsq(b.x - cx) + dsq(b.y - cy) <= r2 && seaLevel(W,b.x,b.y) < -b.depth && visible(W,M,b)) seen("s" + b.id, { k: b.k, x: b.x, y: b.y, kg: b.kg, depth: b.depth, tile: b.tile });
  // animals: the dog (where it was, how it seemed), rabbits by their warren (so he knows where they run)
  for (const a of W.animals) {
    if (dsq(a.x - cx) + dsq(a.y - cy) > r2 || a.adrift || a.dead || !visible(W,M,a)) continue;
    if (a.sp === "dog") seen("dog", { k: "dog", x: a.x, y: a.y, trust: a.trust, name: a.name, thin: a.E < .3 ? 1 : 0 });
    else if (a.sp === "rabbit" && !a.under) seen("warren" + a.home, { k: "warren", x: W.warrens[a.home].x, y: W.warrens[a.home].y, home: a.home });
  }
  for (const f of W.fires) if (dsq(f.x - cx) + dsq(f.y - cy) <= r2 && visible(W,M,f)) seen("fire" + f.id, { k: "fire", x: f.x, y: f.y, lit: f.lit, embers: f.embers, fuelKg: (f.fuel.logs[1] < .35 ? f.fuel.logs[0] : 0) + (f.fuel.kindling[1] < .35 ? f.fuel.kindling[0] : 0), tinder: f.fuel.tinder[1] < .3 ? f.fuel.tinder[0] : 0 });   // damp tinder is no tinder
}
// the conditions his body is in this minute (shelter he stands in, the fire beside him, the weather)
export function bodyContext(W, M, met) {
  const x = localWeather(W,M.x,M.y), i = here(M), sh = shelterAt(W, M.x, M.y);
  const indoor=climateAtHome(W,M.x,M.y);met=effortMet(W,M,met);
  // standing under a big tree keeps some rain off and some wind
  const underTree = W.treeAt && W.treeAt[i] ? .45 : 0;
  let fireW = 0;
  for (const f of W.fires) { const d = dhypot(f.x - M.x, f.y - M.y) * 2; if (d < 8) fireW += radiantAt(f, d); }
  fireW *= sh.fire * (1 + sh.reflect);
  // a dog asleep against him is a hot-water bottle (a dog's body gives off about 50 W; he gets some of it)
  for (const a of W.animals) if (a.sp === "dog" && a.curled && !a.dead) fireW += a.contactHeatW||0;
  return { met, airT: indoor?.airT??x.temp, wind: x.wind, windBlock: 1 - (1 - underTree * .5) * (1 - sh.wind), rain: x.rain*(1-Math.max(0,Math.min(1,(1-x.temp)/2)))+(W.ocean?.spray[i]||0), immersion:floodDepth(W,i),waterT:W.ocean?coastalTemperature(W,i):W.hydro.temp,blanket: M.inv.wrap ? .35 * (1 - (M.wrapWet || 0) * .6) : 0, rainBlock: 1 - (1 - underTree) * (1 - sh.rain), sun: x.sun, hum: indoor?.hum??x.hum, fireW, lying: M.B.asleep || M.pose === "lie", bedding: sh.bed, groundT: indoor?.wallT??W.surface?.temp, sleepQ: 1 };
}
const coastalTemperature=(W,i)=>{const g=W.ocean.grids[2],cell=Math.floor(Math.floor(i/W.MW)/4)*g.nx+Math.floor((i%W.MW)/4),V=g.volume[cell]*g.fractions[0];return V>.001?g.heat[cell]/(1025*3990*V):W.hydro.temp;};
// walk along the path: real speed (about 1.2 m/s on firm grass), slower on rough ground, when tired or cold
export function walk(W, M, minutes = 1) {
  if (!M.path || M.path.length < 2) { M.path = null; return true; }
  const B = M.B, tired = 1 - B.fatigue * .35 - (B.core < 35.5 ? .3 : 0);
  let budget = 72 * minutes * tired / loadFactor(M);M.walkedM=0;M.climbedM=0;
  while (budget > 0 && M.path.length > 1) {
    const a = M.path[0], b = M.path[1], bx = b % MW + .5, by = ((b / MW) | 0) + .5;
    if(!walkable(W,b)){M.blockedTile=b;M.movementFailed=true;M.known[b]=1;if(floodDepth(W,b)>=.5)(M.floodMem||={})[b]=floodDepth(W,b);M.path=null;return false;}
    const dx = bx - M.x, dy = by - M.y, metres=dhypot(dx,dy)*2,full=dhypot(b%MW-a%MW,Math.floor(b/MW)-Math.floor(a/MW))*2;
    const rise=(elevation(W,b)-elevation(W,a))*Math.min(1,metres/Math.max(.001,full)),slope=1+Math.max(0,rise)/Math.max(.2,metres)*1.8;
    const dist = metres * (SLOW[W.ter[b]] || 1) * groundCost(W, b)*slope,share=Math.min(1,budget/Math.max(.000001,dist));M.walkedM+=metres*share;M.climbedM+=Math.max(0,rise)*share;
    if (dist <= budget) { M.x = bx; M.y = by; budget -= dist; M.path.shift(); footfall(W, M.x, M.y, 1 + M.carry / 20); if (M.trail) M.trail.push([M.x, M.y]); }
    else { const f = budget / dist; M.x += dx * f; M.y += dy * f; budget = 0; }
    if (Math.abs(dx) > .01) M.face = dx > 0 ? 1 : -1;
  }
  if (M.trail) M.trail.push([M.x, M.y]);                      // the way he went this minute, for drawing him walking it
  if (!M.path || M.path.length < 2) { M.path = null; return true; }
  return false;
}
export function goTo(W, M, targetTile, adjacent) {
  const p = findPath(W, here(M), targetTile, { adjacent,observed:M.known,floodMem:M.floodMem });
  M.path = p; return !!p;
}
