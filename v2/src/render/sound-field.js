// Continuous acoustic presentation. No recordings, repeating buffers, wall clock or world RNG.
// Private seeded excitation approximates unresolved turbulence/impacts, not extra game events.
const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const KEYS = ['sea', 'seaPan', 'wave', 'wind', 'leaves', 'gust', 'rain', 'rainRate', 'roof', 'roofPan', 'roofSoft',
  'stream', 'streamPan', 'flow', 'fire', 'firePan', 'fireMoisture', 'muffling'];
const cutoff = (hz, rate) => 1 - Math.exp(-TAU * hz / rate);

class Texture {
  constructor(rate, low, high) { this.a = cutoff(low, rate); this.b = cutoff(high, rate); this.lo = 0; this.hi = 0; }
  sample(noise) { this.lo += this.a * (noise - this.lo); this.hi += this.b * (noise - this.hi); return (this.lo - this.hi) * 2.5; }
}

export class AcousticField {
  constructor(rate = 48000, seed = 1) {
    this.rate = rate; this.seed = (seed ^ 0x61c88647) >>> 0 || 1;
    this.target = Object.fromEntries(KEYS.map(k => [k, 0])); this.level = { ...this.target };
    this.smooth = 1 - Math.exp(-1 / (rate * .8));
    this.frame = 0; this.phase = [0, 1.7, 4.1];
    // Deep-water dispersion omega² = g*k. A spectrum, rather than a metronomic surf clip.
    this.omega = [8, 13, 21].map(length => Math.sqrt(9.81 * TAU / length) / rate);
    this.textures = Array.from({ length: 2 }, () => ({
      roll: new Texture(rate, 700, 70), wash: new Texture(rate, 2300, 350),
      wind: new Texture(rate, 450, 85), leaves: new Texture(rate, 2200, 650),
      rain: new Texture(rate, 3300, 650), roof: new Texture(rate, 1600, 180),
      stream: new Texture(rate, 1900, 260), fire: new Texture(rate, 620, 110),
    }));
    this.modes = []; this.horns = []; this.low = [0, 0]; this.dc = [0, 0];
    this.muffleA = cutoff(1400, rate); this.dcA = cutoff(40, rate);
  }
  random() {
    let x = this.seed; x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0; return this.seed / 4294967296;
  }
  noise(tex) { return tex.sample(this.random() * 2 - 1); }
  setState(state) {
    for (const k of KEYS) this.target[k] = Number.isFinite(state[k]) ? clamp(state[k], -2, 8) : 0;
  }
  horn({ gain, pan = 0 }) {
    if (gain > 0 && this.horns.length < 4) this.horns.push({ gain: Math.min(.045, gain), pan: clamp(pan, -.65, .65), age: 0 });
  }
  // Impulse response of a damped vibrating/air-bubble resonator, or a short noise fracture.
  mode(frequency, decay, amplitude, pan, noisy = false) {
    if (this.modes.length >= 24) return;
    const theta = TAU * frequency / this.rate, r = Math.exp(-1 / (decay * this.rate));
    this.modes.push({ c: 2 * r * Math.cos(theta), r2: r * r, decay: r, noisy, amplitude,
      y1: amplitude * Math.sin(theta), y2: 0, age: 0, remaining: Math.ceil(decay * 8 * this.rate),
      l: Math.sqrt((1 - pan) / 2), r: Math.sqrt((1 + pan) / 2) });
  }
  render(channels) {
    const left = channels[0], right = channels[1] || left;
    const p = this.level, n = left.length, dt = 1 / this.rate;
    for (let i = 0; i < n; i++, this.frame++) {
      for (const k of KEYS) p[k] += this.smooth * (this.target[k] - p[k]);
      for (let k = 0; k < 3; k++) { this.phase[k] += this.omega[k]; if (this.phase[k] > TAU) this.phase[k] -= TAU; }
      const crest = Math.max(0, .5 + .25 * Math.sin(this.phase[0]) + .17 * Math.sin(this.phase[1]) + .08 * Math.sin(this.phase[2]));
      const surge = .3 + .7 * crest * crest, wash = .2 + .8 * crest;
      // Small entrained bubbles: Minnaert resonance, rho=1000, gamma=1.4, P=101325.
      if (this.random() < Math.min(18, p.flow * 160) * dt && p.stream > .0001) {
        const radius = .0025 + this.random() * .0055;
        const hz = Math.sqrt(3 * 1.4 * 101325 / 1000) / (TAU * radius);
        this.mode(hz, .018 + radius * 3, p.stream * (.05 + this.random() * .12), p.streamPan);
      }
      if (this.random() < p.fire * (10 + p.fireMoisture * 18) * dt) {
        this.mode(450 + this.random() * 850, .008 + this.random() * .018,
          p.fire * (.05 + this.random() * .14), p.firePan, true);
      }
      if (this.random() < Math.min(16, p.rainRate * 2) * dt && p.roof > .0001) {
        this.mode(500 + (1 - p.roofSoft) * 800 + this.random() * 400, .012 + p.roofSoft * .025,
          p.roof * (.025 + this.random() * .06), p.roofPan, p.roofSoft > .5);
      }
      let ml = 0, mr = 0;
      for (let j = this.modes.length - 1; j >= 0; j--) {
        const m = this.modes[j]; let value;
        if (m.noisy) {
          m.amplitude *= m.decay;
          value = m.amplitude * (this.random() * 2 - 1) * Math.min(1, m.age / (this.rate * .002));
        } else { value = m.c * m.y1 - m.r2 * m.y2; m.y2 = m.y1; m.y1 = value; }
        m.age++; ml += value * m.l; mr += value * m.r;
        if (--m.remaining <= 0) this.modes.splice(j, 1);
      }
      for (let j = this.horns.length - 1; j >= 0; j--) {
        const h = this.horns[j], t = h.age * dt;
        const envelope = Math.min(1, t / .9) * Math.max(0, Math.min(1, (3.8 - t) / 1.2));
        const value = h.gain * envelope * (.7 * Math.sin(TAU * 110 * t) + .16 * Math.sin(TAU * 220 * t) + .08 * Math.sin(TAU * 330 * t));
        ml += value * Math.sqrt((1 - h.pan) / 2); mr += value * Math.sqrt((1 + h.pan) / 2);
        if (++h.age > this.rate * 3.8) this.horns.splice(j, 1);
      }
      for (let c = 0; c < 2; c++) {
        const tex = this.textures[c];
        const seaWeight = Math.sqrt((1 + (c ? p.seaPan : -p.seaPan)) / 2);
        const roofWeight = Math.sqrt((1 + (c ? p.roofPan : -p.roofPan)) / 2);
        const streamWeight = Math.sqrt((1 + (c ? p.streamPan : -p.streamPan)) / 2);
        const fireWeight = Math.sqrt((1 + (c ? p.firePan : -p.firePan)) / 2);
        const sea = (this.noise(tex.roll) * surge + this.noise(tex.wash) * wash * .25) * p.sea * seaWeight;
        const wind = this.noise(tex.wind) * p.wind + this.noise(tex.leaves) * p.leaves * Math.min(1.3, p.gust);
        const rain = this.noise(tex.rain) * p.rain + this.noise(tex.roof) * p.roof * roofWeight * (.6 + .2 * (1 - p.roofSoft));
        const stream = this.noise(tex.stream) * p.stream * streamWeight;
        const fire = this.noise(tex.fire) * p.fire * fireWeight;
        let value = .6 * (sea + wind + rain + stream + fire + (c ? mr : ml));
        this.low[c] += this.muffleA * (value - this.low[c]);
        value += (this.low[c] - value) * p.muffling * .75;
        this.dc[c] += this.dcA * (value - this.dc[c]); value -= this.dc[c];
        value = .55 * Math.tanh(value / .55);
        if (c) right[i] = value; else left[i] = value;
      }
    }
  }
}
