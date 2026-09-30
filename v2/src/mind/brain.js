// His mind: wants -> goals -> a plan found by search -> action, re-thought whenever an action ends or fails.
//  * Goals come from his body's signals now (thirst, hunger, cold, tiredness) and from PREDICTION: he runs his own
//    body forward through the coming night under the conditions he expects (how cold nights have been, the wind,
//    whether he's wet, what shelter and fire he'll have) and, if that night would chill him dangerously, wants a
//    lit fire with enough fuel by dusk.
//  * The plan is a best-first search (A*) over his simplified picture of his situation using what he knows how
//    to do (actions.js), costed in minutes from where he is and what he remembers of the island.
//  * He commits to a goal until it's met, fails, or something clearly more urgent comes up; he explains himself.
import { ACTIONS, walkMin, camp, drillOdds, buildExec } from "./actions.js";
import { MATS, FAMILIES, DIRV, brief, design, feasible, place, propsOf, finished, stillNeeds, bestShelter, shelterAt, woodpile } from "../build/build.js";
import { feel, newBody, bodyStep, MET } from "../sim/body.js";
import { climateAt } from "../sim/env.js";
import { cal } from "../core/time.js";
import { here, walk, goTo } from "../sim/man.js";
import { MW, MH, idx } from "../world/gen.js";
import { intent } from "../sim/mindlink.js";
import { dround, dhypot, clamp } from "../core/dmath.js";
import { craftGoals, salvageActions } from "./crafts.js";
import { exposure } from "./exposure.js";
const FOOD_WORK = new Set(["forage", "shellfish", "checkTrap", "checkSnares", "lineFish", "collectQuarry"]);

