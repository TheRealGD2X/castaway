// Pixel helpers: sprites are painted pixel by pixel into small canvases, then outlined, then cached.
import { OUT } from "./palette.js";
const HEX = new Map();
export function rgb(h) {
  let v = HEX.get(h); if (v) return v;
  v = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; HEX.set(h, v); return v;
}
const mk = (w, h) => { if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h); const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export const canvas = mk;
// paint a sprite: fn(P) where P.set(x, y, hex) / P.get(x, y) / P.w / P.h; then a 1 px outline around the silhouette
export function sprite(w, h, fn, opt) {
  const c = mk(w, h), g = c.getContext("2d"), im = g.createImageData(w, h), d = im.data;
  const P = {
    w, h,
    set(x, y, col) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h || !col) return; const o = (y * w + x) * 4, c3 = rgb(col); d[o] = c3[0]; d[o + 1] = c3[1]; d[o + 2] = c3[2]; d[o + 3] = 255; },
    has(x, y) { x |= 0; y |= 0; return x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0; },
    clear(x, y) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= w || y >= h) return; d[(y * w + x) * 4 + 3] = 0; },
  };
  fn(P);
  if (!opt || opt.outline !== false) outline(d, w, h, (opt && opt.out) || OUT);
  g.putImageData(im, 0, 0);
  return c;
}
function outline(d, w, h, col) {
  const c3 = rgb(col), mark = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3]) continue;
    const s = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] && !mark[yy * w + xx];
    if (s(x - 1, y) || s(x + 1, y) || s(x, y - 1) || s(x, y + 1)) mark[y * w + x] = 1;
  }
  for (let i = 0; i < w * h; i++) if (mark[i]) { const o = i * 4; d[o] = c3[0]; d[o + 1] = c3[1]; d[o + 2] = c3[2]; d[o + 3] = 255; }
}
// shade a round form lit from the top-left: returns a ramp index for a point with local normal (nx, ny) in [-1, 1]
export function shadeIdx(nx, ny, n, bias = 0) {
  const l = .5 + .5 * (-nx * .55 - ny * .83) + bias;            // light from the upper left
  return Math.max(0, Math.min(n - 1, Math.floor(l * n)));
}
