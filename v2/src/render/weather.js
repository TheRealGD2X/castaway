// Weather you can see: rain slanting with the wind, drifting cloud shadow, fog, wet ground, and the light of the sun
// (from its real elevation, dimmed and cooled by cloud). Display only: reads W.wx, never writes the world.
import { canvas } from "./pix.js";
import { vnoise } from "../core/noise.js";
import { mix } from "./palette.js";

let shadowTex = null;
function cloudShadowTexture() {                           // a tileable field of soft cloud blobs, dithered at the edges
  if (shadowTex) return shadowTex;
  const S = 192, c = canvas(S, S), g = c.getContext("2d"), im = g.createImageData(S, S), d = im.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const f = (a, b, k) => vnoise(a / k, b / k, 77) * (1 - x / S) * (1 - y / S) + vnoise((a - S) / k, b / k, 77) * (x / S) * (1 - y / S) + vnoise(a / k, (b - S) / k, 77) * (1 - x / S) * (y / S) + vnoise((a - S) / k, (b - S) / k, 77) * (x / S) * (y / S);
    const v = f(x, y, 38) * .7 + f(x, y, 13) * .3, dither = ((x + y) & 1) ? .02 : -.02;
    const o = (y * S + x) * 4; d[o] = 20; d[o + 1] = 28; d[o + 2] = 40; d[o + 3] = v + dither > .56 ? 255 : 0;
  }
  g.putImageData(im, 0, 0); shadowTex = c; return c;
}
let fogTex = null;
function fogTexture() {                                    // the same soft blob field, pale and see-through
  if (fogTex) return fogTex;
  const src = cloudShadowTexture(), S = src.width, c = canvas(S, S), g = c.getContext("2d");
  g.drawImage(src, 0, 0); g.globalCompositeOperation = "source-in"; g.fillStyle = "rgba(238,242,242,.55)"; g.fillRect(0, 0, S, S);
  fogTex = c; return c;
}
// the multiply tint for the sky: sun elevation (sin) and cloud
export function skyTint(x) {
  const e = x.elev, cl = x.cloud;
  let c;
  if (e > .25) c = "#ffffff";
  else if (e > .05) c = mix("#ffd9a8", "#ffffff", (e - .05) / .2);
  else if (e > -.05) c = mix("#c9867a", "#ffd9a8", (e + .05) / .1);
  else if (e > -.2) c = mix("#4f5f90", "#c9867a", (e + .2) / .15);
  else c = "#46568a";
  if (cl > .5) c = mix(c, mix(c, "#b4bcc4", .5), Math.min(1, (cl - .5) * 1.6));   // overcast: greyer, flatter light
  if (x.rain > 0) c = mix(c, "#8e98a6", Math.min(.55, x.rain * .22));             // rain: gloomier still
  return c;
}
export function drawWeather(g, V, W, now, sx, sy) {
  const x = W.wx, { aw, ah } = V;
  // cloud shadow drifting with the wind (only when the sun is up and the sky broken)
  if (x.elev > 0 && x.cloud > .2 && x.cloud < .95) {
    const tex = cloudShadowTexture(), S = tex.width, dir = x.windDir * Math.PI / 4, sp = x.wind * .004;
    const ox = Math.floor((((sx + now * sp * Math.sin(dir)) % S) + S) % S), oy = Math.floor((((sy - now * sp * Math.cos(dir)) % S) + S) % S);
    g.globalAlpha = .16 * Math.min(1, x.cloud * 1.6);
    for (let y = -oy; y < ah; y += S) for (let xx = -ox; xx < aw; xx += S) g.drawImage(tex, xx, y);
    g.globalAlpha = 1;
  }
  // wet ground: a cool darkening while it rains and for a while after
  if (x.rain > 0) { g.fillStyle = "rgba(30,40,60,.10)"; g.fillRect(0, 0, aw, ah); }
  // rain: slanted streaks (more, longer and faster the harder it falls; the wind leans them) and splashes where they land
  if (x.rain > .05) {
    const n = Math.min(1400, Math.round(aw * ah / 500 * Math.min(4, x.rain))), slant = (x.windDir >= 4 ? -1 : 1) * Math.min(3, x.wind / 5), t = now / 1000;
    g.fillStyle = "rgba(220,236,248,.78)";
    for (let i = 0; i < n; i++) {
      const hx = (i * 7919) % 1000 / 1000, hy = (i * 104729) % 1000 / 1000, sp = 220 + (i % 5) * 30;
      const px = Math.floor((hx * (aw + 40) + slant * t * sp * .3) % (aw + 40)) - 20, py = Math.floor((hy * ah + t * sp) % ah);
      for (let k = 0; k < 6; k++) g.fillRect(px + Math.round(slant * k * .3), py + k, 1, 1);
    }
    g.fillStyle = "rgba(226,240,248,.8)";
    const fr = Math.floor(now / 120), ns = Math.min(260, Math.round(aw * ah / 2500 * Math.min(4, x.rain)));
    for (let i = 0; i < ns; i++) { const hx = ((i * 2654435761 + fr * 40503) >>> 0) % 997 / 997, hy = ((i * 40503 + fr * 2654435761) >>> 0) % 991 / 991, px = Math.floor(hx * aw), py = Math.floor(hy * ah); g.fillRect(px - 1, py, 1, 1); g.fillRect(px + 1, py, 1, 1); g.fillRect(px, py - 1, 1, 1); }
  }
  // fog: a pale veil and soft banks of mist drifting with the air
  if (x.fog > .03) {
    g.fillStyle = `rgba(222,228,228,${Math.min(.45, x.fog * .4)})`; g.fillRect(0, 0, aw, ah);
    const tex = fogTexture(), S = tex.width, dx = now * .004 + sx * .6, dy = sy * .6;
    g.globalAlpha = Math.min(.8, x.fog * .8);
    for (const [ox, oy] of [[dx, dy], [dx * 1.7 + 70, dy + 90]]) { const fx = Math.floor(((ox % S) + S) % S), fy = Math.floor(((oy % S) + S) % S); for (let y = -fy; y < ah; y += S) for (let xx = -fx; xx < aw; xx += S) g.drawImage(tex, xx, y); }
    g.globalAlpha = 1;
  }
  // the light of the sun, or the night
  const tint = skyTint(x);
  if (tint !== "#ffffff") { g.globalCompositeOperation = "multiply"; g.fillStyle = tint; g.fillRect(0, 0, aw, ah); g.globalCompositeOperation = "source-over"; }
}