// what he believes his situation to be, simplified for planning
function situation(W, M) {
  const inv = M.inv, fireM = Object.entries(M.mem).find(([k, m]) => k.startsWith("fire") && m.lit);
  const S = { food: dround(inv.food || 0), tinder: +(inv.tinder || 0).toFixed(2), kindling: +(inv.kindling || 0).toFixed(1), fuel: +(inv.fuel || 0).toFixed(1),
    flake: inv.flake ? 1 : 0, drill: inv.drill ? 1 : 0, fire: fireM ? 2 : 0, fireFuel: fireM ? +(fireM[1].fuelKg || 0).toFixed(1) : 0,
    fed: 0, watered: 0, warm: 0, cover: bestShelter(W) ? 1 : 0, rested: 0, rest: 0, dry: 0, stageDone: 0, stacked: 0, laid: 0, embers: 0, dogFed: 0, signalled: 0, watched: 0, raw: dround(inv.raw || 0), pot: inv.pot ? 1 : 0, clean: +(inv.clean || 0).toFixed(1), night: W.wx.elev < -.05 ? 1 : 0, rain: W.wx.rain > .3 ? 1 : 0 };
  for (const k of ["cord", "line", "basket", "axe", "wrap", "greenPot", "clayPot"]) S[k] = inv[k] || 0; S.repaired = 0; S.stored = 0; S.preservedFood = (M.preserved || 0) > .5 && (inv.food || 0) > 200 ? 1 : 0;
  for (const m of MATS) S[m] = dround(inv[m] || 0);
  // a fire laid but not lit, or gone to embers: he knows it's there
  // a fire laid but not lit (tinder in it), or gone to embers: ready to light. A dead hearth with only wood left
  // needs tinder and kindling laid again, but its wood still counts
  if (S.fire === 0) { const laid = Object.entries(M.mem).find(([k, m]) => k.startsWith("fire") && !m.lit && (m.fuelKg > .3 || m.embers > .03)); if (laid) { S.fireFuel = +(laid[1].fuelKg || 0).toFixed(1); S.embers = laid[1].embers > .03 ? 1 : 0; S.laid = laid[1].tinder > .03 ? 1 : 0; if (S.laid || S.embers) S.fire = 1; } }
  return S;
}
// predict tonight: his core temperature at the coldest point of a night as things stand (or with a fire, or with a
// shelter that does what `sh` does), from the season's cold, tonight's wind and rain as they are now, and his body now
export function predictNight(W, M, withFire, sh) {
  const C = cal(W.born, W.t), cl = climateAt(C.doy), B = Object.assign(newBody(), JSON.parse(JSON.stringify(M.B)));
  const home = bestShelter(W), cur = home ? shelterAt(W, home.x, home.y) : { rain: 0, wind: 0, bed: 0, fire: 1, reflect: 0 };
  const p = sh ? { rain: sh.rain ?? cur.rain, wind: sh.wind ?? cur.wind, bed: sh.bed ?? cur.bed, fire: sh.fire ?? cur.fire, reflect: sh.reflect ?? cur.reflect } : cur;
  const airT = Math.min(W.wx.temp, cl.tmean - cl.trange * .45), wind = W.wx.wind, fireW = withFire ? 90 * p.fire * (1 + p.reflect) : 0, rain = W.wx.rain > 0 ? W.wx.rain : 0;
  B.asleep = true; let min = B.core;
  for (let m = 0; m < 480; m += 5) { for (let k = 0; k < 5; k++) bodyStep(B, { met: MET.sleep, airT, wind, windBlock: p.wind, rain, rainBlock: p.rain, sun: 0, fireW, lying: true, blanket: M.inv.wrap ? .35 * (1 - (M.wrapWet || 0) * .6) : 0, bedding: p.bed, groundT: W.surface?.temp }); min = Math.min(min, B.core); if (!B.alive) break; }
  return min;
}
// what he could build next, and how much each would be worth to him: the designer proposes, prediction weighs
export function projects(W, M, toDusk) {
  const sig = W.structs.map(q => q.k + q.stage + Math.floor((q.integrity ?? 1) * 10)).join() + "|" + (M.intents || []).filter(q => q.until > W.t).map(q => q.k + q.w).join()+'|'+Object.entries(M.materialBeliefs||{}).map(([m,b])=>m+b.upper).join();
  if (M.projCache && W.t - M.projCache.t < 60 && M.projCache.sig === sig) return M.projCache.list;
  const b = brief(W, M), campT = camp(W, M).tile, list = [], base = predictNight(W, M, false), baseF = predictNight(W, M, true);
  const hasFire = W.fires.length > 0 || W.camp != null;
  const worth = (fam, s) => {
    const F = FAMILIES[fam];
    if(s.assembly&&!F.shelter&&fam!=="bedding"){
      if(!bestShelter(W))return 0;
      const p=propsOf({...s,stage:s.stages.length,prog:0}),has=k=>W.structs.reduce((v,q)=>q.id===s.id?v:Math.max(v,(q.props||propsOf(q))[k]||0),0);
      const bench=Math.max(0,p.bench-has('bench'))*18,drying=Math.max(0,p.drying-has('drying'))*(hasFire?17:0),store=Math.max(0,p.store*p.dry-has('store')*has('dry'))*17;
      const water=Math.max(0,p.capacity-has('capacity'))/Math.max(12,p.capacity)*(12+Math.min(8,M.B.waterDef*2)+Math.min(8,W.wx.rain*2)+(M.belief?.['water:stream']||0)*12);
      return Math.max(bench,drying,store,water)+(bench+drying+store+water-Math.max(bench,drying,store,water))*.28;
    }
    if (F.shelter) {   // how much warmer would tonight be once this stage (or the usable shell) is up?
      const next = Object.assign({}, s, { stage: s.stage + 1, prog: 0 }), p = propsOf(next);
      const gain = Math.max(predictNight(W, M, false, p) - base, (predictNight(W, M, true, p) - baseF) * .7);
      const otherWorkspace=W.structs.reduce((v,q)=>q.id===s.id?v:Math.max(v,(q.props||propsOf(q)).workspace||0),0);
      const workspace=Math.max(0,(p.workspace||0)-otherWorkspace)*18;
      return workspace + (gain > .05 ? 20 + Math.min(30, gain * 16) + (toDusk > 0 && toDusk < 240 && gain > .3 ? 12 : 0) : 12 + (p.rain - (s.props?.rain || 0)) * 8);
    }
    if (fam === "fireRing") return hasFire ? 19 : 0;
    if (fam === "reflector") { const gain = predictNight(W, M, true, { reflect: .6 }) - baseF; return bestShelter(W) && hasFire ? 16 + Math.min(12, gain * 12) : 0; }
    if (fam === "fishTrap") return hasFire && W.structs.some(q => FAMILIES[q.k].shelter && finished(q)) ? 16 + (M.B.glyco < 800 ? 6 : 0) : 0;   // food that comes to him, once he has a home
    if (fam === "signal") return M.log.some(l => l[1] === "ship") ? 30 : 0;           // after the first ship went by, never again unready
    if (fam === "snare") return Object.values(M.mem).some(m => m.k === "warren") && hasFire && W.structs.filter(q => q.k === "snare").length < 3 ? 15 + (M.B.glyco < 800 ? 6 : 0) : 0;
    if (fam === "workbench") return bestShelter(W) ? 18 : 0;
    if (fam === "dryingRack") return hasFire && bestShelter(W) ? 17 : 0;
    if (fam === "foodStore") return bestShelter(W) ? 17 : 0;
    if (fam === 'rainCollector') return bestShelter(W) ? 12+Math.min(8,M.B.waterDef*2)+Math.min(8,W.wx.rain*2)+((M.belief?.['water:stream'])||0)*12 : 0;
    if(s.earthwork&&fam!=='drainage'){const i=s.tile??idx(Math.floor(s.x),Math.floor(s.y)),wet=W.hydro?.pool[i]||0;return bestShelter(W)?Math.min(28,wet*(fam==='weir'?160:200)+(fam==='settlingPool'?M.B.waterDef*3:0)+W.wx.rain*2):0;}
    if (fam === 'drainage') {const i=s.tile??idx(Math.floor(s.x),Math.floor(s.y));return bestShelter(W)?Math.min(28,(W.hydro?.pool[i]||0)*500+W.wx.rain*3):0;}
    if (fam === "bedding") return bestShelter(W) ? 18 + Math.max(0, 12 - W.wx.temp) * 2 : 0;
    if (fam === "woodpile") return bestShelter(W) ? 18 + (W.litterWet > .35 ? 5 : 0) : 0;
    return 0;
  };
  // carry on with what's half built
  for (const s of W.structs) if (!finished(s)) { const st = s.stages[s.stage]; if (feasible(b, st)) list.push({ s, v: worth(s.k, s) + 4 + intent(W, M, "build:" + s.k) }); }
  // or start something new he's able to make and has reason for (one of each, and a better shelter than he has)
  for (const fam in FAMILIES) {
    const F = FAMILIES[fam]; if (M.skill.build < F.minSkill || W.structs.filter(s => s.k === fam).length >= (fam === "snare" ? 3 : 1)) continue;
    if (F.shelter && W.structs.some(s => FAMILIES[s.k].shelter && !finished(s))) continue;
    const d = design(W, M, fam, campT); if (!d || !feasible(b, d.stages[0])) continue;
    // a new shelter is weighed by what the whole usable shell would do
    let v; if (F.shelter) { const full = Object.assign({}, d, { stage: d.stages.findIndex(q => q.name === "bed") > 0 ? d.stages.findIndex(q => q.name === "bed") : d.stages.length - 1 }); v = worth(fam, full) - d.stages.reduce((a, q) => a + q.mins, 0) / 120; }
    else v = worth(fam, d);
    v += intent(W, M, "build:" + fam) + (fam === "signal" ? intent(W, M, "signal") : 0);   // his deeper mind's wishes
    if (v > 10) list.push({ d, v });
  }
  M.projCache = { t: W.t, sig, list }; return list;
}
function buildGoal(W, M, p) {
  const s = p.s, st = s ? s.stages[s.stage] : p.d.stages[0], k = s ? s.k : p.d.k, need = stillNeeds(s, st), mats = Object.keys(need);
  const tgt = s ? { sid: s.id, tile: idx(Math.floor(s.x), Math.floor(s.y)), x: s.x, y: s.y } : { d: p.d, tile: p.d.tile, x: p.d.x, y: p.d.y };
  const act = { r: [...mats, "stageDone"], w: ["stageDone", ...mats], provides: ["stageDone"], find: () => tgt, pre: S => !S.stageDone && mats.every(m => S[m] >= need[m]), eff: S => { S.stageDone = 1; for (const m of mats) S[m] -= need[m]; },
    cost: (W, M, t) => walkMin(M, t) + st.mins };
  const what = (s||p.d).label||FAMILIES[k].label, why = s ? `Working on the ${what}: the ${st.name}` : `A ${what} would help: ${st.say ? st.say.split(".")[0].toLowerCase() : "time to start"}`;
  return { k: "build:" + (s ? s.id : k) + ":" + (s ? s.stage : 0), vars: ["stageDone"], want: S => S.stageDone, acts: { ["build_" + k]: act }, v: p.v, why };
}
function goals(W, M) {
  const f = feel(M.B), S = situation(W, M), G = [], x = W.wx, C = cal(W.born, W.t);
  const toDusk = x.elev > -.05 ? minutesToDusk(W) : 0;
  if (f.thirst > .3) G.push({ k: "water", vars: ["watered"], want: S => S.watered, v: 50 + f.thirst * 70, why: f.thirst > .7 ? "Parched" : "Thirsty" });
  if ((f.hunger > .5 || f.starving > .1) && (S.food > 100 || knowsFood(M) || S.line || W.structs.some(s=>s.stock>150) || W.items.some(it=>it.k==="quarry"))) G.push({ k: "food", vars: ["fed"], want: S => S.fed, v: 30 + f.hunger * 55 + f.starving * 500 + intent(W, M, "food"), why: f.starving > .5 ? "Running out of strength; he needs food to keep warm" : f.hunger > .85 ? "Weak with hunger" : "Hungry" });
  if ((M.B.core < 36.4 || (M.B.wet > .5 && x.temp < 12)) && (S.fire === 2 || S.cover)) {
    const target = ACTIONS.warmUp.find(W, M);
    if (target) {
      const outside = exposure(W, M, M, 60, true), refuge = exposure(W, M, target);
      const relief = Math.max(0, outside.cold - refuge.cold);
      G.push({ k: "warm", vars: ["warm"], want: S => S.warm, v: 60 + f.cold * 60 + f.hypothermic * 700 + relief * 120, why: target.key === "shelter" ? (M.B.wet > .5 ? "Soaked and cold; he can hold more heat inside his shelter" : "Cold; he can hold more heat inside his shelter") : M.B.wet > .5 ? "Soaked and cold; he needs to dry out by the fire" : "Cold to the bone" });
    }
  }
  // tonight: would a night without fire chill him dangerously? then a lit fire with fuel for the night, by dusk
  const needFuel = 6;
  if (!(S.fire === 2 && S.fireFuel >= needFuel)) {
    const pmin = M.predCache && W.t - M.predCache[0] < 60 ? M.predCache[1] : (M.predCache = [W.t, predictNight(W, M, false)])[1];
    if (pmin < 36.1) G.push({ k: "fire", vars: ["fire", "fireFuel"], want: S => S.fire === 2 && S.fireFuel >= needFuel, v: 45 + (36.3 - pmin) * 25 + (toDusk < 180 ? 25 : 0) + intent(W, M, "fire"), why: `A night without a fire would chill him to ${pmin.toFixed(1)}°C` });
  }
  // an evening fire: warmth, dry clothes, light, and the comfort of it. Wanted every evening he has none going
  if (S.fire !== 2 && !S.night && toDusk < 300 && !G.some(g => g.k === "fire")) {
    const eg = M.eveCache && W.t - M.eveCache[0] < 60 ? M.eveCache[1] : (M.eveCache = [W.t, predictNight(W, M, true) - predictNight(W, M, false)])[1];
    G.push({ k: "fire", vars: ["fire", "fireFuel"], want: S => S.fire === 2 && S.fireFuel >= 4, v: 30 + Math.min(20, eg * 20) + M.B.wet * 10 + intent(W, M, "fire"), why: M.B.wet > .4 ? "Wet through: he wants a fire to dry out by tonight" : "A fire for the evening, before the light goes" });
  }
  // clean water: once he's come to distrust the water here, a pot to boil it in, and boiled water kept by him
  const wRisk = Math.max(0, ...Object.entries(M.belief || {}).filter(([k]) => k.startsWith("water:")).map(([, v]) => v));
  if (wRisk > .3 && !S.night) {
    if (!S.pot) G.push({ k: "pot", vars: ["pot"], want: S => S.pot, v: 20 + wRisk * 20, why: "The water made him ill. He wants a pot to boil it in" });
    else if (S.clean < 1 && S.fire === 2) G.push({ k: "boil", vars: ["clean"], want: S => S.clean >= 1.5, v: 16 + wRisk * 30 + intent(W, M, "boil"), why: "Boiling water to keep by him" });
  }
  // a ship: nothing else matters while it's in sight
  if (M.mem.ship && W.t - M.mem.ship.t < 20 && W.ships.some(q => q.id === M.mem.ship.id)) G.push({ k: "ship:" + M.mem.ship.id, vars: ["signalled"], want: S => S.signalled, v: 200, why: `A ship! A ${M.mem.ship.kind}, out past the reefs` });
  // the dog: he wants it to trust him, all the more the lonelier he is; food is the way
  const dg = M.mem.dog;
  if (dg && W.t - dg.t < 180 && ((dg.trust ?? 0) < .85 || dg.thin) && !S.night && (S.food >= 150 || S.raw >= 150) && f.hunger < .45)
    G.push({ k: "dog", vars: ["dogFed"], want: S => S.dogFed, v: 16 + (M.lonely || 0) * 25 + intent(W, M, "dog"), why: dg.thin && (dg.trust ?? 0) >= .85 ? `${dg.name} is all ribs. He shares what he has` : (dg.trust ?? 0) < .3 ? `The ship's dog, ${dg.name}. Thin and wary. He wants it to trust him` : `${dg.name} is coming round. A bit of food, and a quiet word` });
  const roof = shelterAt(W, M.x, M.y).rain;
  if (x.rain > .8 && roof < .5 && M.B.wet > .4) {
    const target = ACTIONS.shelterFromRain.find(W, M), outside = exposure(W, M, M);
    const relief = target ? Math.max(0, outside.cold - exposure(W, M, { ...target, pose: "sit" }).cold) : 0;
    G.push({ k: "dry", vars: ["dry"], want: S => S.dry, v: 45 + x.rain * 8 + relief * 120, why: relief > .1 ? "Losing heat in the rain; the shelter would keep him warmer" : "Getting out of the rain" });
  }
  if ((f.weary > .75 || intent(W, M, "rest") > 0) && !S.night) G.push({ k: "rest", vars: ["rest"], want: S => S.rest, v: (f.weary > .75 ? 20 + f.weary * 40 : 8) + intent(W, M, "rest"), why: f.weary > .75 ? "Worn out; he has to sit a while" : "Taking his time. Sitting with his thoughts" });
  // curiosity: on a quiet day he goes to see the parts of the island he doesn't know yet
  if (!S.night && !G.some(g => g.explore) && W.t % 60 < 5) { let k = 0, n = 0; for (let i = 0; i < M.known.length; i += 7) if (W.ter[i] > 1) { n++; k += M.known[i]; } M.seen = k / Math.max(1, n); }   // share of the land he has seen
  if (!S.night && !G.some(g => g.explore) && (M.seen ?? 0) < .8 && f.weary < .5 && toDusk > 120) G.push({ k: "explore", explore: true, v: 11 + intent(W, M, "explore"), why: "Curious. He hasn't seen that side of the island yet" });
  // time to himself: sit up on the high ground over the sea and watch for a sail (the dog at his side if it's his)
  if (!S.night && toDusk > 60 && f.hunger < .5 && f.thirst < .4 && W.t - (M.lastWatch ?? -999) > 240) G.push({ k: "watch", vars: ["watched"], want: S => S.watched, v: 6 + intent(W, M, "rest") * .5, why: M.mem.dog && (M.mem.dog.trust ?? 0) > .6 ? `Sitting up over the sea with ${M.mem.dog.name}, watching for a sail` : "Sitting up over the sea, watching for a sail" });
  if (intent(W, M, "explore") > 0 && !S.night && !G.some(g => g.explore)) G.push({ k: "explore", explore: true, v: 10 + intent(W, M, "explore"), why: "He wants to see the rest of the island" });
  G.push(...craftGoals(W, M, S));
  // building: whatever the designer thinks worth doing, in daylight (or a shelter he urgently needs, any time)
  for (const p of projects(W, M, toDusk)) if ((!p.s || !finished(p.s)) && (!S.night || p.v > 40)) G.push(buildGoal(W, M, p));
  // wood for tomorrow: keep the woodpile stocked when there's nothing more pressing
  const wp = woodpile(W); if (wp && (wp.kg || 0) < 25 && !S.night) G.push({ k: "stock", vars: ["stacked"], exclude: ["takeWood"], want: S => S.stacked, v: 14 + (W.litterWet < .3 ? 4 : 0) + intent(W, M, "stock"), why: "Laying in firewood while it's dry" });
  if (S.night && f.tired > .35) G.push({ k: "sleep", vars: ["rested"], want: S => S.rested, v: 40 + f.tired * 60, why: "Worn out; time to sleep" });
  // exploring serves whatever need he can't meet from what he knows: it is as urgent as that need
  const kw = knowsWater(W, M), kf = knowsFood(M), kfl = Object.values(M.mem).some(m => m.k === "flint");
  if (!kw || !kf || !kfl) {
    const v = !kw && f.thirst > .3 ? 51 + f.thirst * 70 : !kf && f.hunger > .5 ? 31 + f.hunger * 55 : 34;
    G.push({ k: "explore", explore: true, v, why: !kw && f.thirst > .3 ? "Parched, and he knows of no fresh water: searching" : !kf && f.hunger > .5 ? "Hungry and he knows of nothing to eat: searching" : !kw ? "Looking for fresh water" : !kf ? "Looking for anything to eat" : "Getting to know the island" });
  }
  M.lastG = G.map(g => g.k + ":" + dround(g.v));
  return { G, S, f };
}
function minutesToDusk(W) { for (let m = 0; m < 900; m += 10) { const ms = W.born + (W.t + m) * 60000; const s = sunElev(ms); if (s < -.05) return m; } return 900; }
import { sunAt } from "../sim/env.js";
const sunElev = ms => sunAt(ms).elev;
const knowsWater = (W, M) => { for (let i = 0; i < MW * MH; i++) if (M.known[i] && (W.ter[i] === 7 || W.ter[i] === 9)) return true; return false; };
const knowsFood = M => (M.inv.raw || 0) > 100 || (M.inv.food || 0) > 100 || Object.values(M.mem).some(m => ((m.k === "bramble" || m.k === "hazel") && m.fruit > .15) || ((m.k === "mussels" || m.k === "cockles") && m.kg > 1));

