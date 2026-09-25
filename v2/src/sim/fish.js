// Fish: a population in the stream and one in the lake, each growing toward what its water can carry (logistic)
// and taken by his traps. A set trap catches fish as a Poisson process whose rate is the number of fish swimming
// past (population density) times how well the trap is made. Fish in a trap stay alive until he lifts it.
import { T } from "../world/gen.js";
import { dexp } from "../core/dmath.js";

export const FISH = { kcal: 330, kg: .25 };              // a brown trout of about 250 g
export function fishInit(W) {
  let st = 0, lk = 0; for (let i = 0; i < W.ter.length; i++) { if (W.ter[i] === T.STREAM) st++; else if (W.ter[i] === T.LAKE) lk++; }
  W.fishK = { stream: st * 4, lake: lk * 6 };
  W.fish = { stream: Math.round(W.fishK.stream * .8), lake: Math.round(W.fishK.lake * .8) };
}
const waterOf = (W, s) => W.ter[s.tile] === T.STREAM ? "stream" : "lake";
// every 10 minutes: breeding (slow, mostly spring) and the traps fishing
export function fishTen(W) {
  for (const k in W.fish) { const N = W.fish[k], K = W.fishK[k]; W.fish[k] = N + N * (1 - N / K) * .00004; }
  for (const s of W.structs) {
    if (s.k !== "fishTrap" || s.stage < s.stages.length) continue;
    const w = waterOf(W, s), N = W.fish[w], dens = N / Math.max(1, W.fishK[w]);
    const lambda = .015 * dens * (w === "stream" ? 1.4 : 1) * (s.fish >= 4 ? 0 : 1);     // fish per 10 minutes
    if (W.rng.f() < 1 - dexp(-lambda)) { s.fish = (s.fish || 0) + 1; W.fish[w] = N - 1; }
  }
}
