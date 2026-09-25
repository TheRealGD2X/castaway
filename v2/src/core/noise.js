import { hash3 } from "./rng.js";
import { smooth } from "./dmath.js";
// Value noise and fractal noise from the integer hash: deterministic and cheap.
export function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash3(xi, yi, s), b = hash3(xi + 1, yi, s), c = hash3(xi, yi + 1, s), d = hash3(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
export function fbm(x, y, s, oct = 4) {
  let v = 0, amp = .5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { v += vnoise(x * f, y * f, s + i * 101) * amp; n += amp; amp *= .5; f *= 2.03; }
  return v / n;
}
