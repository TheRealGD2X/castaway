// The island, generated from its seed. Terrain fields at tile resolution (1 tile = 2 m) and the first living things.
import { makeRng, hash3 } from "../core/rng.js";
import { fbm, vnoise } from "../core/noise.js";
import { clamp } from "../core/dmath.js";

export const MW = 112, MH = 84, N = MW * MH;
export const T = { DEEP: 0, SEA: 1, SAND: 2, GRASS: 3, MEADOW: 4, WOOD: 5, ROCK: 6, LAKE: 7, MARSH: 8, STREAM: 9, SHINGLE: 10 };
export const TNAME = ["deep sea", "shallows", "sand", "grass", "meadow", "woodland floor", "rock", "lake", "marsh", "stream", "shingle"];
export const idx = (x, y) => y * MW + x, tx = i => i % MW, ty = i => (i / MW) | 0;
export const WATER = t => t === T.DEEP || t === T.SEA || t === T.LAKE || t === T.STREAM;

export function generate(seed) {
  const rng = makeRng(seed);
  const h = new Float32Array(N), wet = new Float32Array(N), ter = new Uint8Array(N);
  const cx = MW / 2 + (rng.f() - .5) * 8, cy = MH / 2 + (rng.f() - .5) * 6;
  // height: a broad island with a ragged, bay-cut coast and a spine of higher ground
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const dx = (x - cx) / (MW * .42), dy = (y - cy) / (MH * .40), r = Math.sqrt(dx * dx + dy * dy);
    const coast = fbm(x * .06, y * .06, seed, 4) * .55 + fbm(x * .15, y * .15, seed + 9, 3) * .2;
    const spine = fbm(x * .03, y * .03, seed + 33, 3);
    h[idx(x, y)] = 1.05 - r * 1.15 + (coast - .38) * .9 + (spine - .5) * .35;
    wet[idx(x, y)] = fbm(x * .05 + 40, y * .05, seed + 71, 4);
  }
  // keep only the main landmass (flood from the centre), everything else goes back to sea
  const land = new Uint8Array(N), q = [idx(Math.round(cx), Math.round(cy))];
  const SEA_LVL = .12;
  if (h[q[0]] < SEA_LVL) h[q[0]] = SEA_LVL + .2;
  land[q[0]] = 1;
  while (q.length) { const i = q.pop(), x = tx(i), y = ty(i); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ax, ny = y + ay; if (nx < 1 || ny < 1 || nx >= MW - 1 || ny >= MH - 1) continue; const j = idx(nx, ny); if (!land[j] && h[j] >= SEA_LVL) { land[j] = 1; q.push(j); } } }
  // distance to the sea (for beaches and shallows)
  const dsea = new Int16Array(N).fill(999), bq = [];
  for (let i = 0; i < N; i++) if (!land[i]) { dsea[i] = 0; bq.push(i); }
  for (let k = 0; k < bq.length; k++) { const i = bq[k], x = tx(i), y = ty(i); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ax, ny = y + ay; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const j = idx(nx, ny); if (dsea[j] > dsea[i] + 1) { dsea[j] = dsea[i] + 1; bq.push(j); } } }
  const dland = new Int16Array(N).fill(999), lq = [];
  for (let i = 0; i < N; i++) if (land[i]) { dland[i] = 0; lq.push(i); }
  for (let k = 0; k < lq.length; k++) { const i = lq[k], x = tx(i), y = ty(i); for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ax, ny = y + ay; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const j = idx(nx, ny); if (dland[j] > dland[i] + 1) { dland[j] = dland[i] + 1; lq.push(j); } } }
  for (let i = 0; i < N; i++) {
    if (!land[i]) { ter[i] = dland[i] <= 3 ? T.SEA : T.DEEP; continue; }
    const x = tx(i), y = ty(i), e = h[i], m = wet[i], n = hash3(x, y, seed + 5);
    const beach = dsea[i] <= 1 + (vnoise(x * .2, y * .2, seed + 8) > .55 ? 1 : 0);
    if (beach) ter[i] = e > .55 && vnoise(x * .15, y * .15, seed + 12) > .62 ? T.ROCK : vnoise(x * .1, y * .1, seed + 14) > .72 ? T.SHINGLE : T.SAND;
    else if (e > .8 && vnoise(x * .12, y * .12, seed + 17) > .56) ter[i] = T.ROCK;
    else if (m > .56 || (m > .48 && e > .5)) ter[i] = T.WOOD;
    else if (m < .42 && vnoise(x * .09, y * .09, seed + 19) > .45) ter[i] = T.MEADOW;
    else ter[i] = T.GRASS;
  }
  // a freshwater lake in a hollow inland, and a stream from it to the sea
  let lake = -1, best = -1;
  for (let k = 0; k < 600; k++) { const i = rng.int(N); if (!land[i] || dsea[i] < 9) continue; const s = wet[i] * 2 - h[i] + dsea[i] * .02; if (s > best) { best = s; lake = i; } }
  const lakeTiles = [], world0 = { stream: [] };
  if (lake >= 0) {
    const lx = tx(lake), ly = ty(lake), rx = 4 + rng.int(3), ry = 3 + rng.int(2);
    for (let y = ly - ry - 2; y <= ly + ry + 2; y++) for (let x = lx - rx - 2; x <= lx + rx + 2; x++) {
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
      const i = idx(x, y), d = ((x - lx) / rx) ** 2 + ((y - ly) / ry) ** 2, j = vnoise(x * .4, y * .4, seed + 21) * .6;
      if (d < 1 + j - .3 && land[i] && dsea[i] > 3) { ter[i] = T.LAKE; lakeTiles.push(i); }
      else if (d < 1.9 + j && land[i] && ter[i] !== T.LAKE && dsea[i] > 2 && wet[i] > .45) ter[i] = T.MARSH;
    }
    // the stream: from the lake edge, always to a neighbour closer to the sea, a little meander
    let i = lakeTiles.length ? lakeTiles[lakeTiles.length >> 1] : lake, guard = 0; world0.stream = [i];
    while (guard++ < 200) {
      const x = tx(i), y = ty(i); let nb = -1, bd = 1e9;
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx(x + ax, y + ay); const d = dsea[j] + hash3(x + ax, y + ay, seed + 44) * .9; if (d < bd) { bd = d; nb = j; } }
      if (nb < 0 || !land[nb]) break;
      if (ter[nb] !== T.LAKE) ter[nb] = T.STREAM;
      i = nb; world0.stream.push(i); if (dsea[i] <= 0) break;
    }
  }
  const world = { seed, MW, MH, ter, h, wet, dsea, ents: [], nextId: 1, lake, cx, cy, stream: world0.stream };
  plant(world, rng);
  world.rng = rng;
  return world;
}

