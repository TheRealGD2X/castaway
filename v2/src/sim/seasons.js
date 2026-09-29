// Surface heat and water balance. Snow, frost and ice follow weather, never calendar switches.
import { clamp } from '../core/dmath.js';

export function seasonsInit(W) {
  W.surface = { temp: W.wx.temp, snow: 0, frost: 0, puddle: 0, ice: 0 };
}
export function seasonsStep(W, dt = 1) {
  const s = W.surface, x = W.wx;
  const clear = 1 - x.cloud, shade = 1 - Math.min(1, (x.sun || 0) / 650);
  const target = x.temp + (x.sun || 0) * .006 - clear * shade * 4.5;
  s.temp += (target - s.temp) * dt / (90 + s.snow * 2);
  const frozen = clamp((1 - x.temp) / 2, 0, 1);
  const snow = x.rain * frozen * dt / 60;
  const melt = Math.min(s.snow + snow, Math.max(0, s.temp) * dt * .018 + (x.sun || 0) * dt * .000018);
  s.snow = Math.max(0, s.snow + snow - melt);
  s.puddle = clamp(s.puddle + x.rain * (1 - frozen) * dt / 60 + melt - dt * (.006 + Math.max(0, s.temp) * .001 + (x.sun || 0) * .000012), 0, 18);
  const freeze = Math.min(s.puddle, Math.max(0, -s.temp) * dt * .018);
  const thaw = Math.min(s.ice, Math.max(0, s.temp) * dt * .025);
  s.ice = clamp(s.ice + freeze - thaw, 0, 12); s.puddle += thaw - freeze;
  s.frost = clamp(s.frost + Math.max(0, -s.temp) * x.hum * dt * .001 - Math.max(0, s.temp) * dt * .003 - (x.sun || 0) * dt * .000006, 0, 1);
}
export const liquidRain = W => W.wx.rain * (1 - clamp((1 - W.wx.temp) / 2, 0, 1));
export function groundCost(W, i) {
  const s = W.surface, path = W.traces?.[i]?.wear || 0;
  return (1 + Math.min(1.5, (s?.snow || 0) * .03) + Math.min(.4, (s?.ice || 0) * .035)) * (1 - Math.min(.16, path * .012));
}
