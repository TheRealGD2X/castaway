// What he builds, drawn from what is actually there: each structure's family, orientation, the stages done and
// how far the current one has got. Poles go up one by one, thatch creeps up the roof course by course, stones go
// round the hearth, logs stack on the woodpile as he brings them. Fires are drawn from their fuel and heat, with
// flames, glowing embers and smoke that drifts with the wind. Materials he's brought but not used lie in piles.
import { R, OUT } from "./palette.js";
import { sprite } from "./pix.js";
import { hash3 } from "../core/rng.js";

const cache = new Map();
const memo = (k, f) => { let v = cache.get(k); if (!v) { v = f(); cache.set(k, v); } return v; };
const line = (P, x0, y0, x1, y1, c, c2) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1); for (let s = 0; s <= n; s++) { const x = Math.round(x0 + (x1 - x0) * s / n), y = Math.round(y0 + (y1 - y0) * s / n); P.set(x, y, c); if (c2) P.set(x, y + 1, c2); } };
const COVERC = { bracken: ["#6b4f22", "#8a6a2c", "#a88438", "#c29a48"], boughs: R.pine, debris: ["#5a3a1e", "#7a4f26", "#9a6a32", "#b8843e"], reeds: R.reed };
const q = v => Math.round(v * 8) / 8;
// where on the stage list a structure is: 0..n (stage index + progress)
const done = (s, k) => s.stage > k ? 1 : s.stage === k ? s.prog : 0;
const coverOf = (s, k) => Object.keys(s.stages[k]?.need || {}).find(m => COVERC[m]) || "bracken";

