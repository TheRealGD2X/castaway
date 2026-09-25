// The camera and the frame: terrain, then everything standing on it sorted by depth, then the light of the hour.
// Integer zoom (device pixels per art pixel) keeps every pixel crisp; the crown of each tree sways by whole pixels.
import { TS } from "./terrain.js";
import { tree, shrub, rock, shadow, branch } from "./sprites.js";
import { drawWeather } from "./weather.js";
import { SKY, R, mix } from "./palette.js";
import { hash3 } from "../core/rng.js";

const TREES = new Set(["oak", "birch", "pine", "rowan", "hazel"]), SHRUBS = new Set(["bramble", "gorse", "fern", "reeds"]);
export function createView(cv, world, terr) {
  const g = cv.getContext("2d", { alpha: false });
  const V = { cam: { x: world.cx * TS, y: world.cy * TS }, k: 0, aw: 0, ah: 0 };
  V.resize = () => {
    const dpr = window.devicePixelRatio || 1;
    if (!V.k) V.k = Math.max(2, Math.round(dpr * 2));
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
    // things on the ground, back to front
    const wk = Math.min(2.2, .35 + world.wx.wind / 7), wind = (Math.sin(now / (1900 - world.wx.wind * 60)) + Math.sin(now / 610) * .4) * wk;
    for (let i = firstRow(sy / TS - 1); i < ents.length; i++) {
      const e = ents[i]; if (e.y * TS - 60 > sy + ah) break;
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
    drawWeather(g, V, world, now, sx, sy);
  };
  V.resize();
  return V;
}
