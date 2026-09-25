// Walking the island: A* over tiles with the real cost of each kind of ground (time per tile), 8 directions,
// no cutting corners past obstacles. Deterministic (fixed neighbour order, integer-keyed tie breaks).
import { T, MW, MH, WATER } from "../world/gen.js";

// minutes per metre are what matter; these are relative slowness factors (1 = firm grass)
export const SLOW = { [T.GRASS]: 1, [T.MEADOW]: 1.05, [T.WOOD]: 1.3, [T.SAND]: 1.25, [T.SHINGLE]: 1.5, [T.ROCK]: 1.7, [T.MARSH]: 2.6, [T.STREAM]: 3.2 };
export const walkable = (W, i) => { const t = W.ter[i]; return !(WATER(t) && t !== T.STREAM) && !(W.block && W.block[i]); };
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [-1, 1, 1.4142], [1, -1, 1.4142], [-1, -1, 1.4142]];

export function findPath(W, from, to, opt = {}) {
  const N = MW * MH, goalAdj = !!opt.adjacent;               // adjacent: stop next to the target (a tree, the water)
  if (from === to) return [from];
  const g = new Float32Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx = to % MW, ty = (to / MW) | 0, h = i => { const dx = Math.abs(i % MW - tx), dy = Math.abs(((i / MW) | 0) - ty); return (Math.max(dx, dy) + .4142 * Math.min(dx, dy)) * .95; };
  const heap = []; const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] < heap[k][0] || (heap[p][0] === heap[k][0] && heap[p][1] <= heap[k][1])) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; const lt = (a, b) => heap[a][0] < heap[b][0] || (heap[a][0] === heap[b][0] && heap[a][1] < heap[b][1]); if (l < heap.length && lt(l, m)) m = l; if (r < heap.length && lt(r, m)) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } } return top; };
  g[from] = 0; push(h(from), from);
  const done = i => goalAdj ? Math.max(Math.abs(i % MW - tx), Math.abs(((i / MW) | 0) - ty)) <= 1 && i !== to : i === to;
  let n = 0, maxN = opt.max || 6000;
  while (heap.length && n++ < maxN) {
    const [, i] = pop(); if (closed[i]) continue; closed[i] = 1;
    if (done(i)) { const p = [i]; let c = i; while (came[c] >= 0) { c = came[c]; p.push(c); } return p.reverse(); }
    const x = i % MW, y = (i / MW) | 0;
    for (const [dx, dy, dl] of DIRS) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const j = ny * MW + nx; if (closed[j] || !walkable(W, j)) continue;
      if (dx && dy && (!walkable(W, y * MW + nx) || !walkable(W, ny * MW + x))) continue;   // no squeezing past corners
      const c = g[i] + dl * ((SLOW[W.ter[i]] || 1) + (SLOW[W.ter[j]] || 1)) * .5 + (W.treeAt && W.treeAt[j] ? .6 : 0);
      if (c < g[j]) { g[j] = c; came[j] = i; push(c + h(j), j); }
    }
  }
  return null;
}
// metres along a path of tiles (1 tile = 2 m), weighted by ground
export function pathCost(W, p) { let c = 0; for (let k = 1; k < p.length; k++) { const a = p[k - 1], b = p[k], d = (a % MW !== b % MW && ((a / MW) | 0) !== ((b / MW) | 0)) ? 1.4142 : 1; c += d * 2 * ((SLOW[W.ter[a]] || 1) + (SLOW[W.ter[b]] || 1)) * .5; } return c; }
