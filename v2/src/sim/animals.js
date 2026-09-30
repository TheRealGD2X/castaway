// Animals, each a small body with a simple mind that weighs its needs, like his but plainer.
//  * GULLS work the shore: at low water they pick over the uncovered beds, at high water they loaf on the sand or
//    ride the sea, at night they roost on the rocks. Anything that comes near puts them up; they settle elsewhere.
//  * RABBITS live in warrens at the edge of the woods: they graze out from the burrows at dusk, night and dawn,
//    lie up underground by day, bolt for the burrow when a man or a dog comes near, and breed in spring and summer
//    up to what the grazing round the warren will carry. A snare on the run they use catches them.
//  * THE SHIP'S DOG came off the same wreck. It starts adrift on a hatch cover; wind and tide carry it until it
//    grounds. Its body gets hungry, thirsty, cold and tired; its mind wants food, water, warmth and rest, fears the
//    man at first and learns to trust him from his being near and quiet and, above all, from food thrown to it. Once
//    it trusts him it follows him, lies by the fire, and sleeps curled against him (and he's warmer for it).
// Everything moves in real time and every chance is the seeded RNG. Nothing is placed or timed by hand.
import { ensureAnimal, animalMinute, burrowMinute, ingest, drinkAnimal, carcass, canBreed, litterBudget } from './animal-body.js';
import { harvestShell, marineCatch } from './foodweb.js';
import { visible, scentTarget, odourStep } from './senses.js';
import {caughtBatch} from './food.js';
import { MW, MH, T, idx, WATER } from "../world/gen.js";
import { hash3 } from "../core/rng.js";
import { liquidRain } from "./seasons.js";
import { availableWater, takeWater } from "./hydro.js";
import { footfall, record } from "./heritage.js";
import { bestShelter, propsOf } from "../build/build.js";
import { dround, dsign, dsq, dhypot, dsin, dcos, clamp, dexp } from "../core/dmath.js";
import { findPath, walkable } from "../mind/path.js";

