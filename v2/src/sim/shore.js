// The shore at low tide: mussel beds on the stony shore, cockles in the sand. Each bed lies at a depth below mean
// sea level and is only uncovered when the tide drops below it: shallow beds show on most tides, the richest low
// ones only on spring tides. Beds hold kg of shellfish (in the shell) and regrow slowly once picked.
import { MW, MH, T, idx } from "../world/gen.js";
import { hash3 } from "../core/rng.js";
import { tideAt } from "./env.js";

export const SHELL = {
  mussels: { kcalKg: 300, cap: 14, regrow: .05, what: "mussels" },     // kcal per kg in the shell (a third is meat)
  cockles: { kcalKg: 240, cap: 10, regrow: .04, what: "cockles" },
};
export function shoreInit(W) {
  W.shore = [];
  for (let i = 0; i < MW * MH; i++) {
    const t = W.ter[i]; if (t !== T.SEA) continue;
    const x = i % MW, y = (i / MW) | 0; let nb = -1;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx(x + a, y + b); if (W.ter[j] === T.SHINGLE || W.ter[j] === T.ROCK) nb = T.SHINGLE; else if (W.ter[j] === T.SAND && nb < 0) nb = T.SAND; }
    if (nb < 0 || hash3(x, y, W.seed + 31) > (nb === T.SHINGLE ? .45 : .16)) continue;
    const k = nb === T.SHINGLE ? "mussels" : "cockles", depth = +(.3 + hash3(x, y, W.seed + 32) * 1.1).toFixed(2);
    W.shore.push({ id: W.nextId++, k, x: x + .5, y: y + .5, tile: i, depth, kg: +(SHELL[k].cap * (.5 + depth / 3)).toFixed(2) });
  }
}
export const exposed = (W, b) => W.wx.tide < -b.depth;
// minutes until the tide next uncovers a bed this deep (0 if it's showing now), or null within the next 13 hours
export function lowIn(W, depth) { for (let m = 0; m <= 780; m += 5) if (tideAt(W.t + m) < -depth) return m; return null; }
export function shoreDay(W) { for (const b of W.shore) { const cap = SHELL[b.k].cap * (.5 + b.depth / 3); b.kg = +Math.min(cap, b.kg + cap * SHELL[b.k].regrow).toFixed(2); } }
