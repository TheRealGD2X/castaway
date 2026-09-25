// Procedural building. Nothing he builds is a fixed model: a DESIGNER turns a brief (what he needs it for, where
// camp and the fire are, which way the weather comes from, which materials he knows of, how skilled he is) into a
// design: a family (lean-to, debris hut, fire ring, reflector wall, woodpile, roundhouse), a site, an orientation,
// dimensions, and a list of stages, each needing gathered parts (poles, bracken, boughs, stones, withies, debris,
// mud, reeds) and labour. What a structure DOES is computed from the parts actually installed, so a half-thatched
// roof keeps off half the rain, a lean-to turned to the wind blocks it and one side-on doesn't, and a bough bed
// stops the ground drawing the heat out of him. The renderer draws the parts as they are, so building shows on the fly.
// Stages become ordinary planner goals: gather these parts, then put them up (over hours, or days for bigger work).
import { MW, MH, T, idx } from "../world/gen.js";
import { clamp, dexp } from "../core/dmath.js";

// what each material is and how much of it one trip brings (an armful, a pair of poles dragged, a load of stones)
export const MATERIALS = {
  poles: { label: "poles", trip: 2 }, bracken: { label: "bracken", trip: 3 }, boughs: { label: "pine boughs", trip: 3 },
  stones: { label: "stones", trip: 4 }, withies: { label: "withies", trip: 5 }, debris: { label: "leaf litter", trip: 4 },
  mud: { label: "mud", trip: 3 }, reeds: { label: "reeds", trip: 5 },
};
export const MATS = Object.keys(MATERIALS);
// how much rain each armful of a cover material keeps off, and how well it insulates as a bed
const COVER = { bracken: { rain: .22, bed: .07 }, boughs: { rain: .18, bed: .09 }, debris: { rain: .12, bed: .1 }, reeds: { rain: .12, bed: .05 } };
// the open side of a structure faces one of four ways
export const DIRV = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// where the wind blows TO, by octant (weather windDir), as a unit vector
const OCT = [[1, 0], [.7071, .7071], [0, 1], [-.7071, .7071], [-1, 0], [-.7071, -.7071], [0, -1], [.7071, -.7071]];