// the living things that stand on the island from the start
export const SP = {
  oak: { kind: "tree", deadKgDay: .06, maxKg: 6 },
  birch: { kind: "tree", deadKgDay: .05, maxKg: 4 },
  pine: { kind: "tree", deadKgDay: .05, maxKg: 5 },
  rowan: { kind: "tree", deadKgDay: .03, maxKg: 3 },
  hazel: { kind: "shrub", deadKgDay: .03, maxKg: 2 },
  bramble: { kind: "shrub" }, gorse: { kind: "shrub" }, fern: { kind: "plant" }, reeds: { kind: "plant" },
  boulder: { kind: "rock" }, flint: { kind: "rock" }, stones: { kind: "rock" },
};
function plant(W, rng) {
  const add = (k, x, y, o) => { const e = Object.assign({ id: W.nextId++, k, x, y }, o || {}); W.ents.push(e); return e; };
  for (let y = 1; y < MH - 1; y++) for (let x = 1; x < MW - 1; x++) {
    const i = idx(x, y), t = W.ter[i], n = hash3(x, y, W.seed + 101), n2 = hash3(x, y, W.seed + 102);
    const jx = x + .15 + hash3(x, y, W.seed + 103) * .7, jy = y + .2 + hash3(x, y, W.seed + 104) * .6;   // within the tile
    const mature = .45 + hash3(x, y, W.seed + 105) * .55;
    if (t === T.WOOD) {
      if (n < .36) { const sp = W.h[i] > .7 || n2 < .12 ? "pine" : n2 < .32 ? "birch" : n2 < .4 ? "rowan" : "oak"; add(sp, jx, jy, { size: mature, deadKg: 1 + n2 * 2 }); }
      else if (n < .52) add("hazel", jx, jy, { size: mature, deadKg: .5 });
      else if (n < .62) add("fern", jx, jy, { size: mature });
    } else if (t === T.GRASS) {
      if (n < .05) add(n2 < .5 ? "oak" : "rowan", jx, jy, { size: mature, deadKg: 1 });
      else if (n < .09) add("bramble", jx, jy, { size: mature });
      else if (n < .11) add("boulder", jx, jy, { size: .5 + n2 * .5 });
    } else if (t === T.MEADOW) {
      if (n < .03) add("hazel", jx, jy, { size: mature, deadKg: .5 });
      else if (n < .07) add("gorse", jx, jy, { size: mature });
    } else if (t === T.ROCK) {
      if (n < .12) add("boulder", jx, jy, { size: .5 + n2 * .5 });
      else if (n < .17) add("flint", jx, jy, { size: .5 });
      else if (n < .21) add("gorse", jx, jy, { size: .5 + n2 * .4 });
    } else if (t === T.SAND && W.dsea[i] >= 1 && n < .02) add("stones", jx, jy, { size: .4 });
    else if (t === T.MARSH && n < .45) add("reeds", jx, jy, { size: mature });
    else if (t === T.SHINGLE && n < .15) add("flint", jx, jy, { size: .4 });
  }
  W.ents.sort((a, b) => a.y - b.y || a.x - b.x);
}
