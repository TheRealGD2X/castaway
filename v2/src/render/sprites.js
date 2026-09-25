// Living things and rocks as pixel art, generated from their state (species, size, season, variant) and cached.
// Trees come in two parts (trunk and crown) so the crown can sway in the wind by whole pixels.
import { R, OUT, mix } from "./palette.js";
import { sprite, shadeIdx, canvas } from "./pix.js";
import { hash3 } from "../core/rng.js";

const cache = new Map();
const memo = (key, f) => { let v = cache.get(key); if (!v) { v = f(); cache.set(key, v); } return v; };
const q3 = s => s < .62 ? 0 : s < .82 ? 1 : 2;

// ---------- crowns: clumps of leaves lit from the upper left, dark crescents under each clump
function crown(P, blobs, ramps, opt) {
  const n = ramps[0].length, fall = opt.fall || 0, seed = opt.seed || 0;
  for (let y = 0; y < P.h; y++) for (let x = 0; x < P.w; x++) {
    let k1 = 0, b1 = null, k2 = 0;
    for (const b of blobs) { const dx = (x - b.x) / b.r, dy = (y - b.y) / (b.r * (b.sq || .92)), k = 1 - Math.sqrt(dx * dx + dy * dy); if (k > k1) { k2 = k1; k1 = k; b1 = b; } else if (k > k2) k2 = k; }
    if (k1 <= 0) continue;
    const hh = hash3(x, y, seed);
    if (fall > 0 && hh < fall) continue;                                            // leaves gone
    const nx = (x - b1.x) / b1.r, ny = (y - b1.y) / b1.r;
    let i = shadeIdx(nx, ny, n, b1.lift || 0);
    if (k2 > 0 && k1 < .2 && ny > .1) i = Math.max(0, i - 2);                      // shadow under the clump in front
    if (hh > .93 && i < n - 1 && ny < .2) i++; else if (hh < .06 && i > 0) i--;     // a little leaf texture
    P.set(x, y, (b1.ramp || ramps[0])[i]);
  }
}
function trunk(P, x0, yTop, yBot, w, ramp, opt = {}) {
  for (let y = yTop; y <= yBot; y++) {
    const flare = y > yBot - 2 ? 1 : 0;
    for (let x = x0 - flare; x < x0 + w + flare; x++) {
      const u = (x - x0 + flare) / (w + 2 * flare - 1 || 1);
      let c = ramp[u < .25 ? 3 : u < .6 ? 2 : 1];
      if (opt.birch) c = hash3(x, y, 7) < .12 ? OUT : ramp[u < .3 ? 3 : u < .7 ? 2 : 1];
      P.set(x, y, c);
    }
  }
}
function branches(P, x, y, ang, len, w, ramp, depth, seed) {         // bare winter limbs
  if (depth <= 0 || len < 2) return;
  const ex = x + Math.cos(ang) * len, ey = y - Math.sin(ang) * len;
  const steps = Math.ceil(len);
  for (let s = 0; s <= steps; s++) { const px = x + (ex - x) * s / steps, py = y + (ey - y) * s / steps; for (let k = 0; k < w; k++) P.set(px + k, py, ramp[k === 0 ? 3 : 1]); }
  const sp = .45 + hash3(depth, seed, 3) * .35;
  branches(P, ex, ey, ang + sp, len * .7, Math.max(1, w - 1), ramp, depth - 1, seed + 1);
  branches(P, ex, ey, ang - sp, len * .66, Math.max(1, w - 1), ramp, depth - 1, seed + 2);
}