// ------------------------------------------------------------------ families
// each: minSkill (build skill needed to attempt it), make(brief) -> stages, props(struct) -> what it does now
export const FAMILIES = {
  leanto: {
    label: "lean-to", minSkill: 0, shelter: true,
    make: b => {
      const cover = b.cover, n = Math.ceil(2.9 / COVER[cover].rain), bed = b.bedMat;          // thick enough to keep off 95% of the rain
      return [
        { name: "frame", need: { poles: 3 }, mins: 40, say: "Two forked uprights driven in, a ridge pole across them." },
        { name: "roof", need: { poles: 4, [cover]: n }, mins: 70, say: `Rafters from the ridge to the ground, ${MATERIALS[cover].label} laid over them like shingles, from the bottom up.` },
        { name: "bed", need: { [bed]: 6 }, mins: 20, say: `A deep bed of ${MATERIALS[bed].label}. The ground won't steal his heat tonight.` },
      ];
    },
    props: s => {
      const frame = done(s, 0), roofF = frac(s, 1), c = coverOf(s, 1);
      const rain = frame * (1 - dexp(-roofF * (s.stages[1].need[c] || 0) * COVER[c].rain));
      return { rain, wind: frame * roofF * .72, side: 1, bed: bedOf(s, 2), fire: 1 };
    },
  },
  debrisHut: {
    label: "debris hut", minSkill: .6, shelter: true,
    make: b => [
      { name: "ridge", need: { poles: 3 }, mins: 30, say: "A long ridge pole propped on a forked stick: a frame just big enough to lie in." },
      { name: "ribs", need: { poles: 8 }, mins: 45, say: "Ribs down both sides, close enough that the leaves won't fall through." },
      { name: "pile", need: { debris: 24 }, mins: 90, say: "Leaves and litter piled an arm's length deep over the whole thing." },
      { name: "bed", need: { debris: 8 }, mins: 15, say: "Stuffed with dry leaves inside. Like sleeping in a nest." },
    ],
    props: s => {
      const f = done(s, 0) * done(s, 1), pile = frac(s, 2);
      return { rain: f * (1 - dexp(-pile * 24 * .12)), wind: f * pile * .92, side: 0, bed: bedOf(s, 3), fire: .15 };
    },
  },
  fireRing: {
    label: "fire ring", minSkill: 0, atFire: true,
    make: b => [{ name: "ring", need: { stones: 10 }, mins: 20, say: "A ring of stones round the hearth: it holds the embers and turns the wind." }],
    props: s => ({ ring: done(s, 0) }),
  },
  reflector: {
    label: "reflector wall", minSkill: .3, beyondFire: true,
    make: b => [{ name: "wall", need: { poles: 6 }, mins: 35, say: "A wall of green logs stacked behind the fire, to throw its heat back into the shelter." }],
    props: s => ({ reflect: frac(s, 0) * .6 }),
  },
  woodpile: {
    label: "woodpile", minSkill: .2, beside: true,
    make: b => [
      { name: "rack", need: { poles: 2 }, mins: 20, say: "Two poles off the ground so the wood doesn't sit in the wet." },
      { name: "cover", need: { [b.cover]: 6 }, mins: 20, say: "A roof over the stack: dry wood tomorrow means fire tomorrow." },
    ],
    props: s => ({ store: done(s, 0), dry: frac(s, 1) }),
  },
  roundhouse: {
    label: "roundhouse", minSkill: 1.5, shelter: true,
    make: b => [
      { name: "stakes", need: { poles: 14 }, mins: 180, say: "A circle of stakes, a stride apart, driven deep." },
      { name: "weave", need: { withies: 40 }, mins: 360, say: "Withies woven in and out of the stakes, basket-fashion." },
      { name: "daub", need: { mud: 30 }, mins: 300, say: "Mud and leaf litter slapped into the weave and smoothed by hand." },
      { name: "rafters", need: { poles: 10 }, mins: 180, say: "Rafters meeting at the top, lashed together." },
      { name: "thatch", need: { reeds: 45 }, mins: 420, say: "Reed thatch, laid in courses from the eaves up." },
      { name: "bed", need: { [b.bedMat]: 8 }, mins: 30, say: "A raised bed by the hearth inside." },
    ],
    props: s => {
      const walls = done(s, 0) * (frac(s, 1) * .5 + frac(s, 2) * .5), roof = done(s, 3) * frac(s, 4);
      return { rain: roof * .98, wind: walls * .95, side: 0, bed: bedOf(s, 5), fire: 1, indoorFire: 1 };
    },
  },
};
const done = (s, k) => s.stage > k ? 1 : 0;
const frac = (s, k) => s.stage > k ? 1 : s.stage === k ? s.prog : 0;
const coverOf = (s, k) => Object.keys(s.stages[k].need).find(m => COVER[m]) || "bracken";
const bedOf = (s, k) => { const m = coverOf(s, k); return clamp(frac(s, k) * (s.stages[k].need[m] || 0) * COVER[m].bed * 2, 0, .95); };
export const propsOf = s => FAMILIES[s.k].props(s);

// ------------------------------------------------------------------ what structures do, where he is
// the shelter over a point: rain kept off, wind kept off (a lean-to only from behind), bedding underfoot
export function shelterAt(W, x, y) {
  const o = { rain: 0, wind: 0, bed: 0, fire: 1, reflect: 0 }, wd = OCT[W.wx.windDir | 0] || OCT[0];
  for (const s of W.structs) {
    const p = s.props || propsOf(s);
    if (p.reflect && Math.abs(s.x - x) < 3.5 && Math.abs(s.y - y) < 3.5) o.reflect = Math.max(o.reflect, p.reflect);
    if (!FAMILIES[s.k].shelter || Math.abs(s.x - x) > .95 || Math.abs(s.y - y) > .95) continue;
    // a one-sided shelter blocks wind blowing toward its open side (coming over its back), less from the side
    const d = DIRV[s.dir], face = p.side ? clamp(.25 + .75 * (wd[0] * d[0] + wd[1] * d[1]), 0, 1) : 1;
    o.rain = Math.max(o.rain, p.rain); o.wind = Math.max(o.wind, p.wind * face); o.bed = Math.max(o.bed, p.bed); o.fire = Math.min(o.fire, p.fire ?? 1);
  }
  return o;
}
// his best place to sleep: the shelter keeping most rain off
export function bestShelter(W) { let b = null, bv = .15; for (const s of W.structs) { if (!FAMILIES[s.k].shelter) continue; const p = s.props || propsOf(s); const v = p.rain + p.wind * .5 + p.bed * .3; if (v > bv) { bv = v; b = s; } } return b; }
export const fireRingAt = (W, F) => W.structs.some(s => s.k === "fireRing" && s.stage > 0 && Math.abs(s.x - F.x) < .6 && Math.abs(s.y - F.y) < .6);
export const woodpile = W => W.structs.find(s => s.k === "woodpile" && s.stage > 0);

