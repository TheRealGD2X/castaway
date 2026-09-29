// Compare places using the same heat balance as his real body. Forecasts consume no random numbers and change
// neither the body nor the world. Today's wind and rain are an estimate, not knowledge of future weather.
import { bodyStep, MET } from "../sim/body.js";
import { bodyContext, here } from "../sim/man.js";
import { bestShelter } from "../build/build.js";
import { idx, MW } from "../world/gen.js";
import { findPath } from "./path.js";

export function exposure(W, M, target, minutes = 60, outside = false) {
  const B = JSON.parse(JSON.stringify(M.B)); B.asleep = false;
  const at = target.seat || target, dx = at.x - M.x, dy = at.y - M.y;
  const travel = Math.floor(Math.sqrt(dx * dx + dy * dy) * 2 * 1.25 / 72) + (dx || dy ? 1 : 0);
  const there = Object.assign({}, M, { x: at.x, y: at.y, B, pose: target.pose || (target.key === "shelter" ? "lie" : "sit") });
  const walking = bodyContext(W, M, MET.walk), resting = bodyContext(W, there, MET.sit);
  if (outside) { resting.rainBlock = 0; resting.windBlock = 0; resting.fireW = 0; resting.lying = false; }
  let cold = 0, min = B.core;
  for (let i = 0; i < minutes; i++) {
    // Continue the hypothetical heat balance through the danger point so two unsafe places do not both appear
    // equally good merely because the forecast body stopped updating at 28 degrees.
    B.alive = true; bodyStep(B, i < travel ? walking : resting);
    cold += Math.max(0, 36.4 - B.core); min = Math.min(min, B.core);
  }
  return { core: B.core, min, wet: B.wet, cold: cold / minutes };
}

// A remembered fire is only one possible place to warm up. Its radiance may lose to the wind and rain, while
// the hut beside it keeps both off. Choose between its usual fireside seat and the shelter he has built.
export function warmPlace(W, M, fireside) {
  const home = bestShelter(W), choices = [fireside];
  if (home) choices.push({ x: home.x, y: home.y, tile: idx(Math.floor(home.x), Math.floor(home.y)), key: "shelter" });
  let best = null, score = Infinity;
  for (const t of choices) {
    if (!t) continue;
    // Ordinary fire work stops on an adjacent tile. Forecast that same seat, rather than standing in the flame.
    const dx = t.x - M.x, dy = t.y - M.y, close = t.key !== "shelter" && dx * dx + dy * dy <= 1.21;
    const path = close ? [here(M)] : findPath(W, here(M), t.tile ?? idx(Math.floor(t.x), Math.floor(t.y)), { adjacent: t.key !== "shelter" });
    if (!path) continue;
    const end = path[path.length - 1], p = { x: end % MW + .5, y: Math.floor(end / MW) + .5, key: t.key };
    const f = exposure(W, M, p), cost = f.cold * 10 + f.wet;
    if (cost < score) { score = cost; best = { ...t, seat: { x: p.x, y: p.y } }; }
  }
  return best;
}
