// Seeded random numbers for the simulation (sfc32). Integer-only arithmetic, so every device agrees.
// The state is four 32-bit ints and is saved with the world.
export function makeRng(seed) {
  let a = 0x9e3779b9 ^ seed, b = 0x243f6a88 ^ (seed * 7), c = 0xb7e15162 ^ (seed * 13), d = seed | 0;
  const r = { s: null };
  const next = () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0; a = b ^ (b >>> 9); b = (c + (c << 3)) | 0; c = (c << 21) | (c >>> 11); c = (c + t) | 0;
    return t >>> 0;
  };
  for (let i = 0; i < 16; i++) next();
  r.u32 = next;
  r.f = () => next() / 4294967296;                 // [0, 1)
  r.int = n => Math.floor(r.f() * n);              // 0..n-1
  r.range = (lo, hi) => lo + (hi - lo) * r.f();
  r.pick = arr => arr[r.int(arr.length)];
  r.chance = p => r.f() < p;
  r.save = () => [a, b, c, d];
  r.load = s => { [a, b, c, d] = s; };
  return r;
}
// A stateless hash for things that must not consume the stream (placement, looks): h(x, y, s) in [0, 1).
export function hash3(x, y, s) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
