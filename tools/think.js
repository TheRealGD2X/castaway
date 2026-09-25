// The Castaway: adds one of Tomas's thoughts to data/mind.json. Usage (from the repo root):
//   node tools/think.js <thought.json>
// The thought is one JSON object with at least applyAt (a sim minute) and thought. Checks it, gives it the id
// m<applyAt> (replacing a thought with the same id) and keeps the list in order.
const fs = require("fs"), path = require("path");
const f = path.resolve(__dirname, "../data/mind.json");
const d = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Number.isInteger(d.applyAt) || typeof d.thought !== "string" || !d.thought) { console.error("need integer applyAt and a thought"); process.exit(2); }
const st = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../data/world/state.json"), "utf8"));
if (d.applyAt <= st.t) { console.error("applyAt " + d.applyAt + " is not after the checkpoint (" + st.t + ")"); process.exit(3); }
d.id = "m" + d.applyAt;
const all = JSON.parse(fs.readFileSync(f, "utf8")).filter(x => x.id !== d.id);
all.push(d); all.sort((a, b) => a.applyAt - b.applyAt);
fs.writeFileSync(f, JSON.stringify(all, null, 1));
console.log("saved " + d.id + " (" + all.length + " thoughts)");