const NAMES = ["Bosun", "Tarry", "Moss", "Rigger", "Nell", "Skipper", "Brack"];
const land = (W, x, y) => { const i = idx(Math.floor(x), Math.floor(y)); return !WATER(W.ter[i]) || W.ter[i] === T.STREAM; };
const dist = (a, b) => dhypot(a.x - b.x, a.y - b.y);
export function animalsInit(W) {
  W.animals = [];
  const r = W.rng;
  // gulls: a flock on the longest stretch of shore
  const shore = []; for (let i = 0; i < MW * MH; i++) if ((W.ter[i] === T.SAND || W.ter[i] === T.SHINGLE) && W.dsea[i] === 1) shore.push(i);
  for (let k = 0; k < 9 && shore.length; k++) { const i = shore[(hash3(k, 3, W.seed) * shore.length) | 0]; W.animals.push(mk(W, "gull", i % MW + .5, ((i / MW) | 0) + .5, { air: 0 })); }
  // rabbit warrens: dry meadow or grass next to the wood edge, away from the sea
  W.warrens = [];
  for (let k = 0; k < 400 && W.warrens.length < 3; k++) {
    const i = (hash3(k, 7, W.seed) * MW * MH) | 0, x = i % MW, y = (i / MW) | 0;
    if ((W.ter[i] !== T.MEADOW && W.ter[i] !== T.GRASS) || W.dsea[i] < 6 || W.treeAt[i]) continue;
    if (![1, -1, MW, -MW, MW + 1, MW - 1].some(o => W.ter[i + o] === T.WOOD)) continue;
    if (W.warrens.some(w => Math.abs(w.x - x) + Math.abs(w.y - y) < 14)) continue;
    const w = { id: W.warrens.length, x: x + .5, y: y + .5, tile: i, cap: 8 };
    W.warrens.push(w);
    for (let n = 0; n < 5; n++) W.animals.push(mk(W, "rabbit", w.x, w.y, { home: w.id, under: 1 }));
  }
  // the dog, adrift off the side of the island the wreck lay to (west), on a hatch cover
  // (12 km out: the wreck went down in the night, far off; how long the drift takes is up to the weather)
  let sx = -6000, sy = dround(MH * (.3 + hash3(1, 2, W.seed) * .4));
  W.animals.push(mk(W, "dog", sx + .5, sy + .5, { adrift: 1, name: NAMES[(hash3(9, 9, W.seed) * NAMES.length) | 0], E: .45, wet: 1, cold: .5, tired: .8, thirst: .7, trust: 0, fear: .6, lastFed: -1 }));
}
function mk(W, sp, x, y, o) { return Object.assign({ id: W.nextId++, sp, x, y, px: x, py: y, tx: x, ty: y, act: "rest", face: 1 }, o); }
// ------------------------------------------------------------ one minute
export function animalsStep(W) {
  const M = W.man, x = W.wx, night = x.elev < -.05, dusk = x.elev > -.12 && x.elev < .18;
  if (W.t % 60 === 0) W.items = W.items.filter(it => it.k !== "scraps" || it.kcal > 1);   // gulls and rot take what's left
  for (const a of W.animals) { a.px = a.x; a.py = a.y; a.trail = null; if(a.dead)continue; ensureAnimal(a); if (a.sp === "gull") gull(W, a, M, night); else if (a.sp === "rabbit") rabbit(W, a, M, night, dusk); else if (a.sp === "dog") dog(W, a, M, night); animalMinute(W,a); }
  burrowMinute(W);odourStep(W);
}
// move toward (tx,ty) at speed (tiles/min) over any ground the species can cross
function moveTo(W, a, speed, fly) {
  const dx = a.tx - a.x, dy = a.ty - a.y, d = dhypot(dx, dy); if (d < .05) return true;
  const s = Math.min(d, speed * (a.body ? Math.max(.1,1-a.body.injury) : 1)), nx = a.x + dx / d * s, ny = a.y + dy / d * s;
  if (fly || land(W, nx, ny)) { a.x = nx; a.y = ny; } else { a.tx = a.x; a.ty = a.y; return true; }
  if (Math.abs(dx) > .02) a.face = dx > 0 ? 1 : -1;
  return s >= d;
}
const threats = (W, a, M) => { const t = []; if (M && M.B.alive) t.push(M); for (const b of W.animals) if (b.sp === "dog" && !b.adrift && b !== a) t.push(b); return t; };
const threatRange=t=>t.sp==='dog'?(t.act==='sleep'?1:7):t.B?.asleep?1:t.pose==='walk'?5:2;
// ------------------------------------------------------------ gulls
function gull(W, a, M, night) {
  if(a.thirst>.4&&W.ter[idx(Math.floor(a.x),Math.floor(a.y))]<=1){drinkAnimal(a,.005);W.foodweb.animalWaterImported=(W.foodweb.animalWaterImported||0)+.005;}
  const near = threats(W, a, M).find(t => dist(t, a) < (a.air ? 2 : 4.5) && visible(W,a,t));
  if (near && !a.air) { a.air = 1; a.act = "fly"; const ang = W.rng.f() * 6.283; a.tx = clamp(a.x + dcos(ang) * 14, 2, MW - 3); a.ty = clamp(a.y + dsin(ang) * 10, 2, MH - 3); }
  if (a.air) { if (moveTo(W, a, 250, true)) { a.air = 0; a.act = W.shore.some(b=>b.id===a.bed&&dist(b,a)<.8&&W.wx.tide<-b.depth)?"peck":"stand";if(a.act!=='peck'&&!land(W, a.x, a.y))a.act="swim"; } return; }
  // choose where to be: exposed shellfish beds at low water, otherwise loaf on the shore (or roost at night)
  if (W.rng.f() < .02) {
    let tgt = null;
    if (!night || a.E<.2) { const beds = W.shore.filter(b => W.wx.tide < -b.depth&&b.kg>.02); if (beds.length) tgt = beds[(W.rng.f() * beds.length) | 0]; }
    if (tgt) { a.bed=tgt.id;a.tx = tgt.x + W.rng.f() - .5; a.ty = tgt.y + W.rng.f() - .5; a.act = "peck";  }
    else if(!night&&a.E<.8){let sea=null;for(let k=0;k<12;k++){const px=clamp(a.x+(W.rng.f()-.5)*20,1,MW-2),py=clamp(a.y+(W.rng.f()-.5)*20,1,MH-2);if(W.ter[idx(Math.floor(px),Math.floor(py))]===T.SEA){sea={x:px,y:py};break;}}if(sea){a.tx=sea.x;a.ty=sea.y;a.act='swim';}}
    else { a.tx = clamp(a.x + (W.rng.f() - .5) * 3,1,MW-2); a.ty = clamp(a.y + (W.rng.f() - .5) * 2,1,MH-2); a.act = night ? "roost" : "stand"; }
    if (dist(a, { x: a.tx, y: a.ty }) > 3) { a.air = 1; a.act = "fly"; }
  }
  moveTo(W, a, 6, true);
  if(a.act==='peck'&&a.E<.9){const bed=W.shore.find(b=>dist(b,a)<.8&&W.wx.tide<-b.depth);if(bed){const kg=harvestShell(W,bed,.008,true),dry=kg*(bed.k==='mussels'?.075:.06);ingest(W,a,dry,.8);drinkAnimal(a,Math.max(0,kg/3-dry));W.foodweb.animalWaterImported=(W.foodweb.animalWaterImported||0)+Math.max(0,kg/3-dry);}}
  if(a.E<.8&&W.ter[idx(Math.floor(a.x),Math.floor(a.y))]===T.SEA){a.act='swim';const density=W.foodweb.marineFishDry/Math.max(.001,W.foodweb.area.sea*.0005);if(W.rng.f()<1-dexp(-.0025*density)){const dry=marineCatch(W,.0825);ingest(W,a,dry,.85);drinkAnimal(a,dry*2);W.foodweb.animalWaterImported=(W.foodweb.animalWaterImported||0)+dry*2;}}
}
// ------------------------------------------------------------ rabbits
function rabbit(W, a, M, night, dusk) {
  if (a.dead) return;
  if (!a.under) { const i = idx(Math.floor(a.x), Math.floor(a.y)); W.scent[i] = Math.min(6, (W.scent[i] || 0) + .3); }
  const w = W.warrens[a.home], out = night || dusk || a.E<.2 || a.thirst>.3;
  const danger = threats(W, a, M).find(t => dist(t, a) < threatRange(t) && visible(W,a,t));
  if (a.under) { if ((a.body?.ageDays??200)>21 && out && !threats(W, a, M).some(t => dist(t, w) < threatRange(t)+1) && W.rng.f() < .03) { a.under = 0; a.x = w.x; a.y = w.y; a.act = "graze"; } return; }
  if (danger) { a.act = "bolt"; a.tx = w.x; a.ty = w.y; if (moveTo(W, a, 300)) { a.under = 1; } return; }
  if(a.thirst>.3){const tile=idx(Math.floor(a.x),Math.floor(a.y));if(availableWater(W,tile)>.005){drinkAnimal(a,takeWater(W,tile,.005));a.act='drink';return;}}
  // Dry forage cannot supply all hydration. Seek a visible nearby water edge,
  // remembering the observation rather than searching the entire island.
  if(a.thirst>.6){
    if(a.drinkTile!=null&&availableWater(W,a.drinkTile)<.005)a.drinkTile=null;
    if(a.drinkTile==null&&W.t>=(a.nextWaterSearch||0)){let best=null,bd=13;a.nextWaterSearch=W.t+15;
      for(let dy=-6;dy<=6;dy++)for(let dx=-6;dx<=6;dx++){const tx=Math.floor(a.x)+dx,ty=Math.floor(a.y)+dy;if(tx<1||ty<1||tx>=MW-1||ty>=MH-1)continue;const tile=idx(tx,ty),q={x:tx+.5,y:ty+.5},d=dist(a,q);
        if(d<bd&&availableWater(W,tile)>.005&&visible(W,a,q)){best=tile;bd=d;}}
      a.drinkTile=best;
    }
    if(a.drinkTile!=null){const q={x:a.drinkTile%MW+.5,y:Math.floor(a.drinkTile/MW)+.5};
      if(dist(a,q)<1.6){drinkAnimal(a,takeWater(W,a.drinkTile,.01));a.act='drink';return;}
      a.tx=q.x;a.ty=q.y;a.act='hop';moveTo(W,a,20);return;
    }
  }else if(a.thirst<.2)a.drinkTile=null;
  if(a.act==='drink')a.act='graze';
  if (!out && W.rng.f() < .05) { a.tx = w.x; a.ty = w.y; a.act = "hop"; }
  if (a.act === "hop" && moveTo(W, a, 20)) { if (dist(a, w) < .3 && !out) { a.under = 1; return; } a.act = "graze"; }
  if (a.act === "graze" && ((W.foodweb.grass[idx(Math.floor(a.x),Math.floor(a.y))]||0)<.002 || W.rng.f() < .06)) {
    let patch=null,best=0;for(const [dx,dy] of [[2,0],[-2,0],[0,2],[0,-2],[2,2],[-2,2],[2,-2],[-2,-2]]){const tx=a.x+dx,ty=a.y+dy;if(tx<1||ty<1||tx>=MW-1||ty>=MH-1)continue;const i=idx(Math.floor(tx),Math.floor(ty)),food=W.foodweb.grass[i]||0;
      const utility=food/(1+dhypot(dx,dy));if(food>.002&&utility>best&&visible(W,a,{x:tx,y:ty})){best=utility;patch={x:tx,y:ty,tile:i};}}
    if(patch){a.tx=patch.x;a.ty=patch.y;a.act='hop';(W.runs||={})[patch.tile]=(W.runs[patch.tile]||0)+1;}
  }
  // snares: a rabbit passing through a set snare's tile is caught (a noose that tightens as it pushes on)
  for (const s of W.structs) if (s.k === "snare" && s.stage >= s.stages.length && !s.caught && Math.abs(s.x - a.x) < .5 && Math.abs(s.y - a.y) < .5 && W.rng.f() < .35) { s.caught = 1;s.catchBatch=caughtBatch(W,carcass(W,a)); a.dead = 1; }
}
// once a day: rabbits breed toward what the grazing will carry; the dead are gone
export function animalsDay(W, doy) {
  W.animals = W.animals.filter(a => !a.dead);
  const breeding = doy > 60 && doy < 250;
  for(const mother of W.animals){if(!mother.pregnancy||mother.pregnancy.due>W.t)continue;const kg=mother.pregnancy.dry/3;for(let k=0;k<3;k++){const a=mk(W,"rabbit",mother.x,mother.y,{home:mother.home,under:1,mother:mother.id});ensureAnimal(a);a.body.mass=kg/.2;a.body.tissue=kg;a.body.reserve=0;a.body.gut=0;a.body.ageDays=0;W.animals.push(a);}mother.pregnancy=null;}
  for (const w of W.warrens) {
    const pop = W.animals.filter(a => a.sp === "rabbit" && a.home === w.id).length;
    const mother=W.animals.find(a=>a.sp==='rabbit'&&a.home===w.id&&canBreed(a)&&!a.pregnancy);
    const mate=W.animals.some(a=>a.sp==='rabbit'&&a.home===w.id&&a.sex==='male'&&!a.dead&&a.body.ageDays>120);
    if (breeding && mother && mate && pop >= 2 && pop+3 <= w.cap && W.rng.f() < .12 * (1 - pop / w.cap)) mother.pregnancy={due:W.t+31*1440,dry:litterBudget(W,mother)};
  }
}
// ------------------------------------------------------------ the dog
function dog(W, a, M, night) {
  const x = W.wx;
  a.confidence ??= .15; a.huntSkill ??= .05; a.places ??= {}; a.memories ??= { shared: 0, catches: 0 };
  // adrift: the hatch cover goes where wind and tide take it: leeway with the wind, the tidal stream along and onto
  // the island (the flood sets in toward the land), until it grounds
  if (a.adrift) {
    const oct = [[1, 0], [.71, .71], [0, 1], [-.71, .71], [-1, 0], [-.71, -.71], [0, -1], [.71, -.71]][x.windDir | 0];
    const flood = x.tide - (a.lastTide ?? x.tide); a.lastTide = x.tide;
    const cx = W.cx - a.x, cy = W.cy - a.y, cd = dhypot(cx, cy) || 1;
    // leeway about 3% of the wind speed; the flood stream sets in toward the land at up to half a metre a second
    const vx = oct[0] * x.wind * .9 + cx / cd * (flood > 0 ? 12 : 2) + (-cy / cd) * 5 * dsign(flood);
    const vy = oct[1] * x.wind * .9 + cy / cd * (flood > 0 ? 12 : 2) + (cx / cd) * 5 * dsign(flood);
    a.x += vx; a.y += vy; a.act = "adrift";
    if (a.x > 1 && a.y > 1 && a.x < MW - 2 && a.y < MH - 2 && land(W, a.x, a.y)) { a.adrift = 0; a.ashore = W.t; a.act = "shake"; a.tx = a.x; a.ty = a.y; (W.events || (W.events = [])).push([W.t, "dog ashore"]); }
    return;
  }
  const localTile = idx(Math.floor(a.x), Math.floor(a.y));
  a.places[localTile] = Math.min(1, (a.places[localTile] || 0) + .003);
  a.confidence = clamp(a.confidence + (a.places[localTile] * .00008) - x.gust * .000002, .05, .95);
  const home = bestShelter(W), protectedHome = home && propsOf(home).rain > .6;
  // what it feels about the man: fear fades while he's near and does it no harm; trust grows slowly from that and
  // fast from food he gives it
  const dm = M && M.B.alive ? dist(a, M) : 99;
  if (dm < 6) { a.fear = clamp(a.fear - .0008, 0, 1); a.trust = clamp(a.trust + .00025 * (1 - a.trust) * (1 - a.fear) * (.7 + a.confidence), 0, 1); }
  else a.fear = clamp(a.fear + .00005, 0, .6);
  const bold = a.trust - a.fear * .6;
  // wants
  const man = M && M.B.alive ? M : null, food = W.items.find(it => it.k === "scraps" && dist(it, a) < 12);
  const rab = W.animals.find(r => r.sp === "rabbit" && !r.under && !r.dead && dist(r, a) < 9 && visible(W,a,r));
  let want = "wander", tgt = null, sp = 40;          // tiles a minute (a tile is 2 m): walking
  const need = { eat: (1 - a.E) * 1.2, drink: a.thirst * 1.4, warm: a.cold * (a.wet > .5 ? 1.3 : 1), rest: a.tired * (night ? 1.4 : .8), company: bold > .35 ? .35 + bold * .3 : 0 };
  if (food) { want = "scraps"; tgt = food; sp = 80; }
  else if (rab && a.E < .75 && a.tired < .8 && !a.chased) {
    // a chase: it's over in seconds. The rabbit runs for its burrow (11 m/s), the dog for the rabbit (8 m/s):
    // the dog only wins if it's nearer the burrow than the rabbit is, allowing for their speeds
    const w = W.warrens[rab.home], tr = dist(rab, w) / 11, td = dist(a, w) / 8;
    a.tx = rab.x; a.ty = rab.y; a.path = null; dogGo(W, a, 240); a.act = "run"; a.tired = clamp(a.tired + .05, 0, 1); a.chased = W.t;
    if (td < tr && dist(a, rab) < 1.5 && W.rng.f() < .35 + a.huntSkill * .4 + a.confidence * .1) {
      const captured=carcass(W,rab); a.huntSkill = Math.min(1, a.huntSkill + .06); a.confidence = Math.min(.95, a.confidence + .05); a.memories.catches++;
      const share = man && a.trust > .65 ? Math.min(500,captured*.45) : 0;
      ingest(W,a,(captured-share)/4000,.85);
      if (share) {a.quarry = { kcal: share,foodBatches:[caughtBatch(W,share)] };W.foodweb.harvested+=share/4000;}
      (W.events || (W.events = [])).push([W.t, "dog caught rabbit"]);
      if (man && dm < 15) record(W, 'dog-hunt', 'dog', a.name + ' caught a rabbit after following its trail.');
    } else { rab.under = 1; rab.x = w.x; rab.y = w.y; }
    return;
  }
  if (a.chased && W.t - a.chased > 20) a.chased = 0;
  if (!tgt) {
    const top = Object.entries(need).sort((p, q) => q[1] - p[1])[0];
    if (top[1] > .45) want = top[0];
    if (want === "drink") { if (a.water == null || a.noWater === a.water || availableWater(W,a.water)<.05) { let best = null, bd = 1e9; for (let i = MW; i < MW * (MH - 1); i++) { const t = W.ter[i]; if ((t !== T.STREAM && t !== T.LAKE) || i === a.noWater || availableWater(W,i)<.05) continue; if (t === T.LAKE && ![1, -1, MW, -MW].some(o => walkable(W, i + o))) continue; const d2 = dsq(i % MW - a.x) + dsq(((i / MW) | 0) - a.y); if (d2 < bd) { bd = d2; best = i; } } a.water = best; } tgt = a.water != null ? { x: a.water % MW + .5, y: ((a.water / MW) | 0) + .5 } : null; }
    else if (want === "warm" || want === "rest") {
      if (protectedHome && (x.rain * 2 + x.wind * .1 > .8)) tgt = { x: home.x, y: home.y };   // to the fire and the man if it trusts him; else a hollow under the trees
      const f = W.fires.find(f => f.lit || f.embers > .05);
      if (!tgt && bold > .25 && man && (f || night)) tgt = night && man.B.asleep ? { x: man.x - .6, y: man.y + .2 } : f ? { x: f.x + .9, y: f.y + .7 } : man;
      else if (!tgt && bold > 0 && f && want === "warm") tgt = { x: f.x + 2.4, y: f.y + 1.6 };
      else if (a.den == null) { for (let k = 0; k < 200; k++) { const i = (hash3(a.id, k, W.seed) * MW * MH) | 0; if (W.treeAt[i] && dist({ x: i % MW, y: (i / MW) | 0 }, a) < 20) { a.den = i; break; } } }
      if (!tgt && a.den != null) tgt = { x: a.den % MW + .5, y: ((a.den / MW) | 0) + .9 };
      if (!tgt) tgt = { x: a.x, y: a.y };                                   // nowhere better: it lies down where it is
    } else if (want === "eat") {   // hungry: go and beg where the man is, if bold enough; else forage the tideline
      const beds=W.shore.filter(b=>b.kg>.02&&W.wx.tide<-b.depth);let edible=null;for(const b of beds)if(!edible||dist(a,b)<dist(a,edible))edible=b;
      if(edible&&a.E<.2)tgt=edible;
      else if (man && bold > -.1 && W.t-a.lastFed<240) tgt = { x: man.x + (a.x < man.x ? -1.8 + bold : 1.8 - bold), y: man.y + .6 };
      else if ((night || W.wx.elev < .15) && W.warrens.length) { let w = W.warrens[0]; for (const q of W.warrens) if (dist(q, a) < dist(w, a)) w = q; tgt = { x: w.x + 3, y: w.y + 2 }; want = "hunt"; }   // dusk: rabbits are out; it goes hunting
      else if (man && W.fires.some(f => f.lit || f.heat > 0)) { const d = dm || 1; tgt = { x: man.x + (a.x - man.x) / d * 9, y: man.y + (a.y - man.y) / d * 9 }; }   // smoke and cooking carry: it lurks and watches from the edge of things
      else tgt=edible;

    } else if (want === "company") tgt = man ? { x: man.x - 1.2 * (man.face || 1), y: man.y + .5 } : null;
  }
  // Smell is local, washed away by rain; familiar trails lower the cost of investigating.
  if (!food && !rab && a.E >= .2 && a.E < .8 && a.tired < .7 && need.drink < .8 && need.warm < .8) {
    let scent = null, bv = want === 'company' ? .35 + a.trust * .3 : .25;
    for (const k in W.scent) {
      const i = +k, q = { x: i % MW + .5, y: Math.floor(i / MW) + .5 }, d = dist(q, a);
      if (d > 15 || d < .5) continue;
      const v = W.scent[k] * (1 - a.E) * (1 + a.confidence + (a.places[k] || 0)) / (2 + d);
      if (v > bv) { bv = v; scent = q; }
    }
    const airScent=scentTarget(W,a);if(airScent)scent=airScent;
    if (scent) { tgt = scent; want = 'track'; sp = 55; }
  }
  if (a.quarry && man && a.trust > .65) { want = 'retrieve'; tgt = man; sp = 55; }
  a.ears = want === 'track' || want === 'hunt' ? 'alert' : want === 'shy' ? 'back' : 'soft';
  a.tail = want === 'company' || want === 'retrieve' ? 'wag' : want === 'shy' ? 'low' : 'relaxed';
  // keep its distance from him while it's afraid
  if (man && dm < 3 - bold * 3 && want !== "scraps") { tgt = { x: a.x + (a.x - man.x) / (dm || 1) * 3, y: a.y + (a.y - man.y) / (dm || 1) * 3 }; want = "shy"; sp = 60; }
  // do it
  a.want = want; a.curled = false;
  if (tgt) {
    if (dhypot(tgt.x - a.tx, tgt.y - a.ty) > .6) { a.tx = tgt.x; a.ty = tgt.y; a.path = null; }
    const arrived = dogGo(W, a, sp);
    if (arrived || dist(a, tgt) < .8) {
      if (want === 'retrieve' && a.quarry && dist(a, tgt) < 1.5) {
        W.items.push({ id: W.nextId++, k: 'quarry', x: a.x, y: a.y, t: W.t, kcal: a.quarry.kcal,foodBatches:a.quarry.foodBatches }); a.quarry = null; a.act = 'sit';
        record(W, 'dog-share', 'dog', a.name + ' brought a rabbit back to camp.'); return;
      }
      if (want === "scraps" && dist(a, tgt) < .8) { const dry=(tgt.foodBatches||[]).reduce((v,b)=>v+b.dryKg,0);ingest(W,a,dry,.85);W.foodweb.harvested-=dry; W.items.splice(W.items.indexOf(tgt), 1); a.act = "eat"; if (tgt.from === "man") { a.trust = clamp(a.trust + .12 * (1 - a.trust), 0, 1); a.fear = clamp(a.fear - .15, 0, 1); a.lastFed = W.t; a.memories.shared++; a.confidence = clamp(a.confidence + .02, 0, .95); } return; }
      if (want === "drink") { const litres=takeWater(W,a.water,.25);drinkAnimal(a,litres); a.act = "drink"; return; }
      if(want==='eat'&&tgt.id){const bed=W.shore.find(b=>b.id===tgt.id&&W.wx.tide<-b.depth);if(bed&&dist(a,bed)<.8){const kg=harvestShell(W,bed,.02,true),dry=kg*(bed.k==='mussels'?.075:.06);ingest(W,a,dry,.75);drinkAnimal(a,Math.max(0,kg/3-dry));W.foodweb.animalWaterImported=(W.foodweb.animalWaterImported||0)+Math.max(0,kg/3-dry);a.act='eat';return;}}
      if (want === "rest" || want === "warm") { a.act = (night || a.tired > .5) ? "sleep" : "lie"; a.curled = man && dist(a, man) < 1.2 && man.B.asleep; return; }
      a.act = want === "company" || want === "retrieve" ? "sit" : want === "track" || want === "hunt" ? "sniff" : "stand"; return;
    }
    a.act = sp > 100 ? "run" : sp > 50 ? "trot" : "walk";
  } else if (W.rng.f() < .03) { a.tx = clamp(a.x + (W.rng.f() - .5) * 8, 1, MW - 2); a.ty = clamp(a.y + (W.rng.f() - .5) * 6, 1, MH - 2); a.path = null; dogGo(W, a, 25); a.act = "walk"; }
  else a.act = a.act === "walk" ? "stand" : a.act;
}
// the dog runs where a dog can: a path over the ground (it swims streams), re-found when the target moves
function dogGo(W, a, speed) {
  if (!a.path) { const ti = idx(Math.floor(a.tx), Math.floor(a.ty)), p = findPath(W, idx(Math.floor(a.x), Math.floor(a.y)), ti, { max: 2500, adjacent: !walkable(W, ti) }); a.path = p ? p.slice(1) : []; if (!p) { if (a.water === ti) a.noWater = ti; a.tx = a.x; a.ty = a.y; } }
  let budget = speed*Math.max(.1,1-(a.body?.injury||0)); a.trail = [[a.x, a.y]];
  while (budget > 0 && a.path.length) {
    const i = a.path[0], nx = i % MW + .5, ny = ((i / MW) | 0) + .5, d = dhypot(nx - a.x, ny - a.y);
    if (d <= budget) { a.x = nx; a.y = ny; budget -= d; a.path.shift(); footfall(W, a.x, a.y, .4); a.trail.push([a.x, a.y]); } else { a.x += (nx - a.x) / d * budget; a.y += (ny - a.y) / d * budget; budget = 0; }
    if (Math.abs(nx - a.px) > .02) a.face = nx > a.px ? 1 : -1;
  }
  if (!a.path.length) {   // the last step: onto the spot, or to the edge of water it can't stand in
    const d = dhypot(a.tx - a.x, a.ty - a.y), wet = !walkable(W, idx(Math.floor(a.tx), Math.floor(a.ty)));
    if (wet) return d < 1.6;
    if (d > .01 && d < 1.6) { const s = Math.min(d, budget); a.x += (a.tx - a.x) / d * s; a.y += (a.ty - a.y) / d * s; }
    return dhypot(a.tx - a.x, a.ty - a.y) < .3;
  }
  return false;
}
export const theDog = W => W.animals && W.animals.find(a => a.sp === "dog" && !a.dead);