// ------------------------------------------------------------------ the designer
// which way the weather mostly comes from, as he has felt it (counted hourly by the mind)
export function prevailing(M) { const c = M.windSeen || [0, 0, 0, 0, 0, 0, 0, 1]; let b = 0; for (let k = 1; k < 8; k++) if (c[k] > c[b]) b = k; return b; }
// the brief: what he knows of materials nearby, his skill, his camp
export function brief(W, M) {
  const has = k => Object.values(M.mem).some(m => m.k === k && (m.n ?? 1) > 0);
  const autumn = W.ents.length && has("fern");
  const cover = autumn ? "bracken" : has("pine") ? "boughs" : "debris";
  const bedMat = has("pine") ? "boughs" : autumn ? "bracken" : "debris";
  return { cover, bedMat, skill: M.skill.build, wind: prevailing(M), knows: { stones: has("stones") || knowsTile(W, M, T.SHINGLE), withies: has("hazel") || has("birch"), reeds: has("reeds"), mud: knowsTile(W, M, T.MARSH) || knowsTile(W, M, T.STREAM), pine: has("pine") } };
}
function knowsTile(W, M, t) { for (let i = 0; i < MW * MH; i++) if (M.known[i] && W.ter[i] === t) return true; return false; }
const buildable = (W, i) => { const t = W.ter[i]; return (t === T.GRASS || t === T.MEADOW || t === T.SAND || t === T.WOOD) && !W.treeAt[i] && !W.block?.[i] && !W.structs.some(s => idx(Math.floor(s.x), Math.floor(s.y)) === i); };
// a site and orientation for a family, around the camp: shelters sit behind the fire with their open side to it and
// their back to the prevailing wind; a reflector goes on the far side of the fire; a woodpile beside the shelter
export function site(W, M, fam, b, campTile) {
  const cx = campTile % MW, cy = (campTile / MW) | 0, F = FAMILIES[fam];
  if (F.atFire) return { tile: campTile, dir: 0 };
  // the open side should face where the wind blows to (so it comes over the back): the best of the four
  const wv = OCT[b.wind]; let order = [0, 1, 2, 3].sort((a, c) => (wv[0] * DIRV[c][0] + wv[1] * DIRV[c][1]) - (wv[0] * DIRV[a][0] + wv[1] * DIRV[a][1]) || a - c);
  const sh = bestShelter(W);
  for (const dir of order) {
    const [dx, dy] = DIRV[dir];
    let x, y;
    if (F.shelter) { x = cx - dx; y = cy - dy; }
    else if (F.beyondFire) { const s = sh || { dir }; x = cx + DIRV[s.dir][0]; y = cy + DIRV[s.dir][1]; }
    else if (F.beside) { const s = sh || { x: cx + .5, y: cy + .5, dir }; x = Math.floor(s.x) + DIRV[(s.dir + 1) % 4][0]; y = Math.floor(s.y) + DIRV[(s.dir + 1) % 4][1]; }
    if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
    const i = idx(x, y); if (buildable(W, i)) return { tile: i, dir };
    if (F.beyondFire || F.beside) break;
  }
  return null;
}
export function design(W, M, fam, campTile) {
  const b = brief(W, M), s = site(W, M, fam, b, campTile); if (!s) return null;
  return { k: fam, x: s.tile % MW + .5, y: ((s.tile / MW) | 0) + .5, tile: s.tile, dir: s.dir, stages: FAMILIES[fam].make(b), stage: 0, prog: 0 };
}
// can he gather everything a stage needs? (he knows where to find it)
export function feasible(b, stage) {
  return Object.keys(stage.need).every(m => m === "poles" || m === "bracken" || m === "debris" || (m === "boughs" && b.knows.pine) || b.knows[m]);
}
// raise a structure in the world when its first stage begins
export function place(W, d) {
  const s = { id: W.nextId++, k: d.k, x: d.x, y: d.y, dir: d.dir, stages: d.stages, stage: 0, prog: 0, have: {}, onsite: {}, started: W.t };
  s.props = propsOf(s); W.structs.push(s); return s;
}
// a minute of work on a stage: parts go in as the work goes on
export function work(W, s, share) {
  const st = s.stages[s.stage]; if (!st) return true;
  s.prog = Math.min(1, s.prog + share);
  if (s.prog >= 1) { for (const m in st.need) { s.have[m] = (s.have[m] || 0) + st.need[m]; s.onsite[m] = 0; } s.stage++; s.prog = 0; }
  s.props = propsOf(s);
  return s.stage > 0 && s.prog === 0;
}
export const finished = s => s.stage >= s.stages.length;
// what a stage still needs brought: its parts less what's already lying on the site
export function stillNeeds(s, stage) { const o = {}; for (const m in stage.need) { const n = stage.need[m] - ((s && s.onsite && s.onsite[m]) || 0); if (n > 0) o[m] = n; } return o; }
