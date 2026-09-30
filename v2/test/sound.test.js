import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld, load, save } from '../src/sim/world.js';
import { acousticState, rainPower, distanceGain } from '../src/render/sound-state.js';
import { AcousticField } from '../src/render/sound-field.js';

const W = createWorld(1404719350, Date.UTC(2026, 8, 25, 5));
const V = { cam: { x: W.cx * 16, y: W.cy * 16 } };
assert.ok(Math.abs(rainPower(2, 4) - .04) < 1e-12); // .002 m/h * 4 m² * rho * v²/2, converted to seconds
assert.equal(distanceGain(0), 1);
assert.ok(Math.abs(distanceGain(60) / distanceGain(120) - 2) < .02);
const original = save(W), originalRng = W.rng.save();
for (let i = 0; i < 30; i++) acousticState(W, V);
assert.equal(save(W), original); assert.deepEqual(W.rng.save(), originalRng);
W.wx.wind = W.wx.gust = W.wx.rain = 0; W.hydro.wave = W.hydro.flow = 0; W.fires = [];
const quiet = acousticState(W, V);
for (const k of ['sea', 'wind', 'leaves', 'rain', 'roof', 'stream', 'fire']) assert.equal(quiet[k], 0, k);
W.wx.rain = 3; W.wx.temp = -2;
assert.equal(acousticState(W, V).rain, 0, 'snow must not hiss like liquid rain');
W.wx.temp = 10;
assert.ok(acousticState(W, V).rain > 0);
W.wx.wind = W.wx.gust = 8;
assert.ok(acousticState(W, V).wind > 0);
const foliage = W.ents.map(e => e.leafKg);
W.ents.forEach(e => e.leafKg = 0); assert.equal(acousticState(W, V).leaves, 0);
W.ents.forEach((e, i) => e.leafKg = foliage[i]);
W.hydro.wave = .6;
const shore = [...W.ter].findIndex((v, i) => v > 1 && W.dsea[i] === 1);
const shoreV = { cam: { x: (shore % W.MW + .5) * 16, y: (Math.floor(shore / W.MW) + .5) * 16 } };
assert.ok(acousticState(W, shoreV).sea > acousticState(W, V).sea);
const far = { cam: { x: 100000, y: -100000 } };
assert.ok(acousticState(W, far).sea < acousticState(W, shoreV).sea * .05, 'camera outside map must retain actual distance');
W.fires = [{ x: W.cx, y: W.cy, lit: true, heat: 6000, fuel: { logs: [2, .2, 1] } }];
const closeFire = acousticState(W, V).fire;
assert.ok(closeFire > acousticState(W, far).fire);
W.fires[0].lit = false; assert.equal(acousticState(W, V).fire, 0);
const panel = { kind: 'panel', mat: 'reeds', amount: 4, stage: 0, nodes: [4,5,6,7], points: [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]] };
const nodes = [[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0], ...panel.points];
const bars = [0,1,2,3].map(i => ({ kind: 'bar', mat: 'poles', amount: 8, stage: 0, a: i, b: i+4 }));
W.structs = [{ x: W.cx, y: W.cy, stage: 1, assembly: { nodes, parts: [...bars, panel] }, props: {} }];
const roof = acousticState(W, V); assert.ok(roof.roof > 0); assert.equal(roof.roofSoft, 1);
bars.forEach(b => b.removed = true); assert.equal(acousticState(W, V).roof, 0, 'unsupported cover is no longer a roof');
bars.forEach(b => b.removed = false);
Object.assign(W.structs[0].assembly, { habitat: true, floor: [[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]] });
W.structs[0].props = { indoorFire: .8 };
assert.equal(acousticState(W, V).muffling, .8);
assert.equal(acousticState(W, { cam: { x: (W.cx+1) * 16, y: W.cy*16 } }).muffling, 0);
panel.removed = true; assert.equal(acousticState(W, V).roof, 0);
W.ships = [{ id: 4, horn: W.t - 1, side: 1, off: 5000, s: 0 }];
assert.equal(acousticState(W, V).horns.length, 0);
W.t = 10; W.ships[0].horn = 10;
assert.equal(acousticState(W, V).horns.length, 1);
assert.ok(acousticState(W, V).horns[0].gain < .002);

const state = { ...roof, sea: .18, wind: .04, leaves: .07, rain: .1, fire: .12, stream: .12, flow: .04, rainRate: 4 };
function render(rate, block, seconds = 2, refresh = false) {
  const field = new AcousticField(rate, 123), out = [new Float32Array(rate * seconds), new Float32Array(rate * seconds)];
  field.setState(state);
  for (let offset = 0; offset < out[0].length; offset += block) {
    if (refresh) field.setState(state);
    field.render(out.map(c => c.subarray(offset, Math.min(c.length, offset + block))));
    assert.ok(field.modes.length <= 24);
  }
  return out;
}
const a = render(48000, 128), b = render(48000, 511, 2, true);
assert.deepEqual(a, b, 'identical PCM independent of display refresh and audio block partition');
for (const rate of [44100, 48000]) {
  const channels = rate === 48000 ? a : render(rate, 128);
  for (const channel of channels) {
    let peak = 0, energy = 0, mean = 0;
    for (const sample of channel) { assert.ok(Number.isFinite(sample)); peak = Math.max(peak, Math.abs(sample)); energy += sample * sample; mean += sample; }
    assert.ok(peak < .3); assert.ok(Math.sqrt(energy / channel.length) < .05); assert.ok(Math.abs(mean / channel.length) < .0005);
  }
}
const silent = new AcousticField(48000, 123), zero = [new Float32Array(128), new Float32Array(128)];
silent.setState({}); silent.render(zero); assert.ok(zero.every(c => c.every(v => v === 0)));
const panField = new AcousticField(48000, 4), panOut = [new Float32Array(48000 * 4), new Float32Array(48000 * 4)];
panField.setState({ fire: .13, firePan: .65 }); panField.render(panOut);
const energy = c => c.reduce((sum, v) => sum + v*v, 0);
assert.ok(energy(panOut[1].slice(-48000)) > energy(panOut[0].slice(-48000)) * 3);
const cp = JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json', import.meta.url)));
const loaded = load(cp.blob), saved = save(loaded);
acousticState(loaded, { cam: { x: loaded.man.x * 16, y: loaded.man.y * 16 } });
assert.equal(save(loaded), saved, 'production checkpoint inspection is read-only');
const t0 = performance.now(); render(48000, 128, 6);
console.log(`sound: causal sources, SI scaling, snow, distance, geometry, stereo, bounded PCM and exact DSP replay passed; ${(performance.now()-t0).toFixed(0)} ms / 6 audio seconds`);
