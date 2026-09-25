// The camera and the frame: terrain, then everything standing on it sorted by depth, then the light of the hour.
// Integer zoom (device pixels per art pixel) keeps every pixel crisp; the crown of each tree sways by whole pixels.
import { TS } from "./terrain.js";
import { tree, shrub, rock, shadow, branch } from "./sprites.js";
import { drawWeather } from "./weather.js";
import { SKY, R, mix } from "./palette.js";
import { hash3 } from "../core/rng.js";
import { manSprite } from "./people.js";
import { structSprite, pileSprite, drawFire } from "./structs.js";

const TREES = new Set(["oak", "birch", "pine", "rowan", "hazel"]), SHRUBS = new Set(["bramble", "gorse", "fern", "reeds"]);
export function createView(cv, world, terr) {
  const g = cv.getContext("2d", { alpha: false });
  const V = { cam: { x: world.cx * TS, y: world.cy * TS }, k: 0, aw: 0, ah: 0 };
  V.resize = () => {
    const dpr = window.devicePixelRatio || 1;
    if (!V.k) V.k = Math.max(3, Math.round(dpr * 3));
    const W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr);
    V.aw = Math.ceil(W / V.k); V.ah = Math.ceil(H / V.k);
    cv.width = V.aw; cv.height = V.ah;
    cv.style.width = (V.aw * V.k / dpr) + "px"; cv.style.height = (V.ah * V.k / dpr) + "px";
    g.imageSmoothingEnabled = false;
  };
  V.zoom = (dir, fx, fy) => {                          // zoom by whole steps around a screen point
    const dpr = window.devicePixelRatio || 1, lv = [2, 3, 4, 5, 6, 8, 10, 12].map(v => Math.max(1, Math.round(v * dpr / 3 * 1.5))).filter((v, i, a) => a.indexOf(v) === i);
    let i = lv.indexOf(V.k); if (i < 0) i = lv.findIndex(v => v >= V.k);
    const ni = Math.max(0, Math.min(lv.length - 1, i + dir)); if (ni === i) return;
    const ax = V.cam.x + (fx * dpr / V.k - V.aw / 2), ay = V.cam.y + (fy * dpr / V.k - V.ah / 2);
    V.k = lv[ni]; V.resize();
    V.cam.x = ax - (fx * dpr / V.k - V.aw / 2); V.cam.y = ay - (fy * dpr / V.k - V.ah / 2);
  };
  const ents = world.ents;                             // sorted by y
  const firstRow = y => { let lo = 0, hi = ents.length; while (lo < hi) { const m = (lo + hi) >> 1; if (ents[m].y < y) lo = m + 1; else hi = m; } return lo; };
  V.draw = (now) => {
    const { aw, ah } = V, sx = Math.round(V.cam.x - aw / 2), sy = Math.round(V.cam.y - ah / 2);
    g.fillStyle = R.deep[0]; g.fillRect(0, 0, aw, ah);
    const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(terr.PW, sx + aw), y1 = Math.min(terr.PH, sy + ah);
    if (x1 > x0 && y1 > y0) g.drawImage(terr.cv, x0, y0, x1 - x0, y1 - y0, x0 - sx, y0 - sy, x1 - x0, y1 - y0);
    // water sparkle: a few bright pixels that come and go
    const fr = Math.floor(now / 400);
    for (let ty = Math.max(0, (sy / TS) | 0); ty <= Math.min(world.MH - 1, ((sy + ah) / TS) | 0); ty++) for (let tx = Math.max(0, (sx / TS) | 0); tx <= Math.min(world.MW - 1, ((sx + aw) / TS) | 0); tx++) {
      const t = world.ter[ty * world.MW + tx]; if (!(t === 0 || t === 1 || t === 7)) continue;
      const h = hash3(tx, ty, fr); if (h > .22) continue;
      const px = tx * TS + ((hash3(tx, ty, fr + 1) * 13) | 0) - sx, py = ty * TS + ((hash3(tx, ty, fr + 2) * 13) | 0) - sy;
      g.fillStyle = h < .08 ? "#e8fbf6" : R.water[4]; g.fillRect(px, py, h < .08 ? 2 : 1, 1);
    }
    // things lying on the ground (branches the wind brought down)
    for (const it of world.items) { const px = Math.round(it.x * TS) - sx, py = Math.round(it.y * TS) - sy; if (px < -30 || py < -10 || px > aw + 30 || py > ah + 10) continue; if (it.k === "branch") { const b = branch(it.len, it.id, it.moist); g.drawImage(b.img, px - (b.img.width >> 1), py - b.img.height + b.ay); } }
    // what he has made and the man himself, merged into the back-to-front order of trees and plants
    const dyn = [], M = world.man, windX = (world.wx.windDir >= 3 && world.wx.windDir <= 5 ? -1 : world.wx.windDir === 2 || world.wx.windDir === 6 ? 0 : 1) * world.wx.wind * .35;
    for (const s of world.structs) {
      const sp = structSprite(s); if (sp) dyn.push({ y: s.y + (s.k === "fireRing" ? -.05 : .3), f: () => g.drawImage(sp.img, Math.round(s.x * TS) - sx - sp.ox, Math.round(s.y * TS) - sy + 5 - sp.oy) });
      let k = 0; for (const m in s.onsite || {}) if (s.onsite[m] > 0) { const pl = pileSprite(m, s.onsite[m]), ox = (k++ - .5) * 14; dyn.push({ y: s.y + .45, f: () => g.drawImage(pl.img, Math.round(s.x * TS + ox + 16) - sx - pl.ox, Math.round(s.y * TS) - sy + 6 - pl.oy) }); }
    }
    for (const F of world.fires) dyn.push({ y: F.y, f: () => drawFire(g, F, Math.round(F.x * TS) - sx, Math.round(F.y * TS) - sy + 3, now, windX) });
    if (M) {
      const p = V.manPos(now), pose = M.pose === "walk" && ((M.inv.poles || 0) > 0 || (M.inv.fuel || 0) > 2) ? "carrywalk" : M.pose || "stand", ms = manSprite(pose, now);
      const inside = world.structs.find(q => (q.k === "leanto" || q.k === "debrisHut" || q.k === "roundhouse") && q.stage > 0 && Math.abs(q.x - p.x) < .6 && Math.abs(q.y - p.y) < .6);
      const px = Math.round(p.x * TS) - sx, py = Math.round(p.y * TS) - sy + (inside ? 5 : 4);
      const drawMan = () => { if (p.face < 0) { g.save(); g.translate(px, 0); g.scale(-1, 1); g.drawImage(ms.img, -ms.ox, py - ms.oy); g.restore(); } else g.drawImage(ms.img, px - ms.ox, py - ms.oy); };
      dyn.push({ y: inside ? inside.y + .35 : p.y + .02, f: () => { const sh = shadow(12, 4); g.globalAlpha = .3; g.drawImage(sh, px - 6, py - 2); g.globalAlpha = 1; drawMan(); } });
      V.xray = () => { g.globalAlpha = .38; drawMan(); g.globalAlpha = 1; };      // a ghost of him through whatever stands in front
    } else V.xray = null;
    dyn.sort((a, b) => a.y - b.y); let di = 0;
    // things on the ground, back to front
    const wk = Math.min(2.2, .35 + world.wx.wind / 7), wind = (Math.sin(now / (1900 - world.wx.wind * 60)) + Math.sin(now / 610) * .4) * wk;
    for (let i = firstRow(sy / TS - 1); i < ents.length; i++) {
      const e = ents[i]; if (e.y * TS - 60 > sy + ah) break;
      while (di < dyn.length && dyn[di].y < e.y) dyn[di++].f();
      const px = Math.round(e.x * TS) - sx, py = Math.round(e.y * TS) - sy; if (px < -40 || px > aw + 40) continue;
      if (TREES.has(e.k)) {
        const s = tree(e.k, e.size, e.id, { autumn: e.aut || 0, fall: e.fall || 0 }), sh = shadow(s.shadowW * 2, 7);
        g.globalAlpha = .32; g.drawImage(sh, px - (sh.width >> 1), py - 4); g.globalAlpha = 1;
        g.drawImage(s.trunk, px - Math.round(s.cx), py - s.trunk.height + 1);
        if (s.crown) { const sway = Math.round((wind + hash3(e.id, 0, 9) * 2 - 1) * .55 * (e.k === "pine" ? .6 : 1)); g.drawImage(s.crown, px - Math.round(s.cx) + sway, py - s.trunk.height - s.crown.height + 6); }
      } else if (SHRUBS.has(e.k)) {
        const s = shrub(e.k, e.size, e.id, { autumn: e.aut || 0, fruit: e.fruit || 0, flower: V.flower });
        if (e.k !== "fern" && e.k !== "reeds") { const sh = shadow(s.img.width * .9, 5); g.globalAlpha = .28; g.drawImage(sh, px - (sh.width >> 1), py - 3); g.globalAlpha = 1; }
        g.drawImage(s.img, px - (s.img.width >> 1), py - s.img.height + s.ay);
      } else {
        const s = rock(e.k, e.size, e.id);
        if (e.k === "boulder") { const sh = shadow(s.img.width * .95, 5); g.globalAlpha = .3; g.drawImage(sh, px - (sh.width >> 1), py - 3); g.globalAlpha = 1; }
        g.drawImage(s.img, px - (s.img.width >> 1), py - s.img.height + s.ay);
      }
    }
    while (di < dyn.length) dyn[di++].f();
    if (V.xray) V.xray();
    drawWeather(g, V, world, now, sx, sy);
    // firelight: warm light pooling round the hearth, strong at night, flickering
    const dark = Math.max(0, Math.min(1, (.12 - world.wx.elev) / .3));
    if (dark > .05) for (const F of world.fires) {
      const glow = Math.min(1, F.heat / 6000) + Math.min(.35, F.embers * 2); if (glow < .03) continue;
      const px = Math.round(F.x * TS) - sx, py = Math.round(F.y * TS) - sy, r = 34 + glow * 30 + Math.sin(now / 120) * 1.5;
      const gr = g.createRadialGradient(px, py, 2, px, py, r); gr.addColorStop(0, `rgba(255,170,90,${.55 * glow * dark})`); gr.addColorStop(.5, `rgba(240,120,50,${.22 * glow * dark})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.globalCompositeOperation = "lighter"; g.fillStyle = gr; g.fillRect(px - r, py - r, r * 2, r * 2); g.globalCompositeOperation = "source-over";
    }
  };
  // where to draw him: along the way he walked during the last simulated minute, smoothly, in real time
  V.manPos = now => {
    const M = world.man, tr = M.trail && M.trail.length > 1 ? M.trail : null;
    if (!tr) return { x: M.x, y: M.y, face: M.face || 1 };
    const frac = Math.max(0, Math.min(1, (Date.now() - world.born) / 60000 - world.t));
    let L = 0; for (let k = 1; k < tr.length; k++) L += Math.hypot(tr[k][0] - tr[k - 1][0], tr[k][1] - tr[k - 1][1]);
    let d = L * frac;
    for (let k = 1; k < tr.length; k++) { const a = tr[k - 1], b = tr[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (d <= l || k === tr.length - 1) { const f = l ? Math.min(1, d / l) : 1; return { x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, face: b[0] > a[0] + .01 ? 1 : b[0] < a[0] - .01 ? -1 : M.face || 1 }; } d -= l; }
    return { x: M.x, y: M.y, face: M.face || 1 };
  };
  V.resize();
  return V;
}
