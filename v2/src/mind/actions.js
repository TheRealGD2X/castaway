// What he knows how to do. Each action has two faces:
//  * for planning: when it's possible (pre), what it changes (eff) in his simplified picture of his situation, and
//    what it costs in minutes, including the walk to the nearest place he KNOWS of (from memory, not the truth);
//  * for doing: the physical steps in the world, minute by minute (exec), which can fail (the branch he remembered
//    is gone, the drill won't take, the tinder's damp), and then he rethinks.
import { MW, MH, idx, T } from "../world/gen.js";
import { here, goTo, walk } from "../sim/man.js";
import { newFire, addFuel, ignite } from "../sim/fire.js";
import { MET } from "../sim/body.js";
import { eat as bodyEat, drink as bodyDrink } from "../sim/body.js";
import { FRUIT } from "../sim/eco.js";
import { clamp, dexp } from "../core/dmath.js";
import { expose, hazard } from "../sim/health.js";
import { SHELL, lowIn } from "../sim/shore.js";
import { FISH } from "../sim/fish.js";
import { MATS, MATERIALS, bestShelter, propsOf, woodpile, work as buildWork, finished, FAMILIES, fireRingAt } from "../build/build.js";

const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) * 2;           // metres
export const walkMin = (M, p) => d2(M, p) * 1.25 / 72;                 // rough minutes to walk there
// nearest remembered thing matching f
function nearestMem(M, f) { let best = null, bd = 1e9; for (const k in M.mem) { const m = M.mem[k]; if (!f(m, k)) continue; const d = d2(M, m); if (d < bd) { bd = d; best = Object.assign({ key: k }, m); } } return best; }
function nearestKnownTile(W, M, f, rmax = 60) { const cx = Math.floor(M.x), cy = Math.floor(M.y); let best = -1, bd = 1e9; for (let y = Math.max(0, cy - rmax); y < Math.min(W.MH, cy + rmax); y++) for (let x = Math.max(0, cx - rmax); x < Math.min(MW, cx + rmax); x++) { const i = y * MW + x; if (!M.known[i] || !f(i)) continue; const d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; best = i; } } return best; }
const tileXY = i => ({ x: i % MW + .5, y: ((i / MW) | 0) + .5 });
export const deadFuelMoist = W => W.litterWet;                      // how damp dead wood and grass are right now

