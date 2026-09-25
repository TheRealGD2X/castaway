// The island's sound, made live from the simulation (nothing recorded, nothing looped): surf that swells with each
// wave and grows as the camera nears the shore, wind in the grass that rises with gusts, rain on leaves, the crackle
// of his fire, a robin in the day, gulls near the shore, an owl at night, a ship's horn far off.
// Kept soft and low: it's meant to be left on in the background.
let ctx = null, master = null, parts = null;
function noiseBuffer(ctx, kind) {
  const n = ctx.sampleRate * 4, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0, b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === "brown") { last = (last + .02 * w) / 1.02; d[i] = last * 3.2; }
    else if (kind === "pink") { b0 = .997 * b0 + w * .029; b1 = .985 * b1 + w * .032; b2 = .95 * b2 + w * .048; d[i] = (b0 + b1 + b2 + w * .05) * .9; }
    else d[i] = w * .5;
  }
  return b;
}
function loop(buf, ...chain) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; let n = s; for (const c of chain) { n.connect(c); n = c; } s.start(); return n; }
function filt(type, f, q = .7) { const x = ctx.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
function gain(v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
export function audioStart() {
  if (ctx) { ctx.resume(); master.gain.setTargetAtTime(.55, ctx.currentTime, .6); return; }
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 3; comp.connect(ctx.destination);
  master = gain(0); master.connect(comp); master.gain.setTargetAtTime(.55, ctx.currentTime, 1.5);
  const brown = noiseBuffer(ctx, "brown"), pink = noiseBuffer(ctx, "pink"), white = noiseBuffer(ctx, "white");
  parts = {
    sea: gain(), sea2: gain(), wind: gain(), windF: filt("bandpass", 500, .6), rain: gain(), fire: gain(), white,
  };
  loop(brown, filt("lowpass", 420), parts.sea).connect(master);
  loop(pink, filt("lowpass", 900), filt("highpass", 120), parts.sea2).connect(master);
  loop(pink, parts.windF, parts.wind).connect(master);
  loop(white, filt("highpass", 1800), filt("lowpass", 7000), parts.rain).connect(master);
  loop(brown, filt("lowpass", 180), parts.fire).connect(master);                       // the low roar of a fire
}
export function audioStop() { if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, .4); }
// one-off sounds
function chirp(f0, f1, dur, vol, type = "sine", when = 0) {
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = gain(0); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .15); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + .05);
}
function crackle(vol) {
  const t = ctx.currentTime, s = ctx.createBufferSource(), g = gain(0), f = filt("bandpass", 1500 + Math.random() * 3000, 1.5);
  s.buffer = parts.white; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + .03 + Math.random() * .05);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 3, .1);
}
function robin() { let w = 0; const n = 4 + (Math.random() * 5 | 0); for (let i = 0; i < n; i++) { const f = 2600 + Math.random() * 2400; chirp(f, f * (.8 + Math.random() * .5), .09 + Math.random() * .12, .025, "sine", w); w += .12 + Math.random() * .15; } }
function gullCall() { const f = 900 + Math.random() * 300; chirp(f, f * 1.6, .18, .018, "sawtooth"); chirp(f * 1.5, f * .9, .35, .018, "sawtooth", .2); }
function owl() { chirp(410, 380, .5, .03); chirp(420, 360, .9, .025, "sine", .9); }
function horn() { for (const f of [98, 123]) { const t = ctx.currentTime, o = ctx.createOscillator(), g = gain(0), lp = filt("lowpass", 420); o.type = "sawtooth"; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.035, t + .6); g.gain.setValueAtTime(.035, t + 2.6); g.gain.linearRampToValueAtTime(0, t + 3.6); o.connect(lp); lp.connect(g); g.connect(master); o.start(t); o.stop(t + 3.8); } }
// every animation frame: set the mix from the world and the camera
let lastHorn = 0;
export function audioUpdate(W, V, now) {
  if (!ctx || !parts || ctx.state !== "running") return;
  const x = W.wx, T = ctx.currentTime, cx = Math.floor(V.cam.x / 16), cy = Math.floor(V.cam.y / 16), i = Math.max(0, Math.min(W.ter.length - 1, cy * W.MW + cx));
  const shore = Math.max(0, 1 - (W.dsea[i] || 0) / 14), swell = .55 + .45 * Math.sin(now / 1400) * Math.sin(now / 3700 + 1);
  parts.sea.gain.setTargetAtTime((.08 + .5 * shore) * (.6 + x.wind / 20) * swell, T, .3);
  parts.sea2.gain.setTargetAtTime((.02 + .12 * shore) * (1.2 - swell * .6), T, .5);
  const gust = x.wind / 14 + Math.max(0, Math.sin(now / 2300) * Math.sin(now / 5100)) * x.wind / 25;
  parts.wind.gain.setTargetAtTime(Math.min(.35, gust * .22), T, .5); parts.windF.frequency.setTargetAtTime(350 + gust * 500, T, .8);
  parts.rain.gain.setTargetAtTime(Math.min(.22, x.rain * .06), T, 1);
  let fire = 0; for (const F of W.fires) { const d = Math.hypot(F.x - V.cam.x / 16, F.y - V.cam.y / 16); if (F.lit) fire = Math.max(fire, Math.min(1, F.heat / 8000) * Math.max(0, 1 - d / 14)); }
  parts.fire.gain.setTargetAtTime(fire * .25, T, .4);
  if (fire > .05 && Math.random() < fire * .25) crackle(.05 + Math.random() * .08 * fire);
  const day = x.elev > .05, night = x.elev < -.1;
  if (day && x.rain < .3 && Math.random() < .0025) robin();
  if (shore > .3 && day && Math.random() < .0015 * (W.animals || []).filter(a => a.sp === "gull").length / 4) gullCall();
  if (night && x.rain === 0 && Math.random() < .0004) owl();
  for (const sh of W.ships || []) if (sh.horn && sh.horn !== lastHorn && W.t - sh.horn < 3) { lastHorn = sh.horn; horn(); }
}
