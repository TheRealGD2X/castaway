import assert from "node:assert/strict";
import { createWorld, save, load, step } from "../src/sim/world.js";
import { newBody, bodyStep, feel, MET } from "../src/sim/body.js";
import { bodyContext, here } from "../src/sim/man.js";
import { newFire } from "../src/sim/fire.js";
import { homeAssembly } from "../src/build/homes.js";
import { FAMILIES, propsOf } from "../src/build/build.js";
import { ACTIONS } from "../src/mind/actions.js";
import { think } from "../src/mind/brain.js";
import { exposure, warmPlace } from "../src/mind/exposure.js";
import { MW, MH, T } from "../src/world/gen.js";
import { SEED, BORN } from "../src/config.js";

function scene() {
  const W = createWorld(SEED, BORN), M = W.man;
  // A real, walkable patch of this seeded island, with a completed debris hut beside its fire.
  let tile = -1;
  for (let i = MW + 2; i < MW * (MH - 2); i++) {
    if ([i - 1, i, i + 1, i + 2, i - MW, i + MW].every(j => W.ter[j] === T.GRASS && !W.treeAt[j])) { tile = i; break; }
  }
  assert.ok(tile >= 0);
  M.x = tile % MW + .5; M.y = Math.floor(tile / MW) + .5; M.known.fill(1);
  M.B = newBody(); M.B.core = 34; M.B.wet = 1; M.B.glyco = 20;
  const stages = FAMILIES.debrisHut.make({ bedMat: "bracken" });
  const home = { id: W.nextId++, k: "debrisHut", x: M.x + 1, y: M.y, dir: 0, stages, stage: stages.length, prog: 0, have: { poles: 11, debris: 32 }, onsite: {}, started: 0 };
  home.assembly=homeAssembly(home);home.props = propsOf(home); W.structs.push(home);
  W.camp = tile;
  const F = newFire(M.x - 1, M.y); F.id = W.nextId++; F.lit = true; F.heat = 5000; W.fires.push(F);
  M.mem["fire" + F.id] = { k: "fire", x: F.x, y: F.y, lit: true, embers: 0, fuelKg: 6, t: W.t };
  Object.assign(W.wx, { temp: 7, wind: 10, rain: 4, hum: 1, sun: 0, elev: .1 });
  return { W, M, home, fireside: { x: F.x, y: F.y, tile: tile - 1, key: "fire" + F.id } };
}

const { W, M, home, fireside } = scene(), before = save(W);
const outside = exposure(W, M, M), inside = exposure(W, M, { ...home, key: "shelter" });
assert.ok(inside.core > outside.core + 1, "cover must conserve more heat than the exposed fire in a storm");
assert.ok(inside.wet <= outside.wet, "cover must not make clothes wetter than the exposed fire");
assert.equal(warmPlace(W, M, fireside).key, "shelter");
assert.equal(save(W), before, "forecasting and choosing a place must not alter the world or RNG");
const replay = load(before);
assert.deepEqual(exposure(replay, replay.man, { ...home, key: "shelter" }), inside);

// Fire wins in calm weather when he has no insulating bed, so this is a comparison rather than a rain rule.
home.props = { rain: .9, wind: .8, bed: 0, fire: 1 };
M.x = home.x + 1; Object.assign(W.wx, { rain: 0, wind: 0, temp: 12, hum: .6 });
assert.equal(warmPlace(W, M, fireside).key, fireside.key);

const s = scene(); s.W.fires = []; s.M.mem = {}; s.W.t = 20;
think(s.W);
assert.equal(s.M.act.a, "warmUp", "cover can be a thermal refuge even without a lit fire");
assert.equal(s.M.act.t.key, "shelter");
assert.equal(here(s.M), Math.floor(s.home.y) * MW + Math.floor(s.home.x), "a nearby refuge action must enter its tile");
assert.equal(s.M.doing, "Warming up in the shelter");
think(s.W);
assert.equal(s.M.B.asleep, false);
assert.equal(bodyContext(s.W, s.M, s.M.met).lying, true, "he can conserve heat lying awake on his bed");

// Shelter cannot silence the signal from dwindling reserves, even when food is already in his hands.
const hungry = scene(); hungry.M.B.fat = .55; hungry.M.B.glyco = 0; hungry.M.B.gut = 0;
hungry.M.inv.food = 900; hungry.W.t = 20; think(hungry.W);
assert.equal(hungry.M.act.a, "eat", "nearly exhausted reserves must make eating compete with refuge");
assert.ok(feel(hungry.M.B).starving > feel(s.M.B).starving);
assert.equal(feel({ ...hungry.M.B, gut: 2500 }).starving, 0, "a full gut must quiet food urgency while the meal digests");
const freezing = scene(); freezing.M.B.core = 29; freezing.M.B.fat = .55; freezing.M.B.gut = 0;
freezing.M.inv.food = 900; freezing.W.t = 20; think(freezing.W);
assert.equal(freezing.M.act.a, "warmUp", "immediate hypothermia must outweigh a longer-term energy deficit");

// The older rain action must also enter the hut from a neighbouring tile, rather than stopping outside its roof.
const rain = scene(), state = {};
ACTIONS.shelterFromRain.exec(rain.W, rain.M, { ...rain.home, key: "shelter" }, state);
assert.equal(here(rain.M), Math.floor(rain.home.y) * MW + Math.floor(rain.home.x));

// Apply the real physiology at the chosen refuge through the same storm; do not grant heat or dryness directly.
for (let i = 0; i < 120; i++) bodyStep(s.M.B, bodyContext(s.W, s.M, MET.sit));
assert.equal(s.M.B.alive, true);
assert.ok(s.M.B.core > 34, "the actual shelter and posture must reverse the initial cooling");

const saved = save(s.W), a = load(saved), b = load(saved);
for (let i = 0; i < 120; i++) { step(a); step(b); }
assert.equal(save(a), save(b), "a sheltered action must remain identical after checkpoint replay");
console.log("ok   exposure forecasts, refuge choices, exact shelter entry, real heat recovery and checkpoint replay");