// season: 0 = leaf, 1 = full autumn colour; fall: fraction of leaves gone
export function tree(sp, size, v, season) {
  const sc = q3(size), aut = Math.round((season.autumn || 0) * 4) / 4, fall = Math.round((season.fall || 0) * 4) / 4;
  return memo(`t:${sp}:${sc}:${v & 7}:${aut}:${fall}`, () => {
    const S = [.72, .86, 1][sc], seed = v * 17 + sc;
    if (sp === "pine") {
      const w = Math.round(30 * S) | 1, h = Math.round(46 * S), cx = w >> 1;
      const cr = sprite(w + 2, h, P => {
        const tiers = 4;
        for (let t = 0; t < tiers; t++) {
          const top = Math.round(t * h * .2), bot = Math.round(top + h * .36), half = (w / 2) * (.45 + t * .18);
          for (let y = top; y <= bot; y++) { const f = (y - top) / (bot - top), hw = half * f; for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) { const u = (x - (cx - hw)) / (2 * hw + .001); let i = u < .35 ? 3 : u < .7 ? 2 : 1; if (f > .82) i = Math.max(0, i - 1); if (hash3(x, y, seed) > .9) i = Math.min(4, i + 1); P.set(x + 1, y, R.pine[i]); } }
        }
      });
      const tr = sprite(8, 10, P => trunk(P, 2, 0, 8, 3, R.bark));
      return { crown: cr, trunk: tr, cx: cx + 1, crownY: h - 4, trunkY: 10, shadowW: w * .5 };
    }
    const kind = { oak: [R.oak, R.oakAut, 34, 40, 5], birch: [R.birchL, R.birchAut, 24, 42, 3], rowan: [R.rowan, R.oakAut, 24, 32, 3], hazel: [R.hazel, R.birchAut, 26, 22, 0] }[sp] || [R.oak, R.oakAut, 30, 36, 4];
    const [sum, autR, W0, H0, tw] = kind;
    const w = Math.round(W0 * S) + 4, ch = Math.round(H0 * S * .72), th = Math.round(H0 * S * .38);
    const cx = w / 2, cy = ch * .52, r = Math.min(w * .42, ch * .5);
    const blobs = [{ x: cx, y: cy, r: r * .82 }];
    const nb = sp === "birch" ? 7 : 5;
    for (let k = 0; k < nb; k++) {
      const a = -2.6 + k * (5.2 / (nb - 1)) + (hash3(k, v, 11) - .5) * .5, d = r * (.5 + hash3(k, v, 12) * .2);
      blobs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * .8 - r * .12, r: r * (sp === "birch" ? .42 : .52) * (.85 + hash3(k, v, 13) * .3) });
    }
    // each tree turns at its own pace, the whole crown together, a few clumps ahead of the rest
    const turn = Math.max(0, Math.min(1, aut + (hash3(v, 3, 77) - .5) * .7)), tq = Math.round(turn * 4) / 4;
    const own = sum.map((c0, i) => mix(c0, autR[i], tq));
    for (const b of blobs) { b.ramp = own; if (tq > 0 && tq < 1 && hash3(b.x | 0, b.y | 0, v + 21) < .25) b.ramp = sum.map((c0, i) => mix(c0, autR[i], Math.min(1, tq + .35))); }
    const bare = fall >= 1;
    const cr = bare ? null : sprite(w, ch + 2, P => {
      crown(P, blobs, [sum], { fall: fall * .8, seed });
      if (sp === "rowan" && aut > 0) for (let k = 0; k < 7; k++) { const x = Math.round(cx + (hash3(k, v, 31) - .5) * r * 1.4), y = Math.round(cy + hash3(k, v, 32) * r * .6); if (P.has(x, y)) { P.set(x, y, R.berry[2]); P.set(x + 1, y, R.berry[1]); P.set(x, y + 1, R.berry[1]); P.set(x + 1, y + 1, R.berry[0]); P.set(x, y - 1, R.berry[3]); } }
    });
    const trH = th + (bare ? ch * .7 : 0) | 0;
    const tr = sp === "hazel"
      ? sprite(w, th + 2, P => { for (const dx of [-4, -1, 2, 5]) for (let y = 0; y < th; y++) { const x = Math.round(cx + dx * (1 - y / th) * .6 + dx * .2); P.set(x, y, R.bark[y % 3 ? 2 : 3]); } }, { outline: false })
      : sprite(w, trH + 2, P => {
        const x0 = Math.round(cx - tw / 2);
        trunk(P, x0, 0, trH, Math.max(2, Math.round(tw * S)), sp === "birch" ? R.birch : R.bark, { birch: sp === "birch" });
        if (bare) { branches(P, cx, trH * .55, 1.1, trH * .35, 2, sp === "birch" ? R.birch : R.bark, 3, v); branches(P, cx, trH * .45, 2.0, trH * .32, 2, sp === "birch" ? R.birch : R.bark, 3, v + 5); }
      });
    return { crown: cr, trunk: tr, cx, crownY: ch - Math.round(r * .15), trunkY: trH, shadowW: w * .42 };
  });
}

