// Procedural building: designs come from the brief, what a structure does comes from the parts installed.
import { createWorld } from "../src/sim/world.js";
import { design, place, work, propsOf, shelterAt, finished, FAMILIES } from "../src/build/build.js";
import { camp } from "../src/mind/actions.js";
const W = createWorld(1404719350, Date.UTC(2026, 8, 25, 5, 0)), M = W.man;
let ok = true; const check = (name, c) => { console.log((c ? "ok   " : "FAIL ") + name); ok = ok && c; };
M.windSeen = [0, 0, 0, 0, 50, 0, 0, 0];                   // weather has mostly blown toward the west (octant 4)
const c = camp(W, M).tile, d = design(W, M, "leanto", c);
check("lean-to designed with stages", d && d.stages.map(s => s.name).join() === "frame,roof,bed");
check("open side faces downwind (west) so the wind comes over its back", d.dir === 2);
const s = place(W, d);
const at = () => shelterAt(W, s.x, s.y);
check("a bare site keeps nothing off", at().rain === 0);
while (s.stage < 1) work(W, s, 1 / 40);
check("a frame alone keeps no rain off", at().rain === 0);
for (let i = 0; i < 35; i++) work(W, s, 1 / 70);
const half = at().rain; check("half a roof keeps some rain off: " + half.toFixed(2), half > .3 && half < .95);
while (s.stage < 2) work(W, s, 1 / 70);
check("a finished roof keeps nearly all of it off: " + at().rain.toFixed(2), at().rain > .9);
W.wx.windDir = 4; const back = at().wind; W.wx.windDir = 0; const front = at().wind;
check(`wind over the back is blocked (${back.toFixed(2)}) far more than into the mouth (${front.toFixed(2)})`, back > .6 && front < .2);
check("no bed yet", at().bed === 0);
while (!finished(s)) work(W, s, 1 / 20);
check("bed insulates: " + at().bed.toFixed(2), at().bed > .8);
for (const k in FAMILIES) check(`family ${k} makes stages`, FAMILIES[k].make({ cover: "bracken", bedMat: "boughs", knows: {} }).length > 0);
process.exit(ok ? 0 : 1);
