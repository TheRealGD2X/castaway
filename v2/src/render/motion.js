// Finer display positions keep large art pixels crisp while joints and scenery can move gently.
// Display only: none of this changes simulation time, positions or random state.
import { sprite } from './pix.js';
export const MOTION_GRID = 3, POSE_HZ = 60;
export const motionFrames = period => Math.max(1, Math.ceil(period * POSE_HZ / 1000));
export function detailSprite(w, h, paint) {
  const n = MOTION_GRID;
  return sprite(w * n, h * n, base => {
    const P = {
      w, h, grid: n,
      dot(x, y, c) { base.set(Math.round(x * n), Math.round(y * n), c); },
      set(x, y, c) {
        const xx = Math.round(x * n), yy = Math.round(y * n);
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) base.set(xx + i, yy + j, c);
      },
    };
    paint(P);
  }, { outlineWidth: n });
}
export function frameCache(limit) {
  const entries = new Map();
  return (key, paint) => {
    let frame = entries.get(key);
    if (frame) { entries.delete(key); entries.set(key, frame); return frame; }
    frame = paint(); entries.set(key, frame);
    if (entries.size > limit) entries.delete(entries.keys().next().value);
    return frame;
  };
}
