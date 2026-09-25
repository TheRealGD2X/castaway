// Ships. The island lies off the main lanes behind a skirt of reefs, so the few vessels that pass keep well out:
// a fishing boat working the banks, a coaster on its run, now and then a yacht. They come as chance traffic does
// (a Poisson process: on average one every few days), cross on a straight course at their speed, 4 to 14 km off.
// Whether he sees one depends on how far it is, the visibility (clear air, haze, rain, fog), the light, and whether
// he's anywhere he can see the sea on that side. From a ship's deck at that range a man is invisible; smoke from a
// fire can be seen, and a lookout might notice it, and take it for what smoke on an island usually is.
import { clamp } from "../core/dmath.js";
import { MW, MH } from "../world/gen.js";

const KINDS = [["fishing boat", 4, .5], ["coaster", 6, .35], ["yacht", 3, .15]];   // [kind, speed m/s, share]
export function shipsInit(W) { W.ships = []; }
const RATE = 1 / (4 * 1440);                              // ships a minute: about one every four days
// visibility range in metres from the weather
export const visibility = x => (x.fog > .3 ? 600 : x.rain > 1.5 ? 3000 : x.rain > 0 ? 7000 : x.hum > .9 ? 9000 : 18000) * (x.elev > -.05 ? 1 : x.elev > -.15 ? .4 : .05);
export function shipsStep(W) {
  if (W.rng.f() < RATE) {
    const r = W.rng, u = r.f(); let k = KINDS[0]; let acc = 0; for (const q of KINDS) { acc += q[2]; if (u < acc) { k = q; break; } }
    const side = r.int(4), off = 4000 + r.f() * 10000, dir = r.f() < .5 ? 1 : -1;       // which side, how far off (m)
    W.ships.push({ id: W.nextId++, k: k[0], v: k[1] * (.8 + r.f() * .4), side, off, s: -dir * 16000, dir, seenBy: 0, sawSmoke: 0, horn: 0 });
  }
  for (const sh of W.ships) sh.s += sh.dir * sh.v * 60;                                 // metres along its course per minute
  W.ships = W.ships.filter(sh => Math.abs(sh.s) < 16500);
}
// where a ship is relative to the island centre (metres), and how far from a point on the island
export function shipXY(W, sh) { const d = [[0, -1], [1, 0], [0, 1], [-1, 0]][sh.side]; return d[0] ? { x: d[0] * sh.off, y: sh.s } : { x: sh.s, y: d[1] * sh.off }; }
export function shipDist(W, sh, px, py) { const p = shipXY(W, sh); return Math.hypot(p.x - (px - W.cx) * 2, p.y - (py - W.cy) * 2); }
// can he see the sea on that side from where he stands? The island is a couple of hundred metres across: from any
// open ground he sees the horizon (less well on the far side); under trees or in the woods he sees nothing of it
export function seaView(W, M, side) {
  const i = Math.floor(M.y) * MW + Math.floor(M.x);
  if (W.treeAt[i] || W.ter[i] === 5) return 0;
  const nearSide = side === 0 ? M.y < MH * .5 : side === 1 ? M.x > MW * .5 : side === 2 ? M.y > MH * .5 : M.x < MW * .5;
  return nearSide || W.h[i] > .7 ? 1 : .35;
}
// each minute: does he notice a ship? does a lookout notice his smoke?
export function shipsWatch(W) {
  const M = W.man, x = W.wx, vis = visibility(x);
  for (const sh of W.ships) {
    const d = shipDist(W, sh, M ? M.x : W.cx, M ? M.y : W.cy); sh.dist = d;
    const sv = M && M.B.alive && !M.B.asleep ? seaView(W, M, sh.side) : 0;
    if (sv && d < vis) {
      const p = clamp(.12 * sv * (1 - d / vis) * (M.act && M.act.a === "sleep" ? 0 : 1), .002, .25);                               // a speck on the horizon, or plain
      if (W.rng.f() < p) { if (!sh.seenBy) { M.log.push([W.t, "ship", sh.k]); } sh.seenBy = W.t; M.mem.ship = { k: "ship", id: sh.id, side: sh.side, kind: sh.k, t: W.t }; }
    }
    // smoke: a lookout sees a column of smoke against the land at a range set by the visibility and how thick it is
    const smoke = W.fires.reduce((a, f) => Math.max(a, (f.signal ? 3 : 1) * f.heat / 8000), 0);
    if (smoke > .15 && d < vis * .7 * Math.min(1.5, smoke) && W.rng.f() < .01) {
      if (!sh.sawSmoke) { sh.sawSmoke = W.t; (W.events || (W.events = [])).push([W.t, "ship saw smoke", sh.k]);
        // a peat fire, a shepherd's bothy: the skipper gives a blast on the horn in greeting, and holds his course
        if (sh.k !== "yacht") sh.horn = W.t; }
    }
  }
}
