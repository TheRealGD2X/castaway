// The island's ground, painted pixel by pixel (16 px per tile): organic edges, grass sitting a little above sand and
// paths with a dark lip, foam where water meets land, depth in the sea, tufts, flowers, pebbles and leaf litter.
// Pure function of the world (and season): repaint when the ground changes.
import { T, MW, MH, WATER } from "../world/gen.js";
import { vnoise } from "../core/noise.js";
import { hash3 } from "../core/rng.js";
import { R, OUT2 } from "./palette.js";
import { rgb, canvas } from "./pix.js";

export const TS = 16;
const LEVEL = t => WATER(t) ? 0 : (t === T.SAND || t === T.SHINGLE || t === T.MARSH) ? 1 : 2;

export function paintTerrain(W, opt = {}) {
  const PW = MW * TS, PH = MH * TS, s = W.seed, aut = opt.autumn || 0;
  // 1. material per pixel: the tile map, sampled through a smooth warp so edges curve naturally
  const WS = 4, ww = PW / WS + 2, wh = PH / WS + 2, wx = new Float32Array(ww * wh), wy = new Float32Array(ww * wh);
  for (let y = 0; y < wh; y++) for (let x = 0; x < ww; x++) { wx[y * ww + x] = (vnoise(x * .11, y * .11, s + 301) - .5) * 11; wy[y * ww + x] = (vnoise(x * .11, y * .11, s + 302) - .5) * 11; }
  const warp = (a, px, py) => { const fx = px / WS, fy = py / WS, x0 = fx | 0, y0 = fy | 0, u = fx - x0, v = fy - y0, i = y0 * ww + x0; return a[i] * (1 - u) * (1 - v) + a[i + 1] * u * (1 - v) + a[i + ww] * (1 - u) * v + a[i + ww + 1] * u * v; };
  const mat = new Uint8Array(PW * PH);
  const tt = (x, y) => W.ter[(y < 0 ? 0 : y >= MH ? MH - 1 : y) * MW + (x < 0 ? 0 : x >= MW ? MW - 1 : x)];
  const cand = new Int16Array(16), wsum = new Float32Array(16);
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    // blend the four nearest tiles (a smooth warp and a finer ripple make the edges organic), strongest type wins
    const qx = px + warp(wx, px, py) + (vnoise(px * .21, py * .21, s + 303) - .5) * 3, qy = py + warp(wy, px, py) + (vnoise(px * .21, py * .21, s + 304) - .5) * 3;
    const fx = qx / TS - .5, fy = qy / TS - .5, x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
    let nc = 0;
    const addW = (t, w) => { for (let k = 0; k < nc; k++) if (cand[k] === t) { wsum[k] += w; return; } cand[nc] = t; wsum[nc++] = w; };
    addW(tt(x0, y0), (1 - u) * (1 - v)); addW(tt(x0 + 1, y0), u * (1 - v)); addW(tt(x0, y0 + 1), (1 - u) * v); addW(tt(x0 + 1, y0 + 1), u * v);
    let bt = cand[0], bw = -1; for (let k = 0; k < nc; k++) if (wsum[k] > bw) { bw = wsum[k]; bt = cand[k]; }
    mat[py * PW + px] = bt === T.STREAM ? T.GRASS : bt;

  }
  // the stream: a winding channel through its tiles (a smooth curve with a little meander), cut into the ground
  if (W.stream && W.stream.length > 1) {
    const P0 = W.stream.map((i, k) => { const x = (i % MW) * TS + 8, y = ((i / MW) | 0) * TS + 8, m = (vnoise(k * .45, 0, s + 360) - .5) * 26; return [x + m, y + (vnoise(k * .45, 7, s + 361) - .5) * 18]; });
    { const L = P0[P0.length - 1], Pv = P0[P0.length - 2]; P0.push([L[0] + (L[0] - Pv[0]) * 1.5, L[1] + (L[1] - Pv[1]) * 1.5]); }
    const cr = (a, b, c, d, t) => .5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
    for (let k = 0; k < P0.length - 1; k++) {
      const a = P0[Math.max(0, k - 1)], b = P0[k], c = P0[k + 1], d = P0[Math.min(P0.length - 1, k + 2)];
      for (let t = 0; t < 1; t += .05) {
        const x = cr(a[0], b[0], c[0], d[0], t), y = cr(a[1], b[1], c[1], d[1], t), r = 3.2 + vnoise(x * .1, y * .1, s + 362) * 1.6;
        for (let oy = -5; oy <= 5; oy++) for (let ox = -5; ox <= 5; ox++) if (ox * ox + oy * oy <= r * r) { const px = Math.round(x + ox), py = Math.round(y + oy); if (px >= 0 && py >= 0 && px < PW && py < PH && !WATER(mat[py * PW + px])) mat[py * PW + px] = T.STREAM; }
      }
    }
  }
  // clean single stray pixels so every edge reads as a clean pixel-art line
  for (let py = 1; py < PH - 1; py++) for (let px = 1; px < PW - 1; px++) {
    const i = py * PW + px, m = mat[i], a = mat[i - 1], b = mat[i + 1], c = mat[i - PW], d = mat[i + PW];
    if (m !== a && m !== b && m !== c && m !== d) mat[i] = a === b ? a : c;
  }
  // distance from land for water depth (tile resolution, bilinear)
  const dl = new Float32Array(MW * MH).fill(99), q = [];
  for (let i = 0; i < MW * MH; i++) if (!WATER(W.ter[i]) || W.ter[i] === T.STREAM) { dl[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % MW, y = (i / MW) | 0; for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ax, ny = y + ay; if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue; const j = ny * MW + nx; if (dl[j] > dl[i] + 1) { dl[j] = dl[i] + 1; q.push(j); } } }
  // true distance (in pixels) from water to the nearest land, by a two-pass chamfer transform
  const wd = new Float32Array(PW * PH);
  for (let i = 0; i < PW * PH; i++) wd[i] = WATER(mat[i]) && mat[i] !== T.STREAM ? 1e6 : 0;
  for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) { const i = y * PW + x; if (!wd[i]) continue; let v = wd[i]; if (x > 0) v = Math.min(v, wd[i - 1] + 1); if (y > 0) { v = Math.min(v, wd[i - PW] + 1); if (x > 0) v = Math.min(v, wd[i - PW - 1] + 1.414); if (x < PW - 1) v = Math.min(v, wd[i - PW + 1] + 1.414); } wd[i] = v; }
  for (let y = PH - 1; y >= 0; y--) for (let x = PW - 1; x >= 0; x--) { const i = y * PW + x; if (!wd[i]) continue; let v = wd[i]; if (x < PW - 1) v = Math.min(v, wd[i + 1] + 1); if (y < PH - 1) { v = Math.min(v, wd[i + PW] + 1); if (x < PW - 1) v = Math.min(v, wd[i + PW + 1] + 1.414); if (x > 0) v = Math.min(v, wd[i + PW - 1] + 1.414); } wd[i] = v; }
  const depth = (px, py) => { const fx = px / TS - .5, fy = py / TS - .5, x0 = Math.max(0, Math.min(MW - 2, fx | 0)), y0 = Math.max(0, Math.min(MH - 2, fy | 0)), u = Math.max(0, Math.min(1, fx - x0)), v = Math.max(0, Math.min(1, fy - y0)), i = y0 * MW + x0; return dl[i] * (1 - u) * (1 - v) + dl[i + 1] * u * (1 - v) + dl[i + MW] * (1 - u) * v + dl[i + MW + 1] * u * v; };
  // 2. colour
  const cv = canvas(PW, PH), g = cv.getContext("2d"), im = g.createImageData(PW, PH), D = im.data;
  const put = (i, h) => { const c = rgb(h), o = i * 4; D[o] = c[0]; D[o + 1] = c[1]; D[o + 2] = c[2]; D[o + 3] = 255; };
  const M = (px, py) => px < 0 || py < 0 || px >= PW || py >= PH ? T.DEEP : mat[py * PW + px];
  const leafAut = [R.oakAut[1], R.oakAut[2], R.oakAut[3], R.birchAut[3]];
  for (let py = 0; py < PH; py++) for (let px = 0; px < PW; px++) {
    const i = py * PW + px, m = mat[i];
    const p1 = vnoise(px * .045, py * .045, s + 311), p2 = vnoise(px * .13, py * .13, s + 312), hs = hash3(px, py, s + 313);
    let c;
    if (WATER(m)) {
      // foam at the very edge, bright shallows, then depth
      const dp = m === T.STREAM ? 4 : wd[i], near = dp;
      const dep = m === T.LAKE ? Math.min(3.4, dp / 14) + .6 : m === T.STREAM ? 1.5 : dp / 16 + (vnoise(px * .02, py * .02, s + 318) - .5) * .8;
      if (near <= 1.5) c = R.foam[hs < .5 ? 0 : 1];
      else if (near <= 3) c = m === T.DEEP || m === T.SEA ? R.water[4] : R.water[3];
      else if (dep < 1.2) c = R.water[3];
      else if (dep < 2.2) c = R.water[2];
      else if (dep < 3.5) c = R.water[1];
      else c = dep < 6 ? R.water[0] : R.deep[dep < 9 ? 2 : dep < 13 ? 1 : 0];
      // soft wave lines on open water
      if (near > 6 && ((py + ((px / 7) | 0) * 3) % 11 === 0) && p2 > .55 && (px % 9) < 4) c = dep < 3.5 ? R.water[3] : R.water[1];
    } else if (m === T.SAND) {
      c = p1 > .62 ? R.sand[3] : p1 < .3 ? R.sand[1] : R.sand[2];
      if (hs < .012) c = R.sand[0]; else if (hs > .992) c = R.sand[4];
      if (WATER(M(px, py + 1)) || WATER(M(px, py + 2)) || WATER(M(px - 2, py)) || WATER(M(px + 2, py)) || WATER(M(px, py - 2))) c = R.sand[1];   // wet at the tideline
    } else if (m === T.SHINGLE) {
      const cs = 4, gx = Math.floor(px / cs), gy = Math.floor(py / cs); let best = 99, bx = 0, by = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { const cx = (gx + ox) * cs + hash3(gx + ox, gy + oy, s + 350) * cs, cy = (gy + oy) * cs + hash3(gx + ox, gy + oy, s + 351) * cs, r = 1.3 + hash3(gx + ox, gy + oy, s + 352) * 1.2, d = Math.sqrt((px - cx) ** 2 + ((py - cy) * 1.3) ** 2) / r; if (d < best) { best = d; bx = (px - cx) / r; by = (py - cy) / r; } }
      const tone = hash3(Math.floor(px / 4), Math.floor(py / 4), s + 353);
      c = best < .9 ? (-bx * .55 - by * .83 > .3 ? R.shingle[4] : tone < .5 ? R.shingle[2] : R.shingle[3]) : R.shingle[best < 1.2 ? 0 : 1];
    } else if (m === T.ROCK) {
      // rocky ground: flat stones bedded in thin turf and soil, each outlined and lit from the upper left
      const cs = 9, gx = Math.floor(px / cs), gy = Math.floor(py / cs); let best = 99, bx = 0, by = 0, br = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) { if (hash3(gx + ox, gy + oy, s + 343) > .55) continue; const cx = (gx + ox) * cs + hash3(gx + ox, gy + oy, s + 340) * cs, cy = (gy + oy) * cs + hash3(gx + ox, gy + oy, s + 341) * cs, r = 2.6 + hash3(gx + ox, gy + oy, s + 342) * 2.4, d = Math.sqrt((px - cx) ** 2 + ((py - cy) * 1.25) ** 2) / r; if (d < best) { best = d; bx = (px - cx) / r; by = (py - cy) / r; br = r; } }
      if (best < .82) { const l = -bx * .55 - by * .83; c = l > .45 ? R.rock[4] : l > 0 ? R.rock[3] : l > -.45 ? R.rock[2] : R.rock[1]; }
      else if (best < 1) c = R.rock[0];
      else c = p1 > .55 ? R.grass[1] : hs < .3 ? R.dirt[1] : R.wood[1];
    } else if (m === T.MARSH) {
      c = p1 > .55 ? R.marsh[2] : R.marsh[1];
      if (vnoise(px * .2, py * .2, s + 322) > .74) c = p2 > .5 ? R.water[2] : R.water[3];
    } else {
      const ramp = m === T.MEADOW ? R.meadow : m === T.WOOD ? R.wood : R.grass;
      const pa = (vnoise(px * .018, py * .018, s + 315) * .7 + vnoise(px * .05, py * .05, s + 316) * .3);
      const dz = ((px + py) & 1) ? .015 : -.015;                                   // a one-pixel checker where tones meet
      c = pa + dz > .6 ? ramp[3] : pa + dz < .36 ? ramp[1] : ramp[2];
      if (m === T.WOOD && vnoise(px * .3, py * .3, s + 317) > .8 && hs < .5) c = aut > .3 && hs < aut * .3 ? leafAut[(hs * 1000 | 0) % 4] : R.dirt[1];   // leaf litter in drifts
    }
    put(i, c);
  }
  // 3. details: tufts, flowers; then the lip where higher ground meets lower (grass over sand, sand over water)
  const tuft = (px, py, ramp) => { const i = py * PW + px; if (px < 1 || py < 3 || px >= PW - 1 || py >= PH) return; put(i, ramp[0]); put(i - PW, ramp[4]); put(i - PW - 1, ramp[3]); put(i - PW + 1, ramp[3]); put(i - 2 * PW - 1, ramp[4]); put(i - 2 * PW + 1, ramp[4]); };
  for (let cy = 0; cy < PH / 6; cy++) for (let cx = 0; cx < PW / 6; cx++) {
    const px = cx * 6 + ((hash3(cx, cy, s + 330) * 5) | 0), py = cy * 6 + ((hash3(cx, cy, s + 331) * 5) | 0), h = hash3(cx, cy, s + 332);
    const m = M(px, py); if (LEVEL(m) !== 2 || M(px, py + 2) !== m || M(px, py - 3) !== m) continue;
    if ((m === T.GRASS && h < .1) || (m === T.WOOD && h < .06)) tuft(px, py, m === T.WOOD ? R.wood : R.grass);
    else if (m === T.MEADOW && h < .18) { const fl = h < .06 ? "#f4f0e2" : h < .12 ? "#f2d34a" : "#ee8f8a"; put(py * PW + px, fl); put((py + 1) * PW + px, R.meadow[0]); if (h < .03) { put(py * PW + px + 2, fl); put((py + 1) * PW + px + 2, R.meadow[0]); } }
  }
  for (let py = 0; py < PH - 2; py++) for (let px = 0; px < PW; px++) {
    const m = mat[py * PW + px], L = LEVEL(m); if (!L) continue;
    const b1 = LEVEL(M(px, py + 1)), b2 = LEVEL(M(px, py + 2));
    if (L === 2 && b1 < 2) put(py * PW + px, OUT2);                          // the dark lip of the turf
    else if (L === 2 && b2 < 2) put(py * PW + px, (m === T.ROCK ? R.rock : m === T.MEADOW ? R.meadow : m === T.WOOD ? R.wood : R.grass)[0]);
    else if (L === 1 && b1 === 0 && m !== T.MARSH) put(py * PW + px, R.sand[0]);
    // turf edge to the sides and above: a thin darker line
    else if (L === 2 && (LEVEL(M(px - 1, py)) < 2 || LEVEL(M(px + 1, py)) < 2 || LEVEL(M(px, py - 1)) < 2)) put(py * PW + px, (m === T.ROCK ? R.rock : R.grass)[0]);
  }
  g.putImageData(im, 0, 0);
  return { cv, mat, PW, PH };
}