export function shrub(k, size, v, season) {
  const sc = q3(size), aut = Math.round((season.autumn || 0) * 4) / 4, fr = season.fruit || 0;
  return memo(`s:${k}:${sc}:${v & 3}:${aut}:${fr > .5 ? 1 : 0}:${season.flower ? 1 : 0}`, () => {
    const S = [.75, .88, 1][sc];
    if (k === "fern") return { img: sprite(Math.round(18 * S), Math.round(12 * S), P => { const cx = P.w / 2, by = P.h - 1; for (let f = 0; f < 5; f++) { const a = 2.6 - f * .5; for (let s = 0; s < P.h * .95; s++) { const x = cx + Math.cos(a) * s * (f === 2 ? .2 : .75), y = by - Math.sin(a) * s * .9 - (s * s) * .0; P.set(x, y, R.fern[s < 3 ? 1 : 2]); if (s % 2 === 0) { P.set(x + 1, y, R.fern[3]); P.set(x - 1, y + 1, R.fern[1]); } } } }), ay: 1 };
    if (k === "reeds") return { img: sprite(14, 22, P => {
      // loose stalks of different heights leaning a little, bulrush heads from late summer
      for (let st = 0; st < 7; st++) {
        const x0 = 1 + st * 2 + ((hash3(st, v, 5) * 2) | 0), h = 11 + ((hash3(st, v, 6) * 9) | 0), lean = (hash3(st, v, 7) - .5) * .25;
        for (let y = 0; y < h; y++) { const x = Math.round(x0 + lean * y), yy = 21 - y; P.set(x, yy, R.reed[y > h - 4 ? 3 : y < 3 ? 0 : 1 + (st & 1)]); if (y === 0) P.set(x + 1, yy, R.reed[0]); }
        if ((aut > .2 || fr) && st % 2 === 0) { const x = Math.round(x0 + lean * (h - 3)); for (let y = 0; y < 4; y++) { P.set(x, 21 - h + 1 + y, y === 0 ? "#86592f" : "#5a3a22"); P.set(x + 1, 21 - h + 1 + y, "#3d2618"); } }
      }
    }, { outline: false }), ay: 1 };
    const w = Math.round((k === "gorse" ? 20 : 22) * S), h = Math.round((k === "gorse" ? 14 : 13) * S);
    const ramp = k === "gorse" ? [...R.gorse, R.gorse[2], R.gorse[2]] : [R.hazel[0], R.hazel[1], R.hazel[2], R.hazel[3], R.hazel[4]];
    const blobs = [{ x: w * .5, y: h * .6, r: h * .55 }, { x: w * .28, y: h * .68, r: h * .42 }, { x: w * .72, y: h * .68, r: h * .44 }, { x: w * .42, y: h * .42, r: h * .38, lift: .08 }];
    const img = sprite(w, h + 1, P => {
      crown(P, blobs, [k === "gorse" ? R.gorse.concat([R.gorse[2], R.gorse[2]]) : ramp], { seed: v * 3 });
      if (k === "bramble") {
        if (fr > .5) for (let b = 0; b < 8; b++) { const x = (hash3(b, v, 41) * (w - 3) + 1) | 0, y = (hash3(b, v, 42) * (h - 4) + 2) | 0; if (P.has(x, y)) { P.set(x, y, "#2a1a1d"); P.set(x + 1, y, "#3b2224"); P.set(x, y - 1, "#7a3a3e"); } }
        else if (season.flower) for (let b = 0; b < 6; b++) { const x = (hash3(b, v, 43) * (w - 3) + 1) | 0, y = (hash3(b, v, 44) * (h - 4) + 1) | 0; if (P.has(x, y)) P.set(x, y, "#f6eee4"); }
      }
      if (k === "gorse") for (let b = 0; b < 12; b++) { const x = (hash3(b, v, 45) * (w - 2) + 1) | 0, y = (hash3(b, v, 46) * (h - 3) + 1) | 0; if (P.has(x, y)) { P.set(x, y, R.gorseF[1]); if (b & 1) P.set(x + 1, y, R.gorseF[2]); } }
    });
    return { img, ay: 2 };
  });
}

export function rock(k, size, v) {
  const sc = q3(size);
  return memo(`r:${k}:${sc}:${v & 3}`, () => {
    if (k === "flint" || k === "stones") {
      const img = sprite(14, 8, P => {
        const n = 3, pos = [[5, 4.6, 2.4], [8.6, 5.2, 1.8], [6.8, 2.8, 1.5]];
        for (let s = 0; s < n; s++) { const cx = pos[s][0] + hash3(s, v, 51), cy = pos[s][1], rx = pos[s][2] * (k === "flint" ? .9 : 1), ry = rx * .72; const rp = k === "flint" ? R.flint : R.rock;
          for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) { const d = (x / rx) ** 2 + (y / ry) ** 2; if (d > 1) continue; P.set(cx + x, cy + y, rp[shadeIdx(x / rx, y / ry, 4)]); }
          if (k === "flint" && s === 1) P.set(cx, cy - 1, "#e8e0cc"); }
      });
      return { img, ay: 1 };
    }
    const S = [.7, .85, 1][sc], w = Math.round(22 * S), h = Math.round(16 * S);
    const blobs = [{ x: w * .5, y: h * .58, r: h * .5, sq: .78 }, { x: w * .3, y: h * .64, r: h * .36, sq: .8 }, { x: w * .7, y: h * .66, r: h * .34, sq: .8 }];
    const img = sprite(w, h + 1, P => {
      crown(P, blobs, [[R.rock[0], R.rock[1], R.rock[2], R.rock[3], R.rock[4]]], { seed: v * 5 + 3 });
      for (let x = 0; x < w; x++) for (let y = 0; y < h * .45; y++) if (P.has(x, y) && !P.has(x, y - 1) && hash3(x, v, 61) < .55) { P.set(x, y, R.grass[2]); if (hash3(x, v, 62) < .5) P.set(x, y + 1, R.grass[1]); }   // moss on top
      const cxx = (w * (.35 + hash3(v, 1, 63) * .3)) | 0; for (let y = (h * .45) | 0; y < h * .8; y++) if (P.has(cxx, y)) P.set(cxx + ((y & 2) ? 1 : 0), y, R.rock[0]);   // a crack
    });
    return { img, ay: 2 };
  });
}
// a soft oval of shade on the ground
export function shadow(w, h) {
  w = Math.max(4, Math.round(w)); h = Math.max(2, Math.round(h));
  return memo(`sh:${w}:${h}`, () => sprite(w, h, P => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const dx = (x + .5 - w / 2) / (w / 2), dy = (y + .5 - h / 2) / (h / 2); if (dx * dx + dy * dy <= 1) P.set(x, y, "#1d2a14"); } }, { outline: false }));
}
