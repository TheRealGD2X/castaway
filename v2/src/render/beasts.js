// Animals as pixel art, painted from their pose and an animation frame: the ship's dog (a rough-coated collie cross,
// tan and white, with the frayed rope still round its neck), gulls, rabbits.
import { R } from "./palette.js";
import { sprite } from "./pix.js";

const cache = new Map();
const memo = (k, f) => { let v = cache.get(k); if (!v) { v = f(); cache.set(k, v); } return v; };
const TAN = ["#7a4a24", "#9c6232", "#bd7f43", "#d9a466"], WHITE = ["#bdb4a4", "#e2dccf", "#f6f2e8"], ROPE = "#c9b27a", NOSE = "#241812";
const rect = (P, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, typeof c === "function" ? c(i, j) : c); };

// ---------------- the dog (faces right; feet at (8, 11))
function dogPaint(P, pose, f) {
  const legs = (xs, lift) => { for (let k = 0; k < xs.length; k++) { const up = lift[k] || 0; rect(P, xs[k], 9 - up, 1, 3 - (up ? 1 : 0), k % 2 ? TAN[1] : TAN[0]); } };
  if (pose === "sleep" || pose === "lie" || pose === "curl") {
    // curled nose to tail
    for (let y = 6; y <= 11; y++) for (let x = 2; x <= 13; x++) { const dx = (x - 7.5) / 6, dy = (y - 9) / 3; if (dx * dx + dy * dy < 1) P.set(x, y, dy < -.3 ? TAN[3] : dx > .4 ? WHITE[1] : TAN[2]); }
    rect(P, 11, 7, 3, 3, (i, j) => j === 0 ? TAN[3] : TAN[2]); P.set(13, 8, NOSE);
    if (pose === "lie") { P.set(12, 6, TAN[1]); P.set(12, 8, "#1b120c"); }
    P.set(10, 8, ROPE); P.set(10, 9, ROPE);
    if (pose !== "sleep") return; P.set(12, 8, TAN[1]); return;
  }
  const sit = pose === "sit" || pose === "beg", low = pose === "drink" || pose === "eat";
  const run = pose === "run", trot = pose === "trot" || pose === "walk";
  // body
  const by = sit ? 6 : run ? 5 + (f & 1) : 5;
  rect(P, 3, by, 9, 4, (i, j) => j === 0 ? TAN[3] : j === 3 ? WHITE[1] : i > 6 ? WHITE[2] : TAN[2]);
  if (sit) rect(P, 3, by + 2, 3, 4, TAN[1]);
  // legs
  if (!sit) {
    if (run) legs([4, 5, 10, 11], f & 1 ? [2, 0, 0, 2] : [0, 2, 2, 0]);
    else if (trot) legs([4, 6, 9, 11], [(f & 1) * 1, 0, 0, (f & 1) * 1]);
    else legs([4, 6, 9, 11], []);
  } else { rect(P, 9, 9, 1, 3, WHITE[1]); rect(P, 11, 9, 1, 3, WHITE[1]); rect(P, 3, 10, 3, 2, TAN[1]); }
  // tail: up and waving when happy, low when wary
  const wag = (f & 1) ? -1 : 1;
  P.set(2, by + (pose === "shy" ? 2 : -1), TAN[2]); P.set(1, by + (pose === "shy" ? 3 : -2 + wag), TAN[3]);
  // head
  const hx = 11, hy = low ? by + 2 : sit ? by - 4 : by - 3;
  rect(P, hx, hy, 4, 4, (i, j) => j === 0 ? TAN[3] : i === 3 && j > 1 ? WHITE[2] : TAN[2]);
  P.set(hx + 4, hy + 2, TAN[2]); P.set(hx + 5, hy + 2, NOSE);                           // muzzle and nose
  P.set(hx, hy - 1, TAN[1]); P.set(hx + 1, hy - 1, TAN[0]);                               // ear
  P.set(hx + 2, hy + 1, "#1b120c");                                                       // eye
  P.set(hx, hy + 3, ROPE); P.set(hx - 1, hy + 4, ROPE); P.set(hx - 1, hy + 5, "#a8905c");  // the frayed rope
  if (pose === "drink") P.set(hx + 5, hy + 4, R.water[3]);
}
const DOGF = { run: 2, trot: 2, walk: 2, sit: 2, stand: 2, beg: 2, shake: 2, eat: 2, drink: 2 };
export function dogSprite(pose, t) {
  const n = DOGF[pose] || 1, f = n > 1 ? Math.floor(t / (pose === "run" ? 90 : pose === "trot" ? 150 : 400)) % n : 0;
  return memo(`dog:${pose}:${f}`, () => ({ img: sprite(17, 13, P => dogPaint(P, pose, f)), ox: 8, oy: 11 }));
}
// the dog adrift on the hatch cover, riding the swell
export function raftSprite(t) {
  const f = Math.floor(t / 700) % 2;
  return memo(`raft:${f}`, () => ({ img: sprite(18, 12, P => {
    rect(P, 1, 8 + f, 16, 3, (i, j) => j === 0 ? R.bark[3] : R.bark[1 + (i % 4 === 0 ? 1 : 0)]);
    const q = { set: (x, y, c) => P.set(x + 1, y - 3 + f, c) }; dogPaint(q, "lie", 0);
  }), ox: 9, oy: 10 }));
}
// ---------------- gulls: white and grey, yellow bill, flapping when flying
export function gullSprite(pose, t, id) {
  const f = pose === "fly" ? Math.floor(t / 160 + id) % 2 : pose === "peck" ? Math.floor(t / 500 + id) % 2 : 0;
  return memo(`gull:${pose}:${f}`, () => ({ img: sprite(11, 8, P => {
    if (pose === "fly") {
      rect(P, 3, 4, 5, 2, (i, j) => j ? WHITE[1] : WHITE[2]); P.set(8, 4, WHITE[2]); P.set(9, 4, "#e8b84a");
      const wy = f ? 1 : 5; for (let k = 0; k < 4; k++) { P.set(4 - k, wy + (f ? k * .5 : -k * .3), "#9aa3a8"); P.set(6 + k, wy + (f ? k * .5 : -k * .3), "#9aa3a8"); }
      return;
    }
    const low = pose === "peck" && f;
    rect(P, 2, 3, 6, 3, (i, j) => j === 0 ? "#9aa3a8" : WHITE[2]); P.set(1, 3, "#3a3f44"); P.set(1, 4, "#3a3f44");
    P.set(8, low ? 4 : 2, WHITE[2]); P.set(8, low ? 5 : 3, WHITE[2]); P.set(9, low ? 5 : 3, "#e8b84a"); P.set(8, low ? 4 : 2, "#1b120c");
    if (pose !== "swim") { P.set(4, 6, "#d98b5a"); P.set(6, 6, "#d98b5a"); P.set(4, 7, "#d98b5a"); P.set(6, 7, "#d98b5a"); }
  }), ox: 5, oy: 7 }));
}
// ---------------- rabbits: brown-grey, white scut
export function rabbitSprite(pose, t, id) {
  const f = pose === "hop" || pose === "bolt" ? Math.floor(t / 140 + id) % 2 : pose === "graze" ? Math.floor(t / 900 + id) % 2 : 0;
  return memo(`rab:${pose}:${f}`, () => ({ img: sprite(9, 8, P => {
    const up = (pose === "hop" || pose === "bolt") && f ? 1 : 0, low = pose === "graze" && f;
    rect(P, 1, 3 - up, 5, 3, (i, j) => j === 0 ? "#9a8266" : "#7d6750"); P.set(0, 3 - up, "#f2eee6");
    const hx = 5, hy = low ? 3 : 1 - up; rect(P, hx, hy, 3, 3, "#8c7458"); P.set(hx + 2, hy + 1, "#1b120c");
    P.set(hx, hy - 1, "#8c7458"); P.set(hx, hy - 2, "#8c7458"); P.set(hx + 1, hy - 1, "#b89c80");
    P.set(2, 6 - up, "#6b5842"); P.set(5, 6 - up, "#6b5842");
  }), ox: 4, oy: 6 }));
}
// ---------------- a snare on its peg; a caught rabbit; scraps
export function snareSprite(set, caught) {
  return memo(`snare:${set}:${caught}`, () => ({ img: sprite(9, 9, P => {
    if (set) { rect(P, 4, 2, 1, 6, R.bark[3]); for (let k = 0; k < 6; k++) P.set(2 + Math.round(Math.cos(k) * 1.5) + 2, 4 + Math.round(Math.sin(k) * 1.5), "#a8905c"); }
    if (caught) rect(P, 1, 6, 6, 2, "#7d6750");
  }), ox: 4, oy: 7 }));
}
export function scrapsSprite() { return memo("scraps", () => ({ img: sprite(6, 4, P => { P.set(1, 2, "#c9a0a0"); P.set(2, 2, "#b87a6a"); P.set(3, 1, "#d8cfc0"); P.set(4, 2, "#b87a6a"); }), ox: 3, oy: 3 })); }