// ------------------------------------------------------------ the lean-to, in four orientations
function leanto(s) {
  const fr = done(s, 0), rf = done(s, 1), bd = done(s, 2), cov = COVERC[coverOf(s, 1)], bed = COVERC[coverOf(s, 2)] || R.pine;
  return memo(`lt:${s.dir}:${q(fr)}:${q(rf)}:${q(bd)}:${coverOf(s, 1)}`, () => {
    const w = 30, h = 28, ox = 15, oy = 24;                                    // (ox, oy) = the ground under the middle
    const img = sprite(w, h, P => {
      const post = (x, top, bot) => { line(P, x, top, x, bot, R.bark[3], null); line(P, x + 1, top + 1, x + 1, bot, R.bark[1]); P.set(x - 1, top - 1, R.bark[3]); P.set(x + 2, top - 1, R.bark[2]); };
      const npost = fr >= 1 ? 3 : Math.floor(fr * 3.99);
      if (s.dir === 1 || s.dir === 3) {      // open side toward (1) or away from (3) the viewer: ridge runs across
        const ridgeY = s.dir === 1 ? 9 : 7, backY = s.dir === 1 ? 4 : oy;
        if (s.dir === 1) {
          // interior: shade and the bed
          if (rf > .3) for (let y = ridgeY + 1; y <= oy; y++) for (let x = 5; x <= 24; x++) P.set(x, y, (x + y) % 5 ? "#3a2c22" : "#33261d");
          if (bd > 0) for (let y = oy - 4; y <= oy - 1; y++) for (let x = 7; x <= 7 + Math.round(15 * bd); x++) P.set(x, y, bed[1 + ((hash3(x, y, 5) * 2) | 0)]);
          // roof seen from the front: slopes up and back from the ridge to the ground behind
          const rows = Math.round(rf * 6);
          for (let r = 0; r < rows; r++) for (let x = 3 - (r >> 1); x <= 26 + (r >> 1); x++) P.set(x, ridgeY - 1 - r, cov[Math.min(3, ((r + (x & 1)) >> 1) + 1)]);
          if (rf > 0 && rf < 1) for (let x = 5; x <= 24; x += 3) line(P, x, ridgeY - 1, x - 2 + (x > 15 ? 4 : 0), ridgeY - 7, R.bark[2]);      // bare rafters above the thatch line
          if (npost >= 1) post(4, ridgeY - 1, oy); if (npost >= 2) post(24, ridgeY - 1, oy);
          if (npost >= 3) line(P, 2, ridgeY, 27, ridgeY, R.bark[4], R.bark[2]);
        } else {
          // seen from behind: the roof slope faces us, running from the ground up to the ridge
          if (npost >= 1) post(4, 7, oy - 8); if (npost >= 2) post(24, 7, oy - 8);
          if (npost >= 3) line(P, 2, 8, 27, 8, R.bark[4], R.bark[2]);
          if (rf > 0) { for (let x = 5; x <= 24; x += 3) line(P, x, 9, x, oy, R.bark[2]); }
          const rows = Math.round(rf * (oy - 9));
          for (let r = 0; r < rows; r++) { const y = oy - r; for (let x = 3; x <= 26; x++) P.set(x, y, cov[((hash3(x, y, 3) * 2) | 0) + (r % 3 === 0 ? 0 : 1) + ((x & 3) === 0 ? 1 : 0)] || cov[2]); }
        }
      } else {                               // open side to the east (0) or west (2): we see it in profile
        const flip = s.dir === 2, X = x => flip ? w - 1 - x : x;
        const topX = 21, topY = 8, baseX = 6;
        if (rf > .3) for (let y = topY + 1; y <= oy; y++) for (let x = baseX; x <= topX; x++) { const edge = baseX + (topX - baseX) * (oy - y) / (oy - topY); if (x >= edge) P.set(X(x), y, "#3a2c22"); }
        if (bd > 0) for (let x = topX - Math.round(10 * bd); x <= topX; x++) for (let y = oy - 3; y <= oy - 1; y++) P.set(X(x), y, bed[1 + (hash3(x, y, 5) * 2 | 0)]);
        if (npost >= 1) { line(P, X(topX), topY, X(topX), oy, R.bark[3]); line(P, X(topX + (flip ? -1 : 1)), topY + 1, X(topX + (flip ? -1 : 1)), oy, R.bark[1]); }
        if (npost >= 2) line(P, X(topX - 1), topY - 2, X(topX + 2), topY - 2, R.bark[2]);
        if (npost >= 3) line(P, X(topX - 3), topY - 1, X(topX + 4), topY - 1, R.bark[4], R.bark[2]);
        if (rf > 0) line(P, X(topX), topY, X(baseX), oy, R.bark[2]);                                   // the rafter line
        const cover = Math.round(rf * 16);
        for (let k = 0; k < cover; k++) { const t = k / 16, x = Math.round(baseX + (topX - baseX) * t), y = Math.round(oy - (oy - topY) * t); for (let d = -2; d <= 1; d++) P.set(X(x + d), y - 1, cov[2 + (d > 0 ? 1 : 0) - (k % 3 === 0 ? 1 : 0)]); P.set(X(x - 3), y, cov[0]); }
      }
    });
    return { img, ox, oy };
  });
}
// ------------------------------------------------------------ the debris hut: a long mound of leaves over a ridge pole
function debrisHut(s) {
  const a = done(s, 0), b = done(s, 1), c = done(s, 2);
  return memo(`dh:${s.dir}:${q(a)}:${q(b)}:${q(c)}`, () => {
    const w = 30, h = 18, ox = 15, oy = 15;
    const img = sprite(w, h, P => {
      const side = s.dir === 0 || s.dir === 2, flip = s.dir === 2, X = x => flip ? w - 1 - x : x;
      if (a > 0) { line(P, X(4), oy, X(24), 5, R.bark[3], R.bark[1]); line(P, X(24), 5, X(24), oy, R.bark[2]); }
      if (b > 0) for (let k = 0; k < Math.round(b * 7); k++) { const x = 6 + k * 3; line(P, X(x), oy, X(x + 1), oy - 2 - Math.round(k * 1.3), R.bark[2]); }
      if (c > 0) for (let y = 0; y <= oy; y++) for (let x = 0; x < w; x++) {
        const dx = (x - 15) / 14, dy = (y - oy) / (11 * (side ? 1 : .8)), r = dx * dx + dy * dy; if (r > c * 1.05 || y > oy) continue;
        P.set(x, y, COVERC.debris[Math.min(3, ((1 - r) * 3 + hash3(x, y, 9) * 1.2) | 0)]);
      }
      if (c > .8 && (s.dir === 1)) for (let y = oy - 4; y <= oy; y++) for (let x = 13; x <= 17; x++) P.set(x, y, "#2e2119");   // the way in
    });
    return { img, ox, oy };
  });
}
// ------------------------------------------------------------ the fire ring, reflector wall, woodpile, roundhouse
function fireRing(s) {
  const n = Math.round(done(s, 0) * 10);
  return memo(`fr:${n}`, () => ({ img: sprite(18, 10, P => { for (let k = 0; k < n; k++) { const a = k / 10 * 6.283, x = Math.round(9 + Math.cos(a) * 7), y = Math.round(5 + Math.sin(a) * 3.4); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) P.set(x - 1 + i, y + j, R.rock[j ? 1 : 2 + (i === 0 ? 1 : 0)]); } }), ox: 9, oy: 6 }));
}
function reflector(s) {
  const n = Math.round(done(s, 0) * 5), across = s.dir === 1 || s.dir === 3;
  return memo(`rf:${n}:${across}`, () => ({ img: sprite(22, 16, P => {
    if (across) { line(P, 3, 2, 3, 13, R.bark[3]); line(P, 18, 2, 18, 13, R.bark[3]); for (let k = 0; k < n; k++) { const y = 13 - k * 2; line(P, 2, y, 19, y, R.bark[3 + (k & 1)], R.bark[1]); } }
    else { line(P, 11, 1, 11, 14, R.bark[3]); for (let k = 0; k < n; k++) { const y = 14 - k * 2; line(P, 8, y, 14, y - 3, R.bark[3 + (k & 1)], R.bark[1]); } }
  }), ox: 11, oy: 14 }));
}
function woodpile(s) {
  const r = done(s, 0), c = done(s, 1), logs = Math.min(18, Math.round((s.kg || 0) / 2));
  return memo(`wp:${q(r)}:${q(c)}:${logs}`, () => ({ img: sprite(22, 16, P => {
    if (r > 0) { line(P, 2, 14, 19, 14, R.bark[2]); if (r >= 1) line(P, 3, 12, 18, 12, R.bark[2]); }
    for (let k = 0; k < logs; k++) { const row = Math.floor(k / 6), col = k % 6, x = 4 + col * 3 - (row & 1), y = 11 - row * 2; P.set(x, y, R.bark[4]); P.set(x + 1, y, R.bark[3]); P.set(x, y + 1, R.bark[1]); P.set(x + 1, y + 1, R.bark[2]); }
    if (c > 0) { const top = 11 - Math.ceil(logs / 6) * 2 - 1; for (let x = 2; x <= 2 + Math.round(17 * c); x++) { P.set(x, top, COVERC.bracken[2]); P.set(x, top - 1, COVERC.bracken[3 - (x & 1)]); } }
  }), ox: 11, oy: 14 }));
}
function roundhouse(s) {
  const st = done(s, 0), we = done(s, 1), da = done(s, 2), ra = done(s, 3), th = done(s, 4);
  return memo(`rh:${q(st)}:${q(we)}:${q(da)}:${q(ra)}:${q(th)}`, () => ({ img: sprite(44, 40, P => {
    const cx = 22, base = 36, wallH = 9;
    const nst = Math.round(st * 14);
    for (let k = 0; k < nst; k++) { const a = Math.PI * (k / 13); const x = Math.round(cx - Math.cos(a) * 17); line(P, x, base - wallH - 1, x, base - Math.round(Math.sin(a) * 4), R.bark[2]); }
    for (let y = base - wallH; y <= base; y++) for (let x = cx - 17; x <= cx + 17; x++) { const f = (y - (base - wallH)) / wallH; if (hash3(x, y, 2) < we) P.set(x, y, (x + y) & 1 ? R.bark[3] : R.bark[2]); if (hash3(x, y, 4) < da) P.set(x, y, ["#8a6a4a", "#9e7c58", "#b38e66"][(f * 2.5 | 0)]); }
    if (ra > 0) for (let k = 0; k <= Math.round(ra * 8); k++) line(P, cx - 18 + k * 4.5, base - wallH - 1, cx, 4, R.bark[3]);
    if (th > 0) for (let y = 4; y <= base - wallH + 1; y++) { const hw = (y - 4) / (base - wallH - 3) * 21; if ((base - wallH + 1 - y) / (base - wallH - 3) > th) continue; for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) P.set(x, y, R.reed[((y >> 1) + (x & 1)) % 4]); }
    if (da > .9) for (let y = base - 6; y <= base; y++) for (let x = cx - 3; x <= cx + 2; x++) P.set(x, y, "#2e2119");
  }), ox: 22, oy: 36 }));
}
export function structSprite(s) {
  switch (s.k) {
    case "leanto": return leanto(s);
    case "debrisHut": return debrisHut(s);
    case "fireRing": return fireRing(s);
    case "reflector": return reflector(s);
    case "woodpile": return woodpile(s);
    case "roundhouse": return roundhouse(s);
  }
  return null;
}
// ------------------------------------------------------------ piles of materials waiting on a site
export function pileSprite(m, n) {
  n = Math.min(12, Math.round(n));
  return memo(`pile:${m}:${n}`, () => ({ img: sprite(14, 8, P => {
    for (let k = 0; k < n; k++) {
      if (m === "poles") line(P, 1, 6 - (k % 4), 12, 5 - (k % 4), R.bark[2 + (k & 1)]);
      else if (m === "stones") { const x = 2 + (k * 3) % 10, y = 5 - ((k / 4) | 0); P.set(x, y, R.rock[3]); P.set(x + 1, y, R.rock[2]); P.set(x, y + 1, R.rock[1]); P.set(x + 1, y + 1, R.rock[1]); }
      else { const c = COVERC[m] || R.fern; for (let i = 0; i < 4; i++) P.set(2 + (k * 2) % 9 + i, 6 - (k / 5 | 0) - (i & 1), c[1 + ((k + i) & 1)]); }
    }
  }), ox: 7, oy: 6 }));
}
// ------------------------------------------------------------ fire: the hearth, its wood, flames, embers, smoke
export function drawFire(g, F, px, py, now, wind) {
  // ash and the unburnt wood
  g.fillStyle = "#3b322c"; g.fillRect(px - 4, py - 1, 9, 3); g.fillStyle = "#57504a"; g.fillRect(px - 3, py, 7, 1);
  const logs = Math.min(6, Math.round(F.fuel.logs[0] / 1.2)), kin = F.fuel.kindling[0] > .1;
  for (let k = 0; k < logs; k++) { const a = k * 1.05; g.fillStyle = R.bark[2 + (k & 1)]; for (let s = -3; s <= 3; s++) g.fillRect(px + Math.round(Math.cos(a) * s), py - 1 + Math.round(Math.sin(a) * s * .45), 1, 1); }
  if (kin) { g.fillStyle = R.bark[4]; for (let s = 0; s < 5; s++) { g.fillRect(px - 2 + s, py - 2 - (s & 1), 1, 1); } }
  // embers: a glow in the ash that pulses
  if (F.embers > .02) { const p = .6 + .4 * Math.sin(now / 700); g.fillStyle = `rgba(255,${120 + (p * 60 | 0)},60,${Math.min(1, F.embers * 4) * p})`; g.fillRect(px - 2, py - 1, 5, 2); g.fillStyle = "#ffd28a"; if (p > .8) g.fillRect(px, py - 1, 1, 1); }
  // flames: tongues whose height follows the heat, flickering, leaning with the wind
  if (F.lit && F.heat > 200) {
    const hgt = Math.min(13, 3 + Math.sqrt(F.heat / 1000) * 3.2), lean = Math.max(-2, Math.min(2, wind * .25));
    const cols = ["#b3321f", "#e2582a", "#f59a3a", "#fcd26a", "#fff3c4"];
    for (let k = -2; k <= 2; k++) {
      const fl = hash3(k, Math.floor(now / 90), 3), hh = Math.round(hgt * (1 - Math.abs(k) * .28) * (.75 + fl * .35));
      for (let y = 0; y < hh; y++) { const t = y / hh, ci = Math.max(0, Math.min(4, Math.round((1 - t) * 3.4 - Math.abs(k) * .6 + (fl > .7 ? .6 : 0)))); g.fillStyle = cols[ci]; g.fillRect(px + k + Math.round(lean * t * t), py - 2 - y, 1, 1); }
    }
    // sparks now and then
    const sp = hash3(Math.floor(now / 160), 7, 1); if (sp > .8) { g.fillStyle = "#ffd28a"; g.fillRect(px + Math.round((sp - .9) * 30) + Math.round(lean * 2), py - hgt - 3 - ((now / 60) % 6 | 0), 1, 1); }
  }
  // smoke: soft grey puffs rising and drifting downwind, fading
  if (F.heat > 100 || F.embers > .05) {
    const n = F.lit ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const life = ((now / 1000 + i * .7) % 5) / 5, x = px + Math.round(wind * life * 7 + Math.sin(now / 900 + i) * 1.5), y = py - 6 - Math.round(life * 26);
      g.fillStyle = `rgba(206,202,196,${(1 - life) * (F.lit ? .45 : .25)})`; const r = 1 + Math.round(life * 2); g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
}