// ------------------------------------------------------------ the actions
export const ACTIONS = {
  drink: {
    r: [], w: ["watered"],
    // the nearest fresh water, weighed by how much he's come to distrust each kind
    find: (W, M) => { let best = null, bc = 1e9; for (const [tt, src] of [[T.STREAM, "stream"], [T.LAKE, "lake"], [T.MARSH, "marsh"]]) { const i = nearestKnownTile(W, M, j => W.ter[j] === tt); if (i < 0) continue; const t = { tile: i, ...tileXY(i), src }, c = walkMin(M, t) + riskMin(M, "water:" + src); if (c < bc) { bc = c; best = t; } } return best; },
    pre: S => true, eff: S => { S.watered = 1; }, cost: (W, M, t) => walkMin(M, t) + 3 + riskMin(M, "water:" + t.src),
    exec: work({ adjacent: true, mins: 3, met: MET.stand, pose: "drink", done: (W, M, t) => { const L = Math.max(.3, M.B.waterDef + .2); bodyDrink(M.B, L); expose(W, M, W.water[t.src || "stream"] * L, "water:" + (t.src || "stream")); } }),
    say: "Water first.",
  },
  forage: {
    r: ["food"], w: ["food"],
    find: (W, M) => nearestMem(M, m => FRUIT[m.k] && FRUIT[m.k].kcal > 0 && m.fruit > .15),
    pre: S => S.food < 1500, eff: S => { S.food += 700; }, cost: (W, M, t) => walkMin(M, t) + 25,
    exec: work({ adjacent: true, mins: 25, met: MET.gather, pose: "pick", tick: (W, M, t) => { const e = W.ents.find(q => q.id === +t.key.slice(1)); if (!e || e.fruit <= .01) { if (M.mem[t.key]) M.mem[t.key].fruit = 0; return (M.inv.food || 0) > 150 ? "done" : "fail"; } const F = FRUIT[e.k], take = Math.min(e.fruit, .02); e.fruit -= take; addFood(M, F.kcal * take, .0005, "berries"); } }),
    say: "Something to eat, at least.",
  },
  eat: {
    r: ["food"], w: ["fed","food"],
    find: () => ({ x: null }), pre: S => S.food > 100, eff: S => { S.fed = 1; S.food = Math.max(0, S.food - 900); }, cost: () => 10,
    exec: work({ here: true, mins: 10, met: MET.sit, pose: "eat", done: (W, M) => {
      let k = Math.min(M.inv.food || 0, Math.max(300, 1600 - M.B.glyco));
      // the dog watching every mouthful: if it's thin or still wary, a share goes its way
      const dog = W.animals.find(a => a.sp === "dog" && !a.adrift && !a.dead && Math.hypot(a.x - M.x, a.y - M.y) < 5);
      if (dog && (dog.E < .35 || dog.trust < .85) && k > 200) { const share = Math.round(k * (dog.E < .2 ? .35 : .2)); k -= share; M.inv.food -= share; W.items.push({ id: W.nextId++, k: "scraps", t: W.t, x: M.x + (dog.x - M.x) * .5, y: M.y + (dog.y - M.y) * .5, kcal: share, from: "man" }); M.log.push([W.t, "fed dog"]); }
      M.inv.food -= k; bodyEat(M.B, k); expose(W, M, (M.foodLoad || 0) * k, M.foodWhat || "food"); } }),
  },
  // raw shellfish or fish, eaten without cooking: only when he's desperate (he knows it's risky, and learns how much)
  eatRaw: {
    r: ["raw"], w: ["fed", "raw"],
    find: () => ({ x: null }), pre: S => S.raw > 100, eff: S => { S.fed = 1; S.raw = Math.max(0, S.raw - 900); }, cost: (W, M) => 15 + riskMin(M, "raw " + (M.rawWhat || "shellfish"), .5),
    exec: work({ here: true, mins: 15, met: MET.sit, pose: "eat", done: (W, M) => { const k = Math.min(M.inv.raw || 0, 1200); M.inv.raw -= k; bodyEat(M.B, k); expose(W, M, (M.rawLoad || 0) * k, "raw " + (M.rawWhat || "shellfish")); } }),
  },
  // down to the shore when the tide is out: mussels off the stones, cockles raked from the sand
  shellfish: {
    r: ["raw"], w: ["raw"],
    find: (W, M) => { let best = null, bc = 1e9; for (const k in M.mem) { const m = M.mem[k]; if (k[0] !== "s" || m.kg < 1) continue; const wait = lowIn(W, m.depth); if (wait == null) continue; const t = Object.assign({ key: k }, m), c = Math.max(walkMin(M, t), wait) + walkMin(M, t) * .2; if (c < bc) { bc = c; best = t; } } return best; },
    pre: S => S.raw < 2000, eff: S => { S.raw += 700; }, cost: (W, M, t) => Math.max(walkMin(M, t), lowIn(W, t.depth) ?? 999) + 30,
    exec: shellfishExec, say: "Low water. Mussels on the stones, as many as I can carry.",
  },
  // lift the fish trap: whatever swam in since he last looked
  checkTrap: {
    r: ["raw"], w: ["raw"],
    find: (W, M) => { const s = W.structs.find(q => q.k === "fishTrap" && q.stage >= q.stages.length && W.t - (q.checked ?? q.started) > 480); return s ? { x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), key: "trap", sid: s.id } : null; },
    pre: S => S.raw < 2000, eff: S => { S.raw += 500; }, cost: (W, M, t) => walkMin(M, t) + 10,
    exec: work({ adjacent: true, mins: 10, met: MET.gather, pose: "crouch", done: (W, M, t) => { const s = W.structs.find(q => q.id === t.sid); if (!s) return "fail"; s.checked = W.t; const n = s.fish || 0; s.fish = 0; if (!n) { M.say = "Empty. Next time."; return; } addRaw(M, n * FISH.kcal, W.water.stream * .004, "fish"); M.log.push([W.t, "fish", n]); M.say = n > 1 ? `${n} trout in the trap!` : "A trout. Supper."; } }),
  },
  // go round the snares: a rabbit in one is meat; reset it
  checkSnares: {
    r: ["raw"], w: ["raw"],
    find: (W, M) => { const s = W.structs.find(q => q.k === "snare" && q.stage >= 1 && W.t - (q.checked ?? q.started) > 600); return s ? { x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), key: "snare", sid: s.id } : null; },
    pre: S => S.raw < 2000, eff: S => { S.raw += 300; }, cost: (W, M, t) => walkMin(M, t) + 5,
    exec: work({ adjacent: true, mins: 5, met: MET.gather, pose: "crouch", done: (W, M, t) => { const s = W.structs.find(q => q.id === t.sid); if (!s) return "fail"; s.checked = W.t; if (!s.caught) { M.say = "Nothing. The noose is still set."; return; } s.caught = 0; addRaw(M, 1100, W.water.stream * .01, "rabbit"); M.log.push([W.t, "rabbit"]); M.say = "A rabbit in the snare. Meat."; } }),
  },
  // an hour on the highest ground he knows near the sea, looking out
  watchSea: {
    r: [], w: ["watched"],
    find: (W, M) => { let best = -1, bh = -1; for (let i = MW; i < MW * (MH - 1); i++) { if (!M.known[i] || W.dsea[i] > 4 || W.dsea[i] < 1 || W.treeAt[i] || W.ter[i] === T.WOOD) continue; const h = W.h[i] - Math.hypot(i % MW - M.x, (i / MW | 0) - M.y) * .004; if (h > bh) { bh = h; best = i; } } return best < 0 ? null : { tile: best, ...tileXY(best) }; },
    pre: S => !S.watched, eff: S => { S.watched = 1; }, cost: (W, M, t) => walkMin(M, t) + 60,
    exec: work({ adjacent: false, mins: 60, met: MET.sit, pose: "sit", tick: (W, M) => { M.lastWatch = W.t; } }),
  },
  // a ship! down to the shore on that side, waving, shouting, while it's in sight
  wave: {
    r: [], w: ["signalled"],
    find: (W, M) => { const sh = M.mem.ship; if (!sh) return null; const side = sh.side, i = nearestKnownTile(W, M, j => W.dsea[j] === 1 && (side === 0 ? (j / MW | 0) < MH * .4 : side === 1 ? j % MW > MW * .6 : side === 2 ? (j / MW | 0) > MH * .6 : j % MW < MW * .4), 80); return i < 0 ? null : { tile: i, ...tileXY(i), side }; },
    pre: S => true, eff: S => { S.signalled = 1; }, cost: (W, M, t) => walkMin(M, t) * .6 + 5,
    exec: (W, M, t, st) => {
      if (!st.phase) { st.phase = "go"; if (!goTo(W, M, t.tile, false)) return "fail"; }
      if (st.phase === "go") { M.pose = "walk"; M.met = MET.run; if (walk(W, M, 1.6)) { st.phase = "wave"; st.left = 40; } return "go"; }
      const sh = W.ships.find(q => q.id === M.mem.ship?.id);
      M.pose = "wave"; M.met = MET.stand * 1.5; M.say = "HERE! HEY! OVER HERE!";
      if (!sh || --st.left <= 0) { M.say = sh ? "They can't see me. They can't see me." : "Gone. Just... gone."; M.log.push([W.t, "ship gone"]); return "done"; }
      return "work";
    },
  },
  // light the beacon: a brand from the camp fire carried up to it
  lightSignal: {
    r: ["fire"], w: ["signalled"],
    find: (W, M) => { const s = W.structs.find(q => q.k === "signal" && q.stage >= 2); return s && M.mem.ship ? { x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), sid: s.id } : null; },
    pre: S => S.fire === 2, eff: S => { S.signalled = 1; }, cost: (W, M, t) => walkMin(M, t) + 8,
    exec: (W, M, t, st) => {
      const camp = W.fires.find(f => f.lit || f.embers > .05);
      if (!st.phase) { if (!camp) return "fail"; st.phase = "brand"; if (!goTo(W, M, idx(Math.floor(camp.x), Math.floor(camp.y)), true)) return "fail"; }
      if (st.phase === "brand") { M.pose = "walk"; M.met = MET.run; if (walk(W, M, 1.5)) { st.phase = "run"; if (!goTo(W, M, t.tile, true)) return "fail"; M.say = "A brand from the fire. Run."; } return "go"; }
      if (st.phase === "run") { M.pose = "walk"; M.met = MET.run; if (walk(W, M, 1.5)) st.phase = "light"; return "go"; }
      const s = W.structs.find(q => q.id === t.sid); if (!s) return "fail";
      let F = newFire(s.x, s.y); F.id = W.nextId++; F.signal = 1; addFuel(F, "tinder", .3, .1); addFuel(F, "kindling", 3, .15); addFuel(F, "logs", 10, .45); ignite(F, 1); F.fuel.kindling[2] = .4; W.fires.push(F);
      W.structs.splice(W.structs.indexOf(s), 1);                           // the beacon becomes the fire
      M.say = "Burn. BURN. Look this way..."; M.log.push([W.t, "signal lit"]); return "done";
    },
  },
  // throw the dog something: food is how it learns he means it no harm
  feedDog: {
    r: ["food", "raw"], w: ["dogFed", "food", "raw"],
    find: (W, M) => M.mem.dog && W.t - M.mem.dog.t < 180 ? Object.assign({ key: "dog" }, M.mem.dog) : null, pre: S => S.food >= 150 || S.raw >= 150, eff: S => { S.dogFed = 1; if (S.raw >= 150) S.raw -= 150; else S.food -= 150; },
    cost: (W, M, t) => walkMin(M, t) + 6, exec: feedDogExec, say: "Here. Here, boy. Easy.",
  },
  // cook on the fire: the heat kills what's growing in it, faster the hotter the fire
  cook: {
    r: ["raw", "fire"], w: ["food", "raw"],
    find: (W, M) => litFireMem(M) || camp(W, M), pre: S => S.raw > 0 && S.fire === 2, eff: S => { S.food += S.raw; S.raw = 0; }, cost: (W, M, t) => walkMin(M, t) + 15,
    exec: work({ adjacent: true, mins: 15, met: MET.sit, pose: "tend", tick: (W, M, t) => { const F = fireAt(W, t) || W.fires.find(f => f.lit); if (!F || F.heat < 300) return "fail"; M.rawLoad = (M.rawLoad || 0) * dexp(-.9 * Math.min(1, F.heat / 3000)); },
      done: (W, M, t) => { const k = M.inv.raw || 0; addFood(M, k, M.rawLoad || 0, "cooked " + (M.rawWhat || "shellfish")); M.inv.raw = 0; M.rawLoad = 0; M.say = "Smells like a proper meal.";
        if (M.rawWhat === "fish" || M.rawWhat === "rabbit") W.items.push({ id: W.nextId++, k: "scraps", t: W.t, x: M.x + .8, y: M.y + .4, kcal: k * .08, from: "man" }); } }),   // the guts and heads, left by the fire
  },
  // a pot folded from a sheet of birch bark and pinned with a split stick: it holds water, and over hot coals the
  // water in it boils before the bark can burn
  makePot: {
    r: ["flake", "pot"], w: ["pot"],
    find: (W, M) => nearestMem(M, m => m.k === "birch"), pre: S => S.flake && !S.pot, eff: S => { S.pot = 1; }, cost: (W, M, t) => walkMin(M, t) + 40,
    exec: work({ adjacent: true, mins: 40, met: MET.craft, pose: "whittle", tick: (W, M) => hazard(W, M, .0006, M.skill.knap) && null, done: (W, M) => { M.inv.pot = 1; } }),
    say: "Score the bark round, peel a sheet off, fold the corners, pin them. A pot.",
  },
  // fetch water in the pot and boil it on the fire: clean water to keep by him
  boilWater: {
    r: ["pot", "fire", "clean"], w: ["clean"],
    find: (W, M) => { const f = litFireMem(M); if (!f) return null; const i = nearestKnownTile(W, M, j => W.ter[j] === T.STREAM || W.ter[j] === T.LAKE); return i < 0 ? null : Object.assign({ water: i, src: W.ter[i] === T.STREAM ? "stream" : "lake" }, f); },
    pre: S => S.pot && S.fire === 2 && S.clean < 2, eff: S => { S.clean += 1.5; }, cost: (W, M, t) => walkMin(M, tileXY(t.water)) * 2 + 25,
    exec: boilExec, say: "Boil it. Whatever's in it won't be after this.",
  },
  drinkBoiled: {
    r: ["clean"], w: ["watered", "clean"],
    find: () => ({ x: null }), pre: S => S.clean >= .5, eff: S => { S.watered = 1; S.clean = Math.max(0, S.clean - 1.2); }, cost: () => 3,
    exec: work({ here: true, mins: 3, met: MET.sit, pose: "drink", done: (W, M) => { const L = Math.min(M.inv.clean || 0, Math.max(.3, M.B.waterDef + .2)); bodyDrink(M.B, L); M.inv.clean -= L; } }),
  },
  gatherTinder: {
    r: ["tinder"], w: ["tinder"],
    find: (W, M) => nearestMem(M, m => m.k === "birch" || m.k === "pine" || (m.k === "fern" && (W.ents.find(e => "e" + e.id === m.key)?.aut ?? 1) > 0)) || (deadFuelMoist(W) < .2 ? (() => { const i = nearestKnownTile(W, M, j => W.ter[j] === T.MEADOW || W.ter[j] === T.GRASS, 12); return i < 0 ? null : { tile: i, ...tileXY(i), grass: 1 }; })() : null),
    pre: S => S.tinder < .15, eff: S => { S.tinder += .12; }, cost: (W, M, t) => walkMin(M, t) + 12,
    exec: work({ adjacent: true, mins: 12, met: MET.gather, pose: "crouch", done: (W, M, t) => { addInv(M, "tinder", .12); M.tinderMoist = t.grass ? deadFuelMoist(W) : Math.min(t.k === "fern" ? .2 : .14, deadFuelMoist(W)); } }),
    say: "Birch bark. It burns even when it's damp.",
  },
  gatherKindling: {
    r: ["kindling"], w: ["kindling"],
    find: (W, M) => { const i = nearestKnownTile(W, M, j => W.litter[j] > .6, 40); return i < 0 ? null : { tile: i, ...tileXY(i) }; },
    pre: S => S.kindling < 2, eff: S => { S.kindling += 1.5; }, cost: (W, M, t) => walkMin(M, t) + 15 + Math.max(0, deadFuelMoist(W) - .22) * 900,   // he knows sodden sticks won't catch
    exec: work({ adjacent: false, mins: 15, met: MET.gather, pose: "crouch", tick: (W, M, t) => { const kg = Math.min(W.litter[t.tile], .1); if (kg <= .01) return "fail"; W.litter[t.tile] -= kg; addInv(M, "kindling", kg); M.kindMoist = deadFuelMoist(W); } }),
    say: "Dead sticks under the trees. Only the ones that snap.",
  },
  gatherFuel: {
    r: ["fuel"], w: ["fuel"],
    find: (W, M) => nearestMem(M, (m, k) => (k[0] === "i" && m.k === "branch") || (m.deadKg > 1)),
    pre: S => S.fuel < 8, eff: S => { S.fuel += 4; }, cost: (W, M, t) => walkMin(M, t) + 12,
    exec: work({ adjacent: true, mins: 10, met: MET.carry, pose: "snap", done: (W, M, t) => {
      if (t.key[0] === "i") { const k = W.items.findIndex(it => "i" + it.id === t.key); if (k < 0) return "fail"; const it = W.items[k]; W.items.splice(k, 1); addInv(M, "fuel", it.kg, it.moist); }
      else { const e = W.ents.find(q => "e" + q.id === t.key); if (!e || e.deadKg < .5) return "fail"; const kg = Math.min(e.deadKg * .6, 4); e.deadKg -= kg; addInv(M, "fuel", kg, deadFuelMoist(W) * .8); }
    } }),
    say: "Dead branches. They'll burn tonight.",
  },
  // dry wood off his own woodpile: close to hand and seasoned
  takeWood: {
    r: ["fuel"], w: ["fuel"],
    find: (W, M) => { const p = woodpile(W); return p && (p.kg || 0) >= 3 ? { x: p.x, y: p.y, tile: idx(Math.floor(p.x), Math.floor(p.y)), key: "woodpile" } : null; },
    pre: S => S.fuel < 8, eff: S => { S.fuel += 4; }, cost: (W, M, t) => walkMin(M, t) + 3,
    exec: work({ adjacent: true, mins: 3, met: MET.carry, pose: "crouch", done: (W, M) => { const p = woodpile(W); if (!p || (p.kg || 0) < 1) return "fail"; const kg = Math.min(4, p.kg); p.kg -= kg; addInv(M, "fuel", kg, p.moist ?? .2); } }),
  },
  // dry kindling split and shaved from the heart of seasoned wood with the flake: slow, but it catches in any weather
  splitKindling: {
    r: ["flake"], w: ["kindling"],
    find: (W, M) => { const p = woodpile(W); return p && (p.kg || 0) >= 2 ? { x: p.x, y: p.y, tile: idx(Math.floor(p.x), Math.floor(p.y)), key: "woodpile" } : null; },
    pre: S => S.flake && S.kindling < 2, eff: S => { S.kindling += 1.5; }, cost: (W, M, t) => walkMin(M, t) + 30,
    exec: work({ adjacent: true, mins: 30, met: MET.craft, pose: "whittle", done: (W, M) => { const p = woodpile(W); if (!p || (p.kg || 0) < 1.5) return "fail"; p.kg -= 1.5; M.inv.kindling = (M.inv.kindling || 0) + 1.5; M.kindMoist = Math.min(p.moist ?? .2, .16); M.carry = (M.inv.fuel || 0) + M.inv.kindling; } }),
    say: "Split the dry heart out of a log and shave it into curls. Dry kindling, whatever the weather.",
  },
  knapFlake: {
    r: ["flake"], w: ["flake"],
    find: (W, M) => nearestMem(M, m => m.k === "flint"),
    pre: S => !S.flake, eff: S => { S.flake = 1; }, cost: (W, M, t) => walkMin(M, t) + 20,
    exec: work({ adjacent: true, mins: 20, met: MET.craft, pose: "knap", tick: (W, M) => { hazard(W, M, .004, M.skill.knap); }, done: (W, M) => { M.inv.flake = 1; M.skill.knap += .1; } }),
    say: "Strike the flint right and it gives an edge like glass.",
  },
  makeDrill: {
    r: ["flake","kindling","drill"], w: ["drill","kindling"],
    find: () => ({ x: null }), pre: S => S.flake && S.kindling >= .3 && !S.drill, eff: S => { S.drill = 1; S.kindling -= .3; }, cost: () => 45,
    exec: work({ here: true, mins: 45, met: MET.craft, pose: "whittle", done: (W, M) => { M.inv.kindling = Math.max(0, (M.inv.kindling || 0) - .3); M.inv.drill = 1; } }),
    say: "A straight dry stick for the spindle, a flat piece for the hearth, a notch cut with the flake.",
  },
  layFire: {
    r: ["tinder", "kindling", "fuel", "fire", "laid", "embers"], w: ["fire", "fireFuel", "fuel", "tinder", "kindling", "laid"],
    find: (W, M) => camp(W, M), pre: S => S.tinder >= .05 && S.kindling >= .5 && S.fuel + S.fireFuel >= 1.5 && S.fire < 2 && !S.laid,
    // laid on live embers, it catches by itself
    eff: S => { S.fire = S.embers ? 2 : 1; S.laid = 1; S.fireFuel += S.fuel; S.fuel = 0; S.tinder = 0; S.kindling = 0; }, cost: (W, M, t) => walkMin(M, t) + 8,
    exec: layFireExec, say: "Tinder in the middle, a cone of sticks over it, the bigger wood ready.",
  },
  lightFire: {
    r: ["fire", "drill", "laid"], w: ["fire"],
    find: (W, M) => drillOdds(W, M) < .035 ? null : nearestMem(M, (m, k) => k.startsWith("fire") && !m.lit && m.tinder > .03) || camp(W, M),   // he won't even try the drill in a downpour
    pre: S => S.fire === 1 && S.laid && S.drill, eff: S => { S.fire = 2; }, cost: (W, M, t) => walkMin(M, t) + 5 + 10 / drillOdds(W, M),
    exec: lightFireExec, say: "Spin the drill. Keep the pressure on. Don't stop when the smoke comes.",
  },
  shelterFromRain: {
    r: ["rain", "dry"], w: ["dry"],
    find: (W, M) => { const s = bestShelter(W); if (s && (s.props || propsOf(s)).rain > .5) return { x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), key: "shelter" }; const i = nearestKnownTile(W, M, j => W.treeAt[j] && W.ter[j] !== T.MARSH, 15); return i < 0 ? null : { tile: i, ...tileXY(i) }; },
    pre: S => S.rain && !S.dry, eff: S => { S.dry = 1; }, cost: (W, M, t) => walkMin(M, t) + 20,
    exec: work({ adjacent: false, mins: 20, met: MET.sit, pose: "sit", until: (W) => W.wx.rain <= 0 }),
  },
  rest: {
    r: [], w: ["rest"],
    find: (W, M) => { const s = bestShelter(W); return s ? { x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), key: "shelter" } : { x: null }; },
    pre: S => true, eff: S => { S.rest = 1; }, cost: (W, M, t) => (t.x != null ? walkMin(M, t) : 0) + 30,
    exec: work({ adjacent: false, mins: 40, met: MET.sit, pose: "sit", until: (W, M) => M.B.fatigue < .25 }),
  },
  // stack the wood he's carrying on the woodpile, where it keeps dry
  stackWood: {
    r: ["fuel"], w: ["stacked", "fuel"],
    find: (W, M) => { const s = woodpile(W); return s ? { x: s.x, y: s.y, tile: s.tile ?? idx(Math.floor(s.x), Math.floor(s.y)), key: "woodpile" } : null; },
    pre: S => S.fuel >= 4, eff: S => { S.stacked = 1; S.fuel = 0; }, cost: (W, M, t) => walkMin(M, t) + 4,
    exec: work({ adjacent: true, mins: 4, met: MET.carry, pose: "crouch", done: (W, M) => { const s = woodpile(W); if (!s) return "fail"; const o = s.kg || 0, v = M.inv.fuel || 0; s.moist = o + v > 0 ? ((s.moist ?? .25) * o + (M.fuelMoist ?? .25) * v) / (o + v) : .25; s.kg = o + v; M.inv.fuel = 0; M.carry = M.inv.kindling || 0; } }),
    say: "Onto the pile. Bark side up, so the rain runs off.",
  },
  feedFire: {
    r: ["fire","fuel"], w: ["fireFuel","fuel"],
    find: (W, M) => nearestMem(M, (m, k) => k.startsWith("fire")) || camp(W, M), pre: S => S.fire >= 1 && S.fuel > 0, eff: S => { S.fireFuel += S.fuel; S.fuel = 0; }, cost: (W, M, t) => walkMin(M, t) + 3,
    exec: work({ adjacent: true, mins: 3, met: MET.stand, pose: "tend", done: (W, M, t) => { const F = fireAt(W, t); if (!F) return "fail"; addFuel(F, "logs", M.inv.fuel || 0, M.fuelMoist ?? .25); M.inv.fuel = 0; } }),
  },
  warmUp: {
    r: ["fire"], w: ["warm"],
    find: (W, M) => litFireMem(M) || camp(W, M), pre: S => S.fire === 2, eff: S => { S.warm = 1; }, cost: (W, M, t) => walkMin(M, t) + 30,
    exec: work({ adjacent: true, mins: 30, met: MET.sit, pose: "warm", until: (W, M) => M.B.core > 36.8 && M.B.wet < .15 }),
  },
  sleep: {
    r: ["night"], w: ["rested"],
    find: (W, M) => { const s = bestShelter(W); if (s) return { x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), key: "shelter" }; const f = litFireMem(M); return f || { x: M.x, y: M.y, key: "here" }; },
    pre: S => S.night, eff: S => { S.rested = 1; }, cost: (W, M, t) => walkMin(M, t) + 5,
    exec: sleepExec,
  },
};
// ------------------------------------------------------------ gathering building materials
// where each material comes from (as he remembers the island), what it needs, and what taking it does to the world
const MATSRC = {
  poles: { find: (W, M) => nearestMem(M, (m, k) => (k[0] === "i" && m.k === "branch" && m.kg > 1) || (m.deadKg > 3)), mins: 12, pose: "snap", met: MET.carry, say: "Long straight dead limbs, dragged back two at a time.",
    take: (W, M, t) => { if (t.key[0] === "i") { const k = W.items.findIndex(it => "i" + it.id === t.key); if (k < 0) return "fail"; W.items.splice(k, 1); } else { const e = W.ents.find(q => "e" + q.id === t.key); if (!e || e.deadKg < 2) return "fail"; e.deadKg -= 3; } } },
  bracken: { find: (W, M) => nearestMem(M, (m, k) => m.k === "fern" && (m.n ?? 1) > 0), mins: 15, pose: "pull", met: MET.gather, say: "Armfuls of bracken. It'll thatch a roof and make a bed.",
    take: (W, M, t) => { const e = W.ents.find(q => "e" + q.id === t.key); if (!e || (e.n ?? 1) <= 0) return "fail"; e.n = (e.n ?? 1) - 1; } },
  boughs: { find: (W, M) => nearestMem(M, m => m.k === "pine"), mins: 15, pose: "snap", met: MET.gather, say: "Green pine boughs: they shed rain, and they're soft to lie on." },
  stones: { find: (W, M) => nearestMem(M, m => m.k === "stones" && (m.n ?? 1) > 0) || tileTarget(W, M, j => W.ter[j] === T.SHINGLE), mins: 15, pose: "crouch", met: MET.carry, say: "Stones from the beach, as many as he can carry." },
  withies: { needs: ["flake"], find: (W, M) => nearestMem(M, m => m.k === "hazel" || m.k === "birch"), mins: 20, pose: "cut", met: MET.gather, say: "Long whippy shoots cut with the flake. They'll weave." },
  debris: { find: (W, M) => tileTarget(W, M, j => W.ter[j] === T.WOOD && !W.treeAt[j]), mins: 12, pose: "crouch", met: MET.gather, say: "Leaves and litter scooped up by the armful." },
  mud: { find: (W, M) => tileTarget(W, M, j => W.ter[j] === T.MARSH || W.ter[j] === T.STREAM), mins: 20, pose: "crouch", met: MET.dig, say: "Sticky mud from the bank. It'll daub the walls." },
  reeds: { needs: ["flake"], find: (W, M) => nearestMem(M, m => m.k === "reeds"), mins: 20, pose: "cut", met: MET.gather, say: "Reeds cut at the base, bundled for thatch." },
};
function tileTarget(W, M, f) { const i = nearestKnownTile(W, M, f, 45); return i < 0 ? null : { tile: i, ...tileXY(i) }; }
for (const m of MATS) {
  const src = MATSRC[m], trip = MATERIALS[m].trip, n = "get_" + m;
  ACTIONS[n] = {
    r: [m, ...(src.needs || [])], w: [m], find: src.find,
    pre: S => S[m] < 60 && (src.needs || []).every(v => S[v]), eff: S => { S[m] += trip; }, cost: (W, M, t) => walkMin(M, t) + src.mins,
    exec: work({ adjacent: true, mins: src.mins, met: src.met, pose: src.pose, done: (W, M, t) => { if (src.take && src.take(W, M, t) === "fail") return "fail"; M.inv[m] = (M.inv[m] || 0) + trip; } }),
    say: src.say,
  };
}
// put up one stage of a structure: the parts go in over the minutes of work
export function buildExec(W, M, t, st) {
  const s = W.structs.find(q => q.id === t.sid); if (!s || finished(s)) return "fail";
  if (!st.phase) { st.phase = "go"; if (d2(M, t) > 2.2) { if (!goTo(W, M, t.tile, true)) return "fail"; } else M.path = null; }
  if (st.phase === "go") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) st.phase = "build"; return "go"; }
  const stage = s.stages[s.stage];
  if (!st.paid) {   // put down what he's brought on the site; it stays there if he's called away
    const on = s.onsite || (s.onsite = {});
    for (const m in stage.need) { const put = Math.min(M.inv[m] || 0, stage.need[m] - (on[m] || 0)); if (put > 0) { on[m] = (on[m] || 0) + put; M.inv[m] -= put; } }
    if (Object.keys(stage.need).some(m => (on[m] || 0) < stage.need[m] - 1e-6)) return "fail";
    st.paid = 1; if (stage.say && s.prog === 0) M.say = stage.say;
  }
  M.pose = "build"; M.met = MET.build; M.face = s.x > M.x ? 1 : -1;
  const speed = .8 + Math.min(.6, M.skill.build * .3);          // practice makes him quicker
  M.skill.build += .0015; hazard(W, M, .0002, M.skill.build);
  if (buildWork(W, s, speed / stage.mins)) { M.log.push([W.t, "built", s.k, stage.name]); if (s.k === "fireRing") for (const F of W.fires) if (Math.abs(F.x - s.x) < .6 && Math.abs(F.y - s.y) < .6) F.ring = true; return "done"; }
  return "work";
}
// food he carries, and the germs in it (organisms per kcal, mixed by kcal)
function addFood(M, kcal, loadPerKcal, what) { const o = M.inv.food || 0; M.foodLoad = o + kcal > 0 ? ((M.foodLoad || 0) * o + loadPerKcal * kcal) / (o + kcal) : 0; M.inv.food = o + kcal; M.foodWhat = what; }
function addRaw(M, kcal, loadPerKcal, what) { const o = M.inv.raw || 0; M.rawLoad = o + kcal > 0 ? ((M.rawLoad || 0) * o + loadPerKcal * kcal) / (o + kcal) : 0; M.inv.raw = o + kcal; M.rawWhat = what; }
// how many minutes' trouble he'd go to, to avoid a risk he believes in (learned from being ill)
const riskMin = (M, kind, prior = .1) => ((M.belief && M.belief[kind]) ?? prior) * 240;
function shellfishExec(W, M, t, st) {
  if (!st.phase) { st.phase = "go"; if (!goTo(W, M, t.tile, true)) return "fail"; st.wait = 0; }
  if (st.phase === "go") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) st.phase = "wait"; return "go"; }
  const b = W.shore.find(q => "s" + q.id === t.key); if (!b) return "fail";
  if (st.phase === "wait") { if (W.wx.tide < -b.depth) { st.phase = "pick"; st.left = 30; } else { M.pose = "sit"; M.met = MET.sit; if (++st.wait > 420) return "fail"; return "work"; } }
  M.pose = "crouch"; M.met = MET.gather; M.face = b.x > M.x ? 1 : -1;
  if (W.wx.tide >= -b.depth) { M.say = "The tide's turned."; return st.got ? "done" : "fail"; }        // the water's back over them
  const kg = Math.min(b.kg, .12); b.kg = +(b.kg - kg).toFixed(3); st.got = (st.got || 0) + kg;
  addRaw(M, kg * SHELL[b.k].kcalKg, W.water.sea * .03, b.k);
  if (--st.left <= 0 || b.kg < .2) { M.mem[t.key] && (M.mem[t.key].kg = b.kg); return "done"; }
  return "work";
}
function feedDogExec(W, M, t, st) {
  const dog = W.animals.find(a => a.sp === "dog" && !a.adrift && !a.dead); if (!dog) return "fail";
  if (!st.phase) { st.phase = "go"; st.left = 30; }
  const d = Math.hypot(dog.x - M.x, dog.y - M.y);
  if (st.phase === "go") {   // close enough to throw, not so close it bolts
    if (d < 5) { st.phase = "toss"; st.wait = 3; }
    else { if (--st.left <= 0) return "fail"; const i = idx(Math.floor(dog.x - (dog.x - M.x) / d * 3.5), Math.floor(dog.y - (dog.y - M.y) / d * 3.5)); if (!M.path || M.pathTo !== i) { if (!goTo(W, M, i, false)) return "fail"; M.pathTo = i; } M.pose = "walk"; M.met = MET.walk; walk(W, M); return "go"; }
  }
  M.pose = "crouch"; M.met = MET.sit; M.face = dog.x > M.x ? 1 : -1;
  if (--st.wait > 0) return "work";
  if ((M.inv.raw || 0) < 150 && (M.inv.food || 0) < 150) return "fail";
  const fromRaw = (M.inv.raw || 0) >= 150, k = Math.min(fromRaw ? M.inv.raw : M.inv.food || 0, 150); if (fromRaw) M.inv.raw -= k; else M.inv.food -= k;   // raw fish or shellfish does a dog no harm
  W.items.push({ id: W.nextId++, k: "scraps", t: W.t, x: M.x + (dog.x - M.x) * .6, y: M.y + (dog.y - M.y) * .6, kcal: k, from: "man" });
  M.log.push([W.t, "fed dog"]); return "done";
}
function boilExec(W, M, t, st) {
  if (!st.phase) { st.phase = "fetch"; if (!goTo(W, M, t.water, true)) return "fail"; }
  if (st.phase === "fetch") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) { st.phase = "fill"; st.left = 2; } return "go"; }
  if (st.phase === "fill") { M.pose = "drink"; if (--st.left > 0) return "work"; st.phase = "back"; if (!goTo(W, M, idx(Math.floor(t.x), Math.floor(t.y)), true)) return "fail"; return "go"; }
  if (st.phase === "back") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) { st.phase = "boil"; st.left = 20; } return "go"; }
  const F = fireAt(W, t); if (!F || !F.lit) { M.say = "The fire's gone out under it."; return "fail"; }
  M.pose = "tend"; M.met = MET.sit; M.face = F.x > M.x ? 1 : -1; M.boiling = W.t;
  if (--st.left > 0) return "work";
  M.inv.clean = (M.inv.clean || 0) + 1.5; return "done";
}
function addInv(M, k, v, moist) { if (k === "fuel") { const o = M.inv.fuel || 0; M.fuelMoist = o + v > 0 ? ((M.fuelMoist ?? .25) * o + (moist ?? .25) * v) / (o + v) : .25; } M.inv[k] = (M.inv[k] || 0) + v; M.carry = (M.inv.fuel || 0) + (M.inv.kindling || 0); }
const fireAt = (W, t) => W.fires.find(f => "fire" + f.id === t.key) || W.fires.find(f => Math.abs(f.x - t.x) < 1.5 && Math.abs(f.y - t.y) < 1.5);
function litFireMem(M) { return nearestMem(M, (m, k) => k.startsWith("fire") && (m.lit || m.embers > .03)); }
// where he'll make camp: a spot of firm open ground at the edge of the trees (fuel and shelter close by), near him
export function camp(W, M) {
  if (W.camp != null) return { tile: W.camp, ...tileXY(W.camp), key: "camp" };
  const i = nearestKnownTile(W, M, j => (W.ter[j] === T.GRASS || W.ter[j] === T.MEADOW) && !W.treeAt[j] && [1, -1, MW, -MW].some(o => W.ter[j + o] === T.WOOD), 25);
  return i < 0 ? { tile: here(M), ...tileXY(here(M)), key: "camp" } : { tile: i, ...tileXY(i), key: "camp" };
}
// his chance of getting a coal from the hand drill in one ten-minute attempt: skill, dryness of the kit, his state
// in the open, rain soaks the hearth board and the ember before it can be tipped into the tinder
export function drillOdds(W, M) {
  // the kit is kept dry under his roof if he has one, or inside his shirt (as damp as he is)
  const roofs = W.structs.filter(q => FAMILIES[q.k].shelter && (q.props || propsOf(q)).rain > .5), home = roofs.length > 0, kit = Math.min(deadFuelMoist(W), home ? .1 : .1 + M.B.wet * .15), roofed = roofs.some(q => Math.hypot(q.x - M.x, q.y - M.y) < 1.6);
  const rain = roofed ? 1 : clamp(1 - W.wx.rain * .25, .1, 1);
  return clamp((.12 + .6 * (1 - dexp(-M.skill.drill / 1.5))) * (1 - kit * 1.8) * (1 - M.B.fatigue * .5) * (M.B.core < 35.5 ? .5 : 1) * rain, .02, .9);
}

