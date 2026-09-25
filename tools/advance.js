// The Castaway: moves the island forward to this minute, headlessly, and saves the new checkpoint.
// The scheduled Claude routine runs this before Tomas thinks. Usage (from the repo root):
//   NODE_PATH=$(npm root -g) node tools/advance.js
// Serves this repo to a headless Chromium as the real site would, lets the game catch up to now, then writes
// data/world/state.json (checkpoint) and data/world/brief.json (his life, for the mind), and prints one JSON line.
const fs = require("fs"), path = require("path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const TYPES = { ".html": "text/html", ".json": "application/json", ".png": "image/png", ".js": "text/javascript" };
(async () => {
  const exe = fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
  const b = await chromium.launch(exe ? { executablePath: exe } : {});
  const p = await b.newPage();
  p.setDefaultTimeout(1800000);
  const errs = []; p.on("pageerror", e => errs.push(e.message));
  await p.route("**/*", r => {
    const u = new URL(r.request().url());
    if (u.host !== "castaway.local") return r.abort();
    const f = path.join(root, decodeURIComponent(u.pathname === "/" ? "/index.html" : u.pathname));
    if (!f.startsWith(root) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: "" });
    r.fulfill({ status: 200, contentType: TYPES[path.extname(f)] || "application/octet-stream", body: fs.readFileSync(f) });
  });
  await p.goto("http://castaway.local/index.html", { waitUntil: "domcontentloaded", timeout: 1800000 });
  const t0 = Date.now();
  let ok = false;
  while (Date.now() - t0 < 3000000) {
    ok = await p.evaluate(() => !!(window.__castaway && window.__castaway.ready && !window.__castaway.catching)).catch(() => false);
    if (ok) break;
    await new Promise(r => setTimeout(r, 500));
  }
  if (!ok) throw new Error("the game never caught up");
  const before = JSON.parse(fs.readFileSync(path.join(root, "data/world/state.json"), "utf8"));
  const out = await p.evaluate(() => { const C = window.__castaway; return { t: C.W.t, blob: C.serialise(), brief: C.brief(), alive: C.W.m.alive, applied: Object.keys(C.W.mind.ap || {}).length }; });
  if (!(out.t >= (before.t || 0))) throw new Error("replay went backwards (" + out.t + " < " + before.t + ")");
  fs.writeFileSync(path.join(root, "data/world/state.json"), JSON.stringify({ t: out.t, by: "cloud", savedAt: Date.now(), blob: out.blob }));
  fs.writeFileSync(path.join(root, "data/world/brief.json"), JSON.stringify(out.brief, null, 1));
  console.log(JSON.stringify({ ok: true, t: out.t, day: out.brief.day, when: out.brief.when, alive: out.alive, fromCheckpointT: before.t, thoughtsApplied: out.applied, suggestedApplyAt: out.t + 3, pageErrors: errs.slice(0, 3) }));
  await b.close();
})().catch(e => { console.error("advance failed: " + e.message); process.exit(1); });
