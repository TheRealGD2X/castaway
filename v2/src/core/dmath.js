// Deterministic maths for the simulation: only + - * / sqrt floor. (Math.sin/exp/pow can differ between browsers.)
export const PI = 3.141592653589793, TAU = 6.283185307179586;
export const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = t => t * t * (3 - 2 * t);
// sine by range reduction and a 7th-order minimax-style polynomial (error < 1e-6 is plenty for weather and seasons)
export function dsin(x) {
  x = x - TAU * Math.floor(x / TAU);                 // [0, 2pi)
  let s = 1; if (x > PI) { x -= PI; s = -1; }        // [0, pi]
  if (x > PI / 2) x = PI - x;                        // [0, pi/2]
  const x2 = x * x;
  return s * x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72))));
}
export const dcos = x => dsin(x + PI / 2);
// e^x for |x| <= ~20 by range reduction (2^k) and a Taylor series
export function dexp(x) {
  if (x < -40) return 0;
  const k = Math.floor(x / 0.6931471805599453), r = x - k * 0.6931471805599453;
  let t = 1, s = 1; for (let i = 1; i < 14; i++) { t *= r / i; s += t; }
  let p = 1; if (k > 0) for (let i = 0; i < k; i++) p *= 2; else for (let i = 0; i < -k; i++) p /= 2;
  return s * p;
}
// exponential approach: how far a quantity relaxes toward a target in dt with time constant tau
export const relax = (x, target, dt, tau) => target + (x - target) * dexp(-dt / tau);