// the actions that can matter to a goal: those that change its variables, then (transitively) those that change
// what those actions need. Everything else (picking berries while planning a fire) is left out of the search.
const relCache = new Map();
export function relevant(vars, pool = ACTIONS, cache = true) {
  const key = vars.join(); if (cache && relCache.has(key)) return relCache.get(key);
  const need = new Set(vars), use = new Set(); let grew = true;
  while (grew) { grew = false; for (const n in pool) if (!use.has(n) && (pool[n].provides || pool[n].w).some(v => need.has(v))) { use.add(n); grew = true; for (const v of pool[n].r) need.add(v); } }
  const out = Object.keys(pool).filter(n => use.has(n)); if (cache) relCache.set(key, out); return out;
}
// best-first search for the cheapest sequence of actions that makes the goal true
export function plan(W, M, goal, S0) {
  const recovered=salvageActions(W,M),extra=Object.keys(recovered).length>0||goal.acts;
  const pool = extra ? Object.assign({}, ACTIONS, recovered, goal.acts) : ACTIONS, candidates = relevant(goal.vars, pool, !extra), targets = {}, costs = {};
  const available = {};
  for (const n of candidates) {
    if ((M.cool && M.cool[n] > W.t) || goal.exclude?.includes(n)) continue;
    const target = pool[n].find(W, M); if (!target) continue;
    targets[n] = target;
    const learned = M.yields?.[n], efficiency = FOOD_WORK.has(n) && learned ? Math.min(8, 600 / Math.max(75, learned.kcal)) : 1;
    costs[n] = Math.max(1, pool[n].cost(W, M, target) * efficiency); available[n] = pool[n];
  }
  // A recipe whose destination is unknown cannot supply a prerequisite. Recompute the graph after perception.
  const names = relevant(goal.vars, available, false);
  // only what he knows the goal to depend on: its own variables, then whatever the actions that change them need
  const keys = new Set(); for (const n of names) { for (const v of pool[n].r) keys.add(v); for (const v of pool[n].w) keys.add(v); }
  for (const v of goal.vars) keys.add(v);
  const S1 = {}; for (const v of [...keys].sort()) S1[v] = S0[v] ?? 0; S0 = S1;

  // best-first search with a binary heap; states are small objects keyed by their JSON
  const heap = [], push = e => { heap.push(e); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  // Keep the cheapest feasible single action as an upper bound. A search budget must not hide food in his hands.
  let direct = null, upper = Infinity;
  for (const a of names) if (pool[a].pre(S0)) {
    const state = { ...S0 }; pool[a].eff(state);
    if (goal.want(state) && costs[a] < upper) { upper = costs[a]; direct = [{ a, t: targets[a] }]; }
  }
  const seen = new Map(); push([0, 0, S0, null, 0]); seen.set(JSON.stringify(S0), 0);
  let n = 0;
  while (heap.length && n++ < 4000) {
    const [, g, S, back, depth] = pop();
    if (goal.want(S)) { const out = []; for (let b = back; b; b = b.prev) out.unshift({ a: b.a, t: targets[b.a] }); return out; }
    if (depth >= 16) continue;
    for (const a of names) {
      if (costs[a] == null || !pool[a].pre(S)) continue;
      const S2 = Object.assign({}, S); pool[a].eff(S2);
      const c = g + costs[a]; if (c >= upper) continue; const k = JSON.stringify(S2);
      if (seen.has(k) && seen.get(k) <= c) continue; seen.set(k, c);
      push([c, c, S2, { a, prev: back }, depth + 1]);
    }
  }
  return direct;
}
// explore: walk toward the nearest edge of what he knows, preferring the direction he hasn't been
function exploreStep(W, M) {
  const cx = Math.floor(M.x), cy = Math.floor(M.y); let best = -1, bd = 1e9;
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const i = y * MW + x; if (!M.known[i] || W.ter[i] <= 1 || W.ter[i] === 7 || (M.noReach && M.noReach[i])) continue;
    if (M.known[i - 1] && M.known[i + 1] && M.known[i - MW] && M.known[i + MW]) continue;   // not a frontier
    const d = dhypot(x - cx, y - cy); if (d < 4) continue; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// once a minute: carry on with the current action, or think again
export function think(W) {
  const M = W.man; if (!M || !M.B.alive) return;
  M.met = MET.stand; M.trail = [[M.x, M.y]];
  // loneliness grows when he's alone and eases with the dog at his side
  const dogNear = W.animals && W.animals.some(a => a.sp === "dog" && !a.adrift && a.trust > .4 && dhypot(a.x - M.x, a.y - M.y) < 5);
  M.lonely = Math.max(0, Math.min(1, (M.lonely || 0) + (dogNear ? -.002 : .00012)));
  if (M.say !== M.saidLast) { M.saidLast = M.say; M.sayT = W.t; }        // when he said it (words fade after a while)
  if (W.t % 60 === 0) { const c = M.windSeen || (M.windSeen = [0, 0, 0, 0, 0, 0, 0, 0]); c[W.wx.windDir | 0] += W.wx.wind; }   // he learns where the weather comes from
  const busy = M.act && M.act.st.phase;
  // reconsider when idle, when the current action ends, or every 20 minutes (something more urgent?)
  const sleeping = M.act && M.act.a === "sleep" && M.act.st.phase === "sleep";
  M.B.asleep = false;                                          // only the sleep action puts him to sleep
  const f0 = feel(M.B);
  if ((!M.act && (W.t % 5 === 0 || !M.idleSince)) || (M.act && W.t % 20 === 0 && (!sleeping || f0.thirst > .9 || f0.starving > .65))) {
    const { G, S } = goals(W, M);
    G.sort((a, b) => b.v - a.v);
    const cur = M.goal && G.find(g => g.k === M.goal.k);   // the same goal as before, freshly weighed
    let pick = null, fallback = null;
    for (const g of G) {
      if (cur && g !== cur && g.v < cur.v + (cur.v < 12 ? 0 : 15) && M.act) { pick = cur; break; }   // pastimes give way to anything real        // stick with what he's doing
      if (cur && g === cur && M.act) { pick = cur; break; }
      if (g.explore) { const i = exploreStep(W, M); if (i >= 0) { pick = g; pick.steps = [{ a: "explore", t: { tile: i, x: i % MW + .5, y: ((i / MW) | 0) + .5 } }]; break; } continue; }
      const nope = M.noPlan && M.noPlan[g.k] > W.t;
      const p = g === cur && M.plan && M.plan.length ? M.plan : nope ? null : plan(W, M, g, S);
      if (!p && !nope) (M.noPlan || (M.noPlan = {}))[g.k] = W.t + 30;
      if (p && p.length) { pick = g; pick.steps = p; break; }
      if (!fallback && g.v > 40) fallback = g;                   // can't see how yet: remember the most pressing
    }
    if (!pick && fallback) { const i = exploreStep(W, M); if (i >= 0) { pick = { k: "search:" + fallback.k, explore: true, v: fallback.v * .8, why: fallback.why + " (he doesn't know where to find what he needs yet: searching)", steps: [{ a: "explore", t: { tile: i, x: i % MW + .5, y: ((i / MW) | 0) + .5 } }] }; } }
    if (pick && (!M.goal || pick.k !== M.goal.k)) { M.goal = pick; M.plan = pick.steps; M.act = null; M.why = pick.why; }
    else if (pick) { M.why = pick.why; if (!M.act) M.plan = pick.steps; }
    if (!pick && !M.act) { M.idleSince = W.t; M.goal = null; M.why = S.fire === 2 ? "Resting by the fire" : "Catching his breath"; M.pose = "sit"; M.met = MET.sit; return; }
  }
  if (!M.act && M.plan && M.plan.length) { const s = M.plan[0]; M.act = { a: s.a, t: s.t, st: {}, supply: (M.inv.raw || 0) + (M.inv.food || 0), begun: W.t }; M.doing = s.a === "warmUp" && s.t.key === "shelter" ? "Warming up in the shelter" : LABEL[s.a] || (s.a.startsWith("build_") ? "Building the " + (s.t.d?.label||W.structs.find(q=>q.id===s.t.sid)?.label||FAMILIES[s.a.slice(6)].label) : s.a.startsWith('salvage_')?'Recovering useful materials':s.a); }
  if (!M.act) return;
  const A = ACTIONS[M.act.a] || (M.act.a.startsWith("build_") ? { exec: (W, M, t, st) => { if (t.d) { const n = place(W, t.d); if (W.camp == null && FAMILIES[n.k].shelter) W.camp = idx(Math.floor(n.x + DIRV[n.dir][0]), Math.floor(n.y + DIRV[n.dir][1])); t.sid = n.id; delete t.d; M.projCache = null; } return buildExec(W, M, t, st); } } : null);
  const r = M.act.a === "explore" ? exploreExec(W, M, M.act.t, M.act.st) : M.act.a.startsWith('salvage_')?ACTIONS.salvagePart.exec(W,M,M.act.t,M.act.st):A ? A.exec(W, M, M.act.t, M.act.st) : "fail";
  if ((r === "done" || r === "fail") && FOOD_WORK.has(M.act.a) && M.act.supply != null) {
    const got = Math.max(0, (M.inv.raw || 0) + (M.inv.food || 0) - M.act.supply), elapsed = Math.max(1, W.t - M.act.begun);
    M.yields ||= {}; const old = M.yields[M.act.a];
    M.yields[M.act.a] = { kcal: old ? old.kcal * .65 + got * .35 : got, minutes: old ? old.minutes * .65 + elapsed * .35 : elapsed };
  }
  if (r === "done") { M.plan.shift(); M.act = null; if (!M.plan.length) { M.goal = null; M.idleSince = 0; } }   // finished: think again straight away
  else if (r === "fail") { M.idleSince = 0; M.log.push([W.t, "failed", M.act.a]); (M.cool || (M.cool = {}))[M.act.a] = W.t + (COOL[M.act.a] || 10); M.act = null; M.plan = null; M.goal = null; }
}
function exploreExec(W, M, t, st) {
  if (!st.phase) { st.phase = "go"; if (!goTo(W, M, t.tile, false)) { (M.noReach || (M.noReach = {}))[t.tile] = 1; return "fail"; } }
  M.pose = "walk"; M.met = MET.walk;
  return walk(W, M) ? "done" : "go";
}
// after a failure he leaves that thing alone for a while (blistered hands, a branch that was gone)
const COOL = { lightFire: 45, gatherKindling: 15, gatherFuel: 10 };
export const LABEL = { repairPart: "Replacing a damaged part", twistCord: "Twisting bark cordage", weaveBasket: "Weaving a basket", makeLine: "Making a fishing line", haftAxe: "Hafting a stone axe", weaveWrap: "Weaving a warm cape", shapeClay: "Shaping a clay pot", fireClay: "Firing his clay pot", lineFish: "Fishing with his handmade line", repairHome: "Repairing his home", storeFood: "Putting food in his store", takeStored: "Fetching stored food", dryFood: "Drying food over the hearth", collectQuarry: "Collecting Nell's catch", drinkCollected: "Drinking collected rainwater", drink: "Drinking", forage: "Picking berries", eat: "Eating", gatherTinder: "Gathering tinder", gatherKindling: "Gathering dead sticks", gatherFuel: "Collecting firewood", knapFlake: "Knapping flint", makeDrill: "Carving a fire drill", layFire: "Laying a fire", lightFire: "Making fire with the hand drill", shelterFromRain: "Sheltering from the rain", rest: "Resting", stackWood: "Stacking the woodpile", takeWood: "Taking wood from the pile", splitKindling: "Splitting dry kindling", eatRaw: "Eating it raw", checkSnares: "Checking the snares", wave: "Waving at the ship", watchSea: "Watching the sea", lightSignal: "Lighting the signal fire", feedDog: "Throwing the dog some food", shellfish: "Gathering shellfish", checkTrap: "Lifting the fish trap", cook: "Cooking", makePot: "Making a bark pot", boilWater: "Boiling water", drinkBoiled: "Drinking boiled water", get_poles: "Dragging in poles", get_bracken: "Cutting bracken", get_boughs: "Breaking off pine boughs", get_stones: "Carrying stones", get_withies: "Cutting withies", get_debris: "Gathering leaf litter", get_mud: "Digging mud", get_reeds: "Cutting reeds", feedFire: "Feeding the fire", warmUp: "Warming up by the fire", sleep: "Sleeping", explore: "Exploring" };
