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
import { clamp } from "../core/dmath.js";

// what he believes his situation to be, simplified for planning
function situation(W, M) {
  const inv = M.inv, fireM = Object.entries(M.mem).find(([k, m]) => k.startsWith("fire") && m.lit);
  const S = { food: Math.round(inv.food || 0), tinder: +(inv.tinder || 0).toFixed(2), kindling: +(inv.kindling || 0).toFixed(1), fuel: +(inv.fuel || 0).toFixed(1),
    flake: inv.flake ? 1 : 0, drill: inv.drill ? 1 : 0, fire: fireM ? 2 : 0, fireFuel: fireM ? +(fireM[1].fuelKg || 0).toFixed(1) : 0,
    fed: 0, watered: 0, warm: 0, rested: 0, rest: 0, dry: 0, stageDone: 0, stacked: 0, laid: 0, embers: 0, dogFed: 0, signalled: 0, raw: Math.round(inv.raw || 0), pot: inv.pot ? 1 : 0, clean: +(inv.clean || 0).toFixed(1), night: W.wx.elev < -.05 ? 1 : 0, rain: W.wx.rain > .3 ? 1 : 0 };
  for (const m of MATS) S[m] = Math.round(inv[m] || 0);
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
  const p = sh ? { rain: Math.max(cur.rain, sh.rain || 0), wind: Math.max(cur.wind, sh.wind || 0), bed: Math.max(cur.bed, sh.bed || 0), fire: Math.min(cur.fire, sh.fire ?? 1), reflect: Math.max(cur.reflect, sh.reflect || 0) } : cur;
  const airT = Math.min(W.wx.temp, cl.tmean - cl.trange * .45), wind = W.wx.wind, fireW = withFire ? 90 * p.fire * (1 + p.reflect) : 0, rain = W.wx.rain > 0 ? W.wx.rain : 0;
  B.asleep = true; let min = B.core;
  for (let m = 0; m < 480; m += 5) { for (let k = 0; k < 5; k++) bodyStep(B, { met: MET.sleep, airT, wind, windBlock: p.wind, rain, rainBlock: p.rain, sun: 0, fireW, lying: true, bedding: p.bed }); min = Math.min(min, B.core); if (!B.alive) break; }
  return min;
}
// what he could build next, and how much each would be worth to him: the designer proposes, prediction weighs
function projects(W, M, toDusk) {
  const sig = W.structs.map(q => q.k + q.stage).join();
  if (M.projCache && W.t - M.projCache.t < 60 && M.projCache.sig === sig) return M.projCache.list;
  const b = brief(W, M), campT = camp(W, M).tile, list = [], base = predictNight(W, M, false), baseF = predictNight(W, M, true);
  const hasFire = W.fires.length > 0 || W.camp != null;
  const worth = (fam, s) => {
    const F = FAMILIES[fam];
    if (F.shelter) {   // how much warmer would tonight be once this stage (or the usable shell) is up?
      const next = Object.assign({}, s, { stage: s.stage + 1, prog: 0 }), p = propsOf(next);
      const gain = Math.max(predictNight(W, M, false, p) - base, (predictNight(W, M, true, p) - baseF) * .7);
      return gain > .05 ? 20 + Math.min(30, gain * 16) + (toDusk > 0 && toDusk < 240 && gain > .3 ? 12 : 0) : 12 + (p.rain - (s.props?.rain || 0)) * 8;
    }
    if (fam === "fireRing") return hasFire ? 19 : 0;
    if (fam === "reflector") { const gain = predictNight(W, M, true, { reflect: .6 }) - baseF; return bestShelter(W) && hasFire ? 16 + Math.min(12, gain * 12) : 0; }
    if (fam === "fishTrap") return hasFire && W.structs.some(q => FAMILIES[q.k].shelter && finished(q)) ? 16 + (M.B.glyco < 800 ? 6 : 0) : 0;   // food that comes to him, once he has a home
    if (fam === "signal") return M.log.some(l => l[1] === "ship") ? 30 : 0;           // after the first ship went by, never again unready
    if (fam === "snare") return Object.values(M.mem).some(m => m.k === "warren") && hasFire && W.structs.filter(q => q.k === "snare").length < 3 ? 15 + (M.B.glyco < 800 ? 6 : 0) : 0;
    if (fam === "woodpile") return bestShelter(W) ? 18 + (W.litterWet > .35 ? 5 : 0) : 0;
    return 0;
  };
  // carry on with what's half built
  for (const s of W.structs) if (!finished(s)) { const st = s.stages[s.stage]; if (feasible(b, st)) list.push({ s, v: worth(s.k, s) + 4 }); }
  // or start something new he's able to make and has reason for (one of each, and a better shelter than he has)
  for (const fam in FAMILIES) {
    const F = FAMILIES[fam]; if (M.skill.build < F.minSkill || W.structs.filter(s => s.k === fam).length >= (fam === "snare" ? 3 : 1)) continue;
    if (F.shelter && W.structs.some(s => FAMILIES[s.k].shelter && !finished(s))) continue;
    const d = design(W, M, fam, campT); if (!d || !feasible(b, d.stages[0])) continue;
    // a new shelter is weighed by what the whole usable shell would do
    let v; if (F.shelter) { const full = Object.assign({}, d, { stage: d.stages.findIndex(q => q.name === "bed") > 0 ? d.stages.findIndex(q => q.name === "bed") - 1 : d.stages.length - 1 }); v = worth(fam, full) - d.stages.reduce((a, q) => a + q.mins, 0) / 120; }
    else v = worth(fam, d);
    if (v > 10) list.push({ d, v });
  }
  M.projCache = { t: W.t, sig, list }; return list;
}
function buildGoal(W, M, p) {
  const s = p.s, st = s ? s.stages[s.stage] : p.d.stages[0], k = s ? s.k : p.d.k, need = stillNeeds(s, st), mats = Object.keys(need);
  const tgt = s ? { sid: s.id, tile: idx(Math.floor(s.x), Math.floor(s.y)), x: s.x, y: s.y } : { d: p.d, tile: p.d.tile, x: p.d.x, y: p.d.y };
  const act = { r: [...mats, "stageDone"], w: ["stageDone", ...mats], find: () => tgt, pre: S => !S.stageDone && mats.every(m => S[m] >= need[m]), eff: S => { S.stageDone = 1; for (const m of mats) S[m] -= need[m]; },
    cost: (W, M, t) => walkMin(M, t) + st.mins };
  const what = FAMILIES[k].label, why = s ? `Working on the ${what}: the ${st.name}` : `A ${what} would help: ${st.say ? st.say.split(".")[0].toLowerCase() : "time to start"}`;
  return { k: "build:" + (s ? s.id : k) + ":" + (s ? s.stage : 0), vars: ["stageDone"], want: S => S.stageDone, acts: { ["build_" + k]: act }, v: p.v, why };
}
function goals(W, M) {
  const f = feel(M.B), S = situation(W, M), G = [], x = W.wx, C = cal(W.born, W.t);
  const toDusk = x.elev > -.05 ? minutesToDusk(W) : 0;
  if (f.thirst > .3) G.push({ k: "water", vars: ["watered"], want: S => S.watered, v: 50 + f.thirst * 70, why: f.thirst > .7 ? "Parched" : "Thirsty" });
  if (f.hunger > .5 && (S.food > 100 || knowsFood(M))) G.push({ k: "food", vars: ["fed"], want: S => S.fed, v: 30 + f.hunger * 55, why: f.hunger > .85 ? "Weak with hunger" : "Hungry" });
  if ((M.B.core < 36.4 || (M.B.wet > .5 && x.temp < 12)) && S.fire === 2) G.push({ k: "warm", vars: ["warm"], want: S => S.warm, v: 60 + f.cold * 60, why: M.B.wet > .5 ? "Soaked and cold; he needs to dry out by the fire" : "Cold to the bone" });
  // tonight: would a night without fire chill him dangerously? then a lit fire with fuel for the night, by dusk
  const needFuel = 6;
  if (!(S.fire === 2 && S.fireFuel >= needFuel)) {
    const pmin = M.predCache && W.t - M.predCache[0] < 60 ? M.predCache[1] : (M.predCache = [W.t, predictNight(W, M, false)])[1];
    if (pmin < 36.1) G.push({ k: "fire", vars: ["fire", "fireFuel"], want: S => S.fire === 2 && S.fireFuel >= needFuel, v: 45 + (36.3 - pmin) * 25 + (toDusk < 180 ? 25 : 0), why: `A night without a fire would chill him to ${pmin.toFixed(1)}°C` });
  }
  // an evening fire: warmth, dry clothes, light, and the comfort of it. Wanted every evening he has none going
  if (S.fire !== 2 && !S.night && toDusk < 300 && !G.some(g => g.k === "fire")) {
    const eg = M.eveCache && W.t - M.eveCache[0] < 60 ? M.eveCache[1] : (M.eveCache = [W.t, predictNight(W, M, true) - predictNight(W, M, false)])[1];
    G.push({ k: "fire", vars: ["fire", "fireFuel"], want: S => S.fire === 2 && S.fireFuel >= 4, v: 30 + Math.min(20, eg * 20) + M.B.wet * 10, why: M.B.wet > .4 ? "Wet through: he wants a fire to dry out by tonight" : "A fire for the evening, before the light goes" });
  }
  // clean water: once he's come to distrust the water here, a pot to boil it in, and boiled water kept by him
  const wRisk = Math.max(0, ...Object.entries(M.belief || {}).filter(([k]) => k.startsWith("water:")).map(([, v]) => v));
  if (wRisk > .3 && !S.night) {
    if (!S.pot) G.push({ k: "pot", vars: ["pot"], want: S => S.pot, v: 20 + wRisk * 20, why: "The water made him ill. He wants a pot to boil it in" });
    else if (S.clean < 1 && S.fire === 2) G.push({ k: "boil", vars: ["clean"], want: S => S.clean >= 1.5, v: 16 + wRisk * 30, why: "Boiling water to keep by him" });
  }
  // a ship: nothing else matters while it's in sight
  if (M.mem.ship && W.t - M.mem.ship.t < 20 && W.ships.some(q => q.id === M.mem.ship.id)) G.push({ k: "ship:" + M.mem.ship.id, vars: ["signalled"], want: S => S.signalled, v: 200, why: `A ship! A ${M.mem.ship.kind}, out past the reefs` });
  // the dog: he wants it to trust him, all the more the lonelier he is; food is the way
  const dg = M.mem.dog;
  if (dg && W.t - dg.t < 180 && ((dg.trust ?? 0) < .85 || dg.thin) && !S.night && (S.food >= 150 || S.raw >= 150) && f.hunger < .45)
    G.push({ k: "dog", vars: ["dogFed"], want: S => S.dogFed, v: 16 + (M.lonely || 0) * 25, why: dg.thin && (dg.trust ?? 0) >= .85 ? `${dg.name} is all ribs. He shares what he has` : (dg.trust ?? 0) < .3 ? `The ship's dog, ${dg.name}. Thin and wary. He wants it to trust him` : `${dg.name} is coming round. A bit of food, and a quiet word` });
  const roof = shelterAt(W, M.x, M.y).rain;
  if (x.rain > .8 && roof < .5 && M.B.wet > .4) G.push({ k: "dry", vars: ["dry"], want: S => S.dry, v: 45 + x.rain * 8, why: "Getting out of the rain" });
  if (f.weary > .75 && !S.night) G.push({ k: "rest", vars: ["rest"], want: S => S.rest, v: 20 + f.weary * 40, why: "Worn out; he has to sit a while" });
  // building: whatever the designer thinks worth doing, in daylight (or a shelter he urgently needs, any time)
  for (const p of projects(W, M, toDusk)) if ((!p.s || !finished(p.s)) && (!S.night || p.v > 40)) G.push(buildGoal(W, M, p));
  // wood for tomorrow: keep the woodpile stocked when there's nothing more pressing
  const wp = woodpile(W); if (wp && (wp.kg || 0) < 25 && !S.night) G.push({ k: "stock", vars: ["stacked"], exclude: ["takeWood"], want: S => S.stacked, v: 14 + (W.litterWet < .3 ? 4 : 0), why: "Laying in firewood while it's dry" });
  if (S.night && f.tired > .35) G.push({ k: "sleep", vars: ["rested"], want: S => S.rested, v: 40 + f.tired * 60, why: "Worn out; time to sleep" });
  // exploring serves whatever need he can't meet from what he knows: it is as urgent as that need
  const kw = knowsWater(W, M), kf = knowsFood(M), kfl = Object.values(M.mem).some(m => m.k === "flint");
  if (!kw || !kf || !kfl) {
    const v = !kw && f.thirst > .3 ? 51 + f.thirst * 70 : !kf && f.hunger > .5 ? 31 + f.hunger * 55 : 34;
    G.push({ k: "explore", explore: true, v, why: !kw && f.thirst > .3 ? "Parched, and he knows of no fresh water: searching" : !kf && f.hunger > .5 ? "Hungry and he knows of nothing to eat: searching" : !kw ? "Looking for fresh water" : !kf ? "Looking for anything to eat" : "Getting to know the island" });
  }
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
  while (grew) { grew = false; for (const n in pool) if (!use.has(n) && pool[n].w.some(v => need.has(v))) { use.add(n); grew = true; for (const v of pool[n].r) need.add(v); } }
  const out = Object.keys(pool).filter(n => use.has(n)); if (cache) relCache.set(key, out); return out;
}
// best-first search for the cheapest sequence of actions that makes the goal true
export function plan(W, M, goal, S0) {
  const pool = goal.acts ? Object.assign({}, ACTIONS, goal.acts) : ACTIONS, names = relevant(goal.vars, pool, !goal.acts), targets = {}, costs = {};
  // only what he knows the goal to depend on: its own variables, then whatever the actions that change them need
  const keys = new Set(); for (const n of names) { for (const v of pool[n].r) keys.add(v); for (const v of pool[n].w) keys.add(v); }
  for (const v of goal.vars) keys.add(v);
  const S1 = {}; for (const v of [...keys].sort()) S1[v] = S0[v] ?? 0; S0 = S1;
  for (const n of names) { if ((M.cool && M.cool[n] > W.t) || (goal.exclude && goal.exclude.includes(n))) continue; targets[n] = pool[n].find(W, M); if (targets[n]) costs[n] = Math.max(1, pool[n].cost(W, M, targets[n])); }
  // best-first search with a binary heap; states are small objects keyed by their JSON
  const heap = [], push = e => { heap.push(e); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  const seen = new Map(); push([0, 0, S0, null, 0]); seen.set(JSON.stringify(S0), 0);
  let n = 0;
  while (heap.length && n++ < 4000) {
    const [, g, S, back, depth] = pop();
    if (goal.want(S)) { const out = []; for (let b = back; b; b = b.prev) out.unshift({ a: b.a, t: targets[b.a] }); return out; }
    if (depth >= 16) continue;
    for (const a of names) {
      if (costs[a] == null || !pool[a].pre(S)) continue;
      const S2 = Object.assign({}, S); pool[a].eff(S2);
      const c = g + costs[a], k = JSON.stringify(S2);
      if (seen.has(k) && seen.get(k) <= c) continue; seen.set(k, c);
      push([c, c, S2, { a, prev: back }, depth + 1]);
    }
  }
  return null;
}
// explore: walk toward the nearest edge of what he knows, preferring the direction he hasn't been
function exploreStep(W, M) {
  const cx = Math.floor(M.x), cy = Math.floor(M.y); let best = -1, bd = 1e9;
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const i = y * MW + x; if (!M.known[i] || W.ter[i] <= 1 || W.ter[i] === 7 || (M.noReach && M.noReach[i])) continue;
    if (M.known[i - 1] && M.known[i + 1] && M.known[i - MW] && M.known[i + MW]) continue;   // not a frontier
    const d = Math.hypot(x - cx, y - cy); if (d < 4) continue; if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// once a minute: carry on with the current action, or think again
export function think(W) {
  const M = W.man; if (!M || !M.B.alive) return;
  M.met = MET.stand; M.trail = [[M.x, M.y]];
  // loneliness grows when he's alone and eases with the dog at his side
  const dogNear = W.animals && W.animals.some(a => a.sp === "dog" && !a.adrift && a.trust > .4 && Math.hypot(a.x - M.x, a.y - M.y) < 5);
  M.lonely = Math.max(0, Math.min(1, (M.lonely || 0) + (dogNear ? -.002 : .00012)));
  if (M.say !== M.saidLast) { M.saidLast = M.say; M.sayT = W.t; }        // when he said it (words fade after a while)
  if (W.t % 60 === 0) { const c = M.windSeen || (M.windSeen = [0, 0, 0, 0, 0, 0, 0, 0]); c[W.wx.windDir | 0] += W.wx.wind; }   // he learns where the weather comes from
  const busy = M.act && M.act.st.phase;
  // reconsider when idle, when the current action ends, or every 20 minutes (something more urgent?)
  const sleeping = M.act && M.act.a === "sleep" && M.act.st.phase === "sleep";
  M.B.asleep = false;                                          // only the sleep action puts him to sleep
  const f0 = feel(M.B);
  if ((!M.act && (W.t % 5 === 0 || !M.idleSince)) || (M.act && W.t % 20 === 0 && (!sleeping || f0.thirst > .9))) {
    const { G, S } = goals(W, M);
    G.sort((a, b) => b.v - a.v);
    const cur = M.goal && G.find(g => g.k === M.goal.k);   // the same goal as before, freshly weighed
    let pick = null, fallback = null;
    for (const g of G) {
      if (cur && g !== cur && g.v < cur.v + 15 && M.act) { pick = cur; break; }        // stick with what he's doing
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
  if (!M.act && M.plan && M.plan.length) { const s = M.plan[0]; M.act = { a: s.a, t: s.t, st: {} }; M.doing = LABEL[s.a] || (s.a.startsWith("build_") ? "Building the " + FAMILIES[s.a.slice(6)].label : s.a); }
  if (!M.act) return;
  const A = ACTIONS[M.act.a] || (M.act.a.startsWith("build_") ? { exec: (W, M, t, st) => { if (t.d) { const n = place(W, t.d); if (W.camp == null && FAMILIES[n.k].shelter) W.camp = idx(Math.floor(n.x + DIRV[n.dir][0]), Math.floor(n.y + DIRV[n.dir][1])); t.sid = n.id; delete t.d; M.projCache = null; } return buildExec(W, M, t, st); } } : null);
  const r = M.act.a === "explore" ? exploreExec(W, M, M.act.t, M.act.st) : A ? A.exec(W, M, M.act.t, M.act.st) : "fail";
  if (r === "done") { M.plan.shift(); M.act = null; if (!M.plan.length) M.goal = null; }
  else if (r === "fail") { M.log.push([W.t, "failed", M.act.a]); (M.cool || (M.cool = {}))[M.act.a] = W.t + (COOL[M.act.a] || 10); M.act = null; M.plan = null; M.goal = null; }
}
function exploreExec(W, M, t, st) {
  if (!st.phase) { st.phase = "go"; if (!goTo(W, M, t.tile, false)) { (M.noReach || (M.noReach = {}))[t.tile] = 1; return "fail"; } }
  M.pose = "walk"; M.met = MET.walk;
  return walk(W, M) ? "done" : "go";
}
// after a failure he leaves that thing alone for a while (blistered hands, a branch that was gone)
const COOL = { lightFire: 45, gatherKindling: 15, gatherFuel: 10 };
export const LABEL = { drink: "Drinking", forage: "Picking berries", eat: "Eating", gatherTinder: "Gathering tinder", gatherKindling: "Gathering dead sticks", gatherFuel: "Collecting firewood", knapFlake: "Knapping flint", makeDrill: "Carving a fire drill", layFire: "Laying a fire", lightFire: "Making fire with the hand drill", shelterFromRain: "Sheltering from the rain", rest: "Resting", stackWood: "Stacking the woodpile", takeWood: "Taking wood from the pile", splitKindling: "Splitting dry kindling", eatRaw: "Eating it raw", checkSnares: "Checking the snares", wave: "Waving at the ship", lightSignal: "Lighting the signal fire", feedDog: "Throwing the dog some food", shellfish: "Gathering shellfish", checkTrap: "Lifting the fish trap", cook: "Cooking", makePot: "Making a bark pot", boilWater: "Boiling water", drinkBoiled: "Drinking boiled water", get_poles: "Dragging in poles", get_bracken: "Cutting bracken", get_boughs: "Breaking off pine boughs", get_stones: "Carrying stones", get_withies: "Cutting withies", get_debris: "Gathering leaf litter", get_mud: "Digging mud", get_reeds: "Cutting reeds", feedFire: "Feeding the fire", warmUp: "Warming up by the fire", sleep: "Sleeping", explore: "Exploring" };
