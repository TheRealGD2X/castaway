import { generate, MW, MH, T, idx } from "../src/world/gen.js";
const seed = +(process.argv[2] || 1404719350);
const W = generate(seed), ch = ["~", ".", ":", ",", "'", "T", "#", "o", "%", "=", ";"];
const tr = new Map(); for (const e of W.ents) tr.set(idx(Math.floor(e.x), Math.floor(e.y)), e.k);
let s = ""; for (let y = 0; y < MH; y += 2) { for (let x = 0; x < MW; x++) { const k = tr.get(idx(x, y)); s += k === "oak" || k === "birch" || k === "rowan" ? "♣" : k === "pine" ? "♠" : ch[W.ter[idx(x, y)]]; } s += "\n"; }
console.log(s);
const cnt = {}; for (const e of W.ents) cnt[e.k] = (cnt[e.k] || 0) + 1; console.log(JSON.stringify(cnt));
const tc = {}; for (const t of W.ter) tc[t] = (tc[t] || 0) + 1; console.log(JSON.stringify(tc));
const W2 = generate(seed); console.log("deterministic", JSON.stringify(W2.ents) === JSON.stringify(W.ents) && W2.ter.every((v, i) => v === W.ter[i]));
