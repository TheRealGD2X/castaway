// Lasting physical traces and a factual record of observed milestones.
import { MW, idx, T } from '../world/gen.js';
import { clamp } from '../core/dmath.js';
import { propsOf, FAMILIES } from '../build/build.js';

export function heritageInit(W) { W.traces = {}; W.scent = {}; W.story = []; W.storyKeys = {}; }
export function footfall(W, x, y, load = 1) {
  const i = idx(Math.floor(x), Math.floor(y));
  if (W.ter[i] <= 1 || W.ter[i] === T.STREAM || W.ter[i] === T.LAKE) return;
  const q = W.traces[i] || (W.traces[i] = { wear: 0, ash: 0, nutrient: 0 });
  q.wear = Math.min(30, q.wear + load * .22);
}
export function record(W, key, kind, text, detail = {}) {
  if (W.storyKeys[key]) return;
  W.storyKeys[key] = 1;
  W.story.push({ t: W.t, kind, text, ...detail });
  if (W.story.length > 360) W.story.splice(0, W.story.length - 360);
}
export function campSnapshot(W) {
  if (W.camp == null) return [];
  const cx = W.camp % MW + .5, cy = Math.floor(W.camp / MW) + .5;
  return W.structs.filter(s => Math.abs(s.x - cx) < 9 && Math.abs(s.y - cy) < 9)
    .map(s => ({ k: s.k, x: s.x - cx, y: s.y - cy, dir: s.dir, stage: s.stage, prog: s.prog, stages: s.stages, kg: s.kg || 0, integrity: s.integrity ?? 1 }));
}
export function observeLife(W, logFrom) {
  const M = W.man; if (!M) return;
  for (const l of M.log.slice(logFrom)) {
    const [t, k, what, stage] = l;
    if (k === 'built') {
      const s = W.structs.find(s => s.k === what && s.stages[s.stage - 1]?.name === stage);
      if (s) record(W, 'build:' + s.id + ':' + stage, 'home', 'He finished the ' + stage + ' of his ' + FAMILIES[what].label + '.', { camp: campSnapshot(W) });
    } else if (k === 'crafted') record(W, 'craft:' + what, 'craft', 'He made his first ' + what + '.');
    else if (k === 'fish' && what > 0) record(W, 'first-fish', 'food', 'His fish trap brought in its first trout.');
    else if (k === 'caught fish') record(W, 'first-line-fish', 'food', 'He caught a trout on his handmade fishing line.');
    else if (k === 'fire') record(W, 'first-fire', 'fire', 'He coaxed his first flame from the hand drill.', { camp: campSnapshot(W) });
    else if (k === 'ship') record(W, 'ship:' + what, 'sea', 'He saw a ship far beyond the reefs.');
    else if (k === 'ill') record(W, 'ill:' + t, 'health', 'He became ill; his body needed time to recover.');
    else if (k === 'repaired') record(W, 'repair:' + t, 'home', 'He repaired his ' + FAMILIES[what].label + '.', { camp: campSnapshot(W) });
    else if (k === 'died') record(W, 'death', 'health', 'Tomas died from ' + what + '.');
  }
  const dog = W.animals.find(a => a.sp === 'dog' && !a.adrift && !a.dead);
  if (dog && M.mem.dog) {
    record(W, 'met-dog', 'dog', 'He found ' + dog.name + ', the dog from his ship.');
    if (dog.trust > .6) record(W, 'dog-trust', 'dog', dog.name + ' learned to trust him.');
  }
  const known = Object.keys(M.mem).length;
  if (known > 30) record(W, 'knows-island', 'island', 'He began to know the island: its trees, fresh water and shore.');
}

export function heritageTen(W) {
  const x = W.wx, grow = Math.max(0, x.temp - 4) * .000015 * (1 + W.litterWet);
  for (const k in W.traces) { const q = W.traces[k]; q.wear = Math.max(0, q.wear - grow); q.ash *= .9997; q.nutrient *= .9999; }
  for (const k in W.scent) { W.scent[k] *= clamp(1 - .025 - x.rain * .04 - x.wind * .001, 0, 1); if (W.scent[k] < .01) delete W.scent[k]; }
  for (const it of W.items) if (it.k === 'scraps' && it.kcal > 0) {
    const rot = Math.min(it.kcal, it.kcal * (.002 + Math.max(0, x.temp) * .0003)); it.kcal -= rot;
    const i = idx(Math.floor(it.x), Math.floor(it.y)), q = W.traces[i] || (W.traces[i] = { wear: 0, ash: 0, nutrient: 0 }); q.nutrient += rot * .0001;
  }
  for (const F of W.fires) {
    const mass = Object.values(F.fuel).reduce((n, c) => n + c[0], 0);
    const burnt = Math.max(0, (F.traceMass ?? mass) - mass); F.traceMass = mass;
    if (burnt > 0) { const i = idx(Math.floor(F.x), Math.floor(F.y)), q = W.traces[i] || (W.traces[i] = { wear: 0, ash: 0, nutrient: 0 }); q.ash = Math.min(10, q.ash + burnt * .3); }
  }
  // Wind pressure is quadratic in gust speed. Wet fibres lose stiffness; bracing spreads the load.
  for (const s of W.structs) {
    s.integrity ??= 1; s.saturation ??= 0;
    s.saturation = clamp(s.saturation + x.rain * .002 - (.0008 + Math.max(0, x.temp) * .00008 + (x.sun || 0) * .000001), 0, 1);
    const area = FAMILIES[s.k].shelter ? 4 : s.k === 'fireRing' ? .05 : 1.2;
    const load = x.gust * x.gust * area * (1 + (W.surface.snow || 0) * .04);
    const strength = (s.k === 'roundhouse' ? 1050 : s.k === 'debrisHut' ? 900 : 760) * (1 - s.saturation * .3) * (1 + (s.bracing || 0) * .2);
    const loss = Math.max(0, load - strength) / (strength + 1) * .0008;
    s.integrity = clamp(s.integrity - loss, .15, 1); s.props = propsOf(s);
    if (loss > 0 && s.integrity < .82 && W.man && Math.abs(s.x - W.man.x) < 9 && Math.abs(s.y - W.man.y) < 9)
      record(W, 'damage:' + s.id, 'storm', 'Wind and rain damaged his ' + FAMILIES[s.k].label + '.', { camp: campSnapshot(W) });
    if (s.k === 'foodStore' && s.stock > 0) s.load = (s.load || 0) * (1 + Math.max(0, x.temp - 3) * .0006 * (1 - (s.props?.dry || 0) * .5));
  }
  // Wave run-up transports loose beach wood only while the water physically reaches it.
  const oct = [[1,0],[.7071,.7071],[0,1],[-.7071,.7071],[-1,0],[-.7071,-.7071],[0,-1],[.7071,-.7071]][x.windDir];
  for (const it of W.items) if (it.k === 'branch') {
    const i = idx(Math.floor(it.x), Math.floor(it.y));
    if (W.dsea[i] <= 1 && W.h[i] < .15 + x.tide * .015 + x.wind * x.wind * .0006) {
      const nx = clamp(it.x + oct[0] * .06, 1, W.MW - 2), ny = clamp(it.y + oct[1] * .06, 1, W.MH - 2), j = idx(Math.floor(nx), Math.floor(ny));
      if (W.ter[j] === T.SAND || W.ter[j] === T.SHINGLE) { it.x = nx; it.y = ny; it.moist = Math.max(it.moist || 0, .5); }
    }
  }
}