// ------------------------------------------------------------ doing
function layFireExec(W, M, t, st) {
  if (!st.phase) { st.phase = "go"; if (d2(M, t) > 1.2) { if (!goTo(W, M, t.tile, true)) return "fail"; } }
  if (st.phase === "go") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) { st.phase = "lay"; st.left = 8; } return "go"; }
  M.pose = "crouch"; M.met = MET.gather; if (t.x != null) M.face = t.x > M.x ? 1 : -1;
  if (--st.left > 0) return "work";
  if (W.camp == null) W.camp = t.tile;
  let F = W.fires.find(f => Math.abs(f.x - t.x) < 1 && Math.abs(f.y - t.y) < 1);
  if (!F) { F = newFire(t.x, t.y); F.id = W.nextId++; F.ring = fireRingAt(W, F); W.fires.push(F); }
  else if (!F.lit) {   // pull out the sodden stuff before laying fresh; wet logs go to one side to dry
    for (const c of ["tinder", "kindling"]) if (F.fuel[c][1] > .28) F.fuel[c] = [0, 0, 0];
    const L = F.fuel.logs; if (L[1] > .35 && L[0] > .3) { W.items.push({ id: W.nextId++, k: "branch", x: F.x + .8, y: F.y + .6, kg: +L[0].toFixed(2), moist: L[1] }); F.fuel.logs = [0, 0, 0]; }
  }
  addFuel(F, "tinder", M.inv.tinder || 0, M.tinderMoist ?? .15); addFuel(F, "kindling", M.inv.kindling || 0, M.kindMoist ?? .2); addFuel(F, "logs", M.inv.fuel || 0, M.fuelMoist ?? .25);
  M.inv.tinder = 0; M.inv.kindling = 0; M.inv.fuel = 0; M.carry = 0; F.banked = false;
  if (F.embers > .03) M.say = "Coals still alive under the ash. Tinder on them, blow, and it takes.";
  M.mem["fire" + F.id] = { k: "fire", x: F.x, y: F.y, lit: false, embers: F.embers, fuelKg: F.fuel.logs[0] + F.fuel.kindling[0], tinder: F.fuel.tinder[0], t: W.t };
  return "done";
}
function lightFireExec(W, M, t, st) {
  if (!st.phase) { st.phase = "go"; if (d2(M, t) > 1.2) { if (!goTo(W, M, idx(Math.floor(t.x), Math.floor(t.y)), true)) return "fail"; } st.left = 10; st.tries = 0; }
  if (st.phase === "go") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) st.phase = "drill"; return "go"; }
  const F = fireAt(W, t); if (!F) return "fail";
  M.face = F.x > M.x ? 1 : -1;
  if (st.phase === "nurse") {   // a new flame: feed it twigs, blow, shield it, until the sticks have caught
    M.pose = "tend"; M.met = MET.gather;
    if (F.fuel.kindling[2] > .55 || F.fuel.logs[2] > .15) { M.say = "It's caught."; return "done"; }
    if (!F.lit && F.embers < .01 && F.fuel.tinder[2] < .05) { M.mem["fire" + F.id] = Object.assign(M.mem["fire" + F.id] || { k: "fire", x: F.x, y: F.y }, { lit: false, embers: 0, tinder: 0, t: W.t }); M.say = "It's died. The sticks were too wet."; return "fail"; }
    return --st.left > 0 ? "work" : "done";
  }
  if (F.fuel.tinder[0] < .03) { M.mem["fire" + F.id] = Object.assign(M.mem["fire" + F.id] || { k: "fire", x: F.x, y: F.y }, { lit: false, embers: F.embers, tinder: 0, t: W.t }); M.say = "Nothing left in the hearth to catch. It needs laying again."; return "fail"; }
  M.pose = "drill"; M.met = 6.5;
  if (--st.left > 0) return "work";
  st.tries++; M.skill.drill += .08;
  if (W.rng.f() < drillOdds(W, M)) {
    if (ignite(F, .5 + M.skill.drill * .1)) { M.log.push([W.t, "fire", st.tries]); M.say = "Smoke... a coal! Into the tinder. Blow. FIRE."; st.phase = "nurse"; st.left = 25; return "work"; }
    // a coal, but the tinder won't take it: it's damp. The fire has to be laid again with dry stuff
    M.mem["fire" + F.id] = Object.assign(M.mem["fire" + F.id] || { k: "fire", x: F.x, y: F.y }, { lit: false, embers: 0, tinder: 0, t: W.t });
    M.say = "A coal, and the tinder won't take it. Damp. It all needs relaying."; return "fail";
  }
  if (st.tries >= 5 || M.B.fatigue > .9) { M.say = "Hands blistered. Rest them, then again."; return "fail"; }
  st.left = 10; return "work";
}
// a standard piece of work: walk there (or stay), then work for some minutes; tick each minute, done at the end
function work(o) {
  return (W, M, t, st) => {
    if (!st.phase) { st.phase = "go"; if (!o.here && t.x != null && d2(M, t) > 2.2) { if (!goTo(W, M, t.tile ?? idx(Math.floor(t.x), Math.floor(t.y)), o.adjacent)) return "fail"; } else M.path = null; }
    if (st.phase === "go") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) { st.phase = "work"; st.left = o.mins; } return "go"; }
    M.pose = o.pose; M.met = o.met;
    if (t.x != null) M.face = t.x > M.x ? 1 : -1;
    if (o.tick) { const r = o.tick(W, M, t); if (r === "fail") return "fail"; }
    if (o.until && o.until(W, M)) st.left = 0;
    if (--st.left <= 0) { const r = o.done ? o.done(W, M, t) : null; return r === "fail" ? "fail" : "done"; }
    return "work";
  };
}
function sleepExec(W, M, t, st) {
  if (!st.phase) { st.phase = "go"; if (t.x != null && d2(M, t) > .8) { if (!goTo(W, M, idx(Math.floor(t.x), Math.floor(t.y)), t.key !== "shelter")) st.phase = "sleep"; } }   // into the shelter, or beside the fire
  if (st.phase === "go") { M.pose = "walk"; M.met = MET.walk; if (walk(W, M)) st.phase = "sleep"; return "go"; }
  if (!st.banked) { st.banked = 1; for (const F of W.fires) if (F.lit && Math.hypot(F.x - M.x, F.y - M.y) < 3 && F.fuel.logs[0] > .5) { F.banked = true; M.say = "Bank the fire: ash over the coals, so there's fire in the morning."; } }
  M.pose = "sleep"; M.met = MET.sleep; M.B.asleep = true;
  // he wakes when he's slept enough and it's light, or the cold wakes him
  if ((M.B.sleepP < .12 && W.wx.elev > -.05) || M.B.core < 35.8 || M.B.shiver > .6) { M.B.asleep = false; return "done"; }
  return "work";
}
