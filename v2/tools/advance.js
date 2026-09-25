// The Castaway v2: move the island forward to now and save the checkpoint the site starts from.
// Run by the scheduled routine before his deeper mind thinks:  node v2/tools/advance.js   (from the repo root)
// Loads data/v2/checkpoint.json (or starts the island fresh), applies his thoughts from data/v2/mind.json at their
// minutes, runs the simulation to this minute, writes the checkpoint and data/v2/brief.json, prints one JSON line.
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { createWorld, step, save, load } from "../src/sim/world.js";
import { brief } from "../src/sim/brief.js";
import { SEED, BORN } from "../src/config.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), dir = path.join(root, "data/v2");
const rd = f => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return null; } };
const thoughts = rd("mind.json") || [], cp = rd("checkpoint.json");
const W = cp ? load(cp.blob, thoughts) : createWorld(SEED, BORN, { thoughts });
const from = W.t, now = Math.floor((Date.now() - BORN) / 60000), t0 = Date.now();
while (W.t < now) step(W);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "checkpoint.json"), JSON.stringify({ t: W.t, savedAt: Date.now(), blob: save(W) }));
const b = brief(W); fs.writeFileSync(path.join(dir, "brief.json"), JSON.stringify(b, null, 1));
console.log(JSON.stringify({ ok: true, from, t: W.t, day: b.day, when: b.when, alive: b.alive, doing: b.doing, ms: Date.now() - t0, applyAfter: W.t + 1 }));
