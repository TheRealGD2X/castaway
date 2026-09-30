// Fish: stream/lake cohort biomass, grown from finite prey in foodwebTen.
// and taken by his traps. A set trap catches fish as a Poisson process whose rate is the number of fish swimming
// past (population density) times how well the trap is made. Fish in a trap stay alive until he lifts it.
import { T } from "../world/gen.js";
import { dround, dexp } from "../core/dmath.js";
import { harvestFish } from './foodweb.js';

export const FISH = { kcal: 330, kg: .25 };              // a brown trout of about 250 g
export function fishInit(W) {
  let st = 0, lk = 0; for (let i = 0; i < W.ter.length; i++) { if (W.ter[i] === T.STREAM) st++; else if (W.ter[i] === T.LAKE) lk++; }
  W.fishK = { stream: st * 4, lake: lk * 6 };
  W.fish = { stream: dround(W.fishK.stream * .8), lake: dround(W.fishK.lake * .8) };
}
const waterOf = (W, s) => W.ter[s.tile] === T.STREAM ? "stream" : "lake";
// Every ten minutes: physical traps remove fish equivalents from the cohort.
export function fishTen(W) {
  for (const s of W.structs) {
    if (s.k !== "fishTrap" || s.stage < s.stages.length) continue;
    const w = waterOf(W, s), N = W.fish[w], dens = N / Math.max(1, W.fishK[w]);
    const liquid = !W.hydro || W.hydro[w] > .001;
    const lambda = .015 * dens * (s.integrity ?? 1) * (1 - Math.min(.8, (W.surface?.ice || 0) / 10)) * (w === "stream" ? 1.4 : 1) * (s.fish >= 4 || !liquid ? 0 : 1);     // fish per 10 minutes
    if (W.rng.f() < 1 - dexp(-lambda) && N >= 1) { s.fish = (s.fish || 0) + harvestFish(W,w); }
  }
}
