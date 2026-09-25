// The Castaway v2: add one of his thoughts to data/v2/mind.json.   node v2/tools/think.js thought.json
// A thought: { applyAt: <sim minute after the checkpoint>, thought: "inner monologue", diary?: "journal entry",
//   intents?: [{ k: "build:roundhouse" | "explore" | "food" | "fire" | "dog" | "rest" | "stock" | "signal" | "boil",
//                w: -30..40, hours: 1..336 }], names?: { dog?: "..." } }
import fs from "fs"; import path from "path"; import { fileURLToPath } from "url";
import { INTENT_KINDS } from "../src/sim/mindlink.js";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."), f = path.join(root, "data/v2/mind.json");
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const fail = (m, c) => { console.error(m); process.exit(c); };
if (!Number.isInteger(d.applyAt) || (typeof d.thought !== "string" && typeof d.diary !== "string")) fail("need an integer applyAt and a thought or diary", 2);
for (const it of d.intents || []) if (!(String(it.k).startsWith("build:") || INTENT_KINDS.includes(it.k))) fail("unknown intent " + it.k, 4);
let cpT = 0; try { cpT = JSON.parse(fs.readFileSync(path.join(root, "data/v2/checkpoint.json"), "utf8")).t; } catch (e) {}
if (d.applyAt <= cpT) fail(`applyAt ${d.applyAt} must be after the checkpoint (${cpT})`, 3);
d.id = "m" + d.applyAt;
let all = []; try { all = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
all = all.filter(x => x.id !== d.id); all.push(d); all.sort((a, b) => a.applyAt - b.applyAt);
fs.writeFileSync(f, JSON.stringify(all, null, 1));
console.log(`saved ${d.id} (${all.length} thoughts)`);
