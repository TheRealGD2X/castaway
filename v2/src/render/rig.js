// Procedural animation: Tomas is a small skeleton (hips, spine, neck, two-part arms and legs) posed every frame by
// inverse kinematics, then drawn as pixel art (shaded limbs, a hand-pixelled head, a one-pixel outline).
// An animation is not a set of drawings but a description:
//   stance  where his body is: stand, walk, kneel (one knee down), kneelUp, squat, sit
//   work    where his hands are working, relative to his feet: [forward, height] in pixels
//   motion  what the hands do there: hold, strike, rub, saw, reach, pull, scoop, stir, wave, lift, mouth, rest
//   tool    what he holds: stick, stone, pole, bundle, flake, pot
//   lean    how far he bends toward the work (the rig works it out from the work point unless told)
// His feet stay planted and his hips stay put for the stance; only what moves in real life moves. Any stance x work
// point x motion x tool is a new animation, so he can be given one for anything he does.
import { R } from "./palette.js";
import { sprite } from "./pix.js";

const W = 26, H = 28, FX = 12, FY = 27;
const COL = { skin: ["#b8704f", "#cf8a64", "#eab08a"], shirt: ["#a89e88", "#d3c9b1", "#ebe3cd"], trou: ["#3f372e", "#51463b", "#675a4b"], boot: "#2f241c", hair: "#4a2e1c", hair2: "#6b4428", beard: "#5e3c24", eye: "#1b120c" };
const HEAD = [                                  // 9 x 9, facing right, looking ahead / looking down
  ["..HHHHH..", ".HHHHHHH.", "HHHhhHHHH", "HHHHSSSSS", "HHHSSSSeS", "HHSSSSSSSs", "HBSSSSSSS", ".BBBBBBB.", "..BBBBB.."],
  [".........", "..HHHHH..", ".HHHHHHH.", "HHHhhHHHH", "HHHHHSSSS", "HHHSSSSSS", "HHBSSSSeSs", ".BBBSSSS.", "..BBBBB.."],
];
const HC = { H: COL.hair, h: COL.hair2, S: COL.skin[2], s: COL.skin[1], B: COL.beard, e: COL.eye };
// ---------------------------------------------------------------- stances: hips, feet, knees (relative to the feet centre)
const STANCE = {
  stand: { hip: [0, -11], spine: 8, feet: [[-1, 0], [2, 0]], knee: 1 },
  kneel: { hip: [-1, -7], spine: 8, feet: [[-7, 0], [4, 0]], knees: [[-3, -1], [4, -6]] },         // back knee on the ground
  kneelUp: { hip: [-1, -8], spine: 8, feet: [[-7, 0], [-6, 0]], knees: [[3, -1], [4, -1]] },       // both knees down, sitting up
  squat: { hip: [-2, -6], spine: 8, feet: [[0, 0], [2, 0]], knees: [[4, -7], [5, -7]] },
  sit: { hip: [-3, -2], spine: 8, feet: [[6, 0], [7, 0]], knees: [[3, -6], [4, -6]] },
};
// ---------------------------------------------------------------- geometry
const lerp = (a, b, t) => a + (b - a) * t;
function ik(sx, sy, tx, ty, a, b, bendSign) {           // two-bone IK: returns the elbow/knee
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy) || .001;
  const dd = Math.min(a + b - .05, Math.max(Math.abs(a - b) + .05, d));
  const ang = Math.atan2(dy, dx), cA = (a * a + dd * dd - b * b) / (2 * a * dd), A = Math.acos(Math.max(-1, Math.min(1, cA)));
  const e = ang + bendSign * A;
  return [sx + Math.cos(e) * a, sy + Math.sin(e) * a, sx + dx / d * dd, sy + dy / d * dd];
}
// ---------------------------------------------------------------- the hands' motion at the work point, phase p in [0,1)
const ease = p => p < .5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
function hands(motion, wx, wy, p, two) {
  const s = Math.sin(p * 6.2832), c = Math.cos(p * 6.2832);
  switch (motion) {
    case "strike": { const up = p < .7 ? ease(p / .7) : 1 - (p - .7) / .3; return [[wx + 1 - up * 2, wy - up * 8], two ? [wx - up * 2, wy - up * 8 + 1] : [wx - 5, wy + 1]]; }  // raise slowly, bring down hard
    case "rub": { const d = p < .8 ? p / .8 : 1 - (p - .8) / .2; return [[wx, wy - 5 + d * 7], [wx + 1, wy - 4 + d * 7]]; }            // palms working down a spindle
    case "saw": return [[wx + s * 2.5, wy], [wx - 3, wy + 1]];
    case "reach": return [[wx + c * 1, wy + s * 1.5], [wx - 6, wy + 5]];
    case "pick": { const out = p < .6 ? 1 : 0; return [[lerp(wx - 7, wx, out) + s * .8, lerp(wy + 5, wy, out)], [wx - 6, wy + 6]]; }  // take, drop in the fold of the shirt
    case "pull": { const d = ease(p); return [[wx - d * 5, wy + d * 1.5], [wx - d * 5 - 1, wy + d * 1.5 + 1]]; }
    case "scoop": return [[wx + c * 3, wy + Math.abs(s) * -3], [wx + c * 3 - 2, wy + Math.abs(s) * -3 + 1]];
    case "stir": return [[wx + c * 2, wy + s * 1], [wx - 7, wy + 3]];
    case "wave": return [[wx + 3 + s * 2.5, wy - 12], [wx - 4 - s * 2.5, wy - 12]];
    case "lift": return [[wx + 1, wy - 2], [wx - 2, wy - 2]];
    case "mouth": { const up = p < .5 ? ease(p * 2) : ease((1 - p) * 2); return [[lerp(wx, 3, up), lerp(wy, -19, up)], [wx - 3, wy + 1]]; }
    case "warm": return [[wx + s * .6, wy], [wx - 1 + s * .6, wy + 1]];
    case "rest": return [[wx, wy], [wx - 4, wy]];
    default: return [[wx, wy], [wx - 4, wy + 1]];
  }
}
// ---------------------------------------------------------------- raster helpers
function brush(P, x0, y0, x1, y1, r, cols, shadeSide = 1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2) || 1, nx = -(y1 - y0), ny = x1 - x0, nl = Math.hypot(nx, ny) || 1;
  for (let k = 0; k <= n; k++) {
    const cx = lerp(x0, x1, k / n), cy = lerp(y0, y1, k / n);
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
      const dx = xx + .5 - cx, dy = yy + .5 - cy; if (dx * dx + dy * dy > r * r + .25) continue;
      const side = (dx * nx + dy * ny) / nl * shadeSide;                    // which side of the limb faces the light
      P.set(xx, yy, cols[side > r * .35 ? 2 : side < -r * .35 ? 0 : 1]);
    }
  }
}
const put = (P, x, y, c) => P.set(Math.round(x), Math.round(y), c);
function prop(P, tool, hx, hy, ex, ey, p) {
  const dx = hx - ex, dy = hy - ey, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;   // along the forearm
  if (tool === "stick" || tool === "branch") { const L = tool === "branch" ? 9 : 6; brush(P, hx - ux * 2, hy - uy * 2, hx + ux * L, hy + uy * L, .5, [R.bark[1], R.bark[2], R.bark[3]]); }
  else if (tool === "stone" || tool === "flake") { const c = tool === "flake" ? R.flint : R.rock; put(P, hx + ux * 1.5, hy + uy * 1.5, c[3]); put(P, hx + ux * 1.5 + 1, hy + uy * 1.5, c[2]); put(P, hx + ux * 1.5, hy + uy * 1.5 + 1, c[1]); }
  else if (tool === "bundle") { for (let i = -3; i <= 3; i++) for (let j = -2; j <= 1; j++) if (Math.abs(i) + Math.abs(j) < 4) put(P, hx + i, hy + j - 1, R.fern[(i + j + 6) % 4]); }
  else if (tool === "pot") { for (let i = -1; i <= 2; i++) for (let j = 0; j <= 2; j++) put(P, hx + i, hy - j, j === 2 ? R.water[3] : R.birch[j ? 2 : 1]); }
}
// ---------------------------------------------------------------- pose and draw one frame
export function drawRig(P, spec, p) {
  const st = STANCE[spec.stance === "walk" ? "stand" : spec.stance] || STANCE.stand, walking = spec.stance === "walk";
  const ox = FX, oy = FY;
  // walking: a gait cycle moves the feet (the far foot half a cycle behind) and bobs the hips
  let feet = st.feet.map(f => [f[0], f[1]]), bob = 0;
  if (walking) { for (let i = 0; i < 2; i++) { const q = p + i * .5, s = Math.sin(q * 6.2832), c = Math.cos(q * 6.2832); feet[i] = [.5 + s * 3.2, -Math.max(0, c) * 2.2]; } bob = -Math.abs(Math.sin(p * 12.566)) * 1; }
  const hipX = ox + st.hip[0], hipY = oy + st.hip[1] + bob;
  // the spine leans toward the work: the lower and further the work point, the more he bends
  const wx = ox + (spec.work ? spec.work[0] : 5), wy = oy + (spec.work ? spec.work[1] : -9);
  const lean = walking ? .06 : spec.lean ?? Math.max(0, Math.min(1.1, (wy - hipY + 2) / 12 + Math.max(0, (spec.work ? spec.work[0] : 0) - 8) * .05));   // only work below the hips bends him
  const effort = spec.motion === "strike" ? Math.sin(p * 6.2832) * .06 : spec.motion === "pull" ? -Math.sin(p * 3.1416) * .08 : 0;
  const a = lean + effort, nX = hipX + Math.sin(a) * st.spine, nY = hipY - Math.cos(a) * st.spine;
  // shoulders a pixel either side along the chest; head above the neck, looking down if the work is low
  const sh = [[nX - 1.5, nY + 1], [nX + 1.2, nY + 1.2]];
  const hs = hands(spec.motion || "hold", wx, wy, p, spec.two);
  if (walking) { const s = Math.sin(p * 6.2832); hs[0] = [nX + 1 + s * 2.5, nY + 7]; hs[1] = [nX - 1 - s * 2.5, nY + 7]; if (spec.tool === "pole") { hs[0] = [nX + 3, nY - 1]; } }
  const armL = [4, 4.2], legL = [5.4, 5.6];
  const arm = i => { const [ex, ey, hx, hy] = ik(sh[i][0], sh[i][1], hs[i][0], hs[i][1], armL[0], armL[1], i ? 1 : 1); return { ex, ey, hx, hy }; };
  const leg = i => {
    const hx = hipX + (i ? .8 : -.8), fx = ox + feet[i][0], fy = oy + feet[i][1] - 1;
    if (st.knees && !walking) return { kx: ox + st.knees[i][0], ky: oy + st.knees[i][1], fx, fy, hx };
    const [kx, ky] = ik(hx, hipY, fx, fy, legL[0], legL[1], -1); return { kx, ky, fx, fy, hx };
  };
  const A = [arm(0), arm(1)], L = [leg(0), leg(1)];
  const drawLeg = (l, far) => { const cols = far ? [COL.trou[0], COL.trou[0], COL.trou[1]] : COL.trou; brush(P, l.hx, hipY, l.kx, l.ky, 1.4, cols); brush(P, l.kx, l.ky, l.fx, l.fy, 1.2, cols); const bx = Math.round(l.fx), by = Math.round(l.fy); for (let i = -1; i <= 2; i++) { P.set(bx + i, by + 1, COL.boot); if (i < 2) P.set(bx + i, by, COL.boot); } };
  const drawArm = (q, far) => { const sc = far ? [COL.shirt[0], COL.shirt[0], COL.shirt[1]] : COL.shirt, kc = far ? [COL.skin[0], COL.skin[0], COL.skin[1]] : COL.skin; brush(P, sh[far ? 0 : 1][0], sh[far ? 0 : 1][1], q.ex, q.ey, 1.1, sc); brush(P, q.ex, q.ey, q.hx, q.hy, .9, kc); brush(P, q.hx, q.hy, q.hx + .6, q.hy + .4, 1, kc); };
  // back to front: far arm, far leg, torso, near leg, head, tool, near arm
  drawArm(A[0], true); if (spec.tool && spec.two) prop(P, spec.tool, A[0].hx, A[0].hy, A[0].ex, A[0].ey, p);
  drawLeg(L[0], true);
  brush(P, hipX, hipY - 1, nX, nY + 1, 3.1, COL.shirt);                                   // the body in his shirt
  brush(P, hipX - .5, hipY, hipX + .5, hipY, 2.2, COL.trou);                             // belt line / hips
  drawLeg(L[1], false);
  const look = wy > nY + 4 ? 1 : 0, hx0 = Math.round(nX - 4 + a * 2), hy0 = Math.round(nY - 9 + look);
  HEAD[look].forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = HC[row[x]]; if (c) P.set(hx0 + x, hy0 + y, c); } });
  if (spec.tool && !spec.two) prop(P, spec.tool, A[1].hx, A[1].hy, A[1].ex, A[1].ey, p);
  if (spec.tool === "pole" && walking) brush(P, nX - 8, nY - 1, nX + 9, nY - 3, .6, [R.bark[1], R.bark[2], R.bark[3]]);
  drawArm(A[1], false);
  if (spec.extra) spec.extra(P, { ox, oy, p, hands: A });
}
// ---------------------------------------------------------------- lying down (a rig on its side would be overkill)
function sleeping(P) {
  // on his side, knees drawn up, head pillowed on his arm, one hand tucked under his cheek
  const rows = [
    "...HHHH.................",
    "..HHHHHHH..wWWWWWv......",
    ".HHHhHHHHwWWWWWWWWv.....",
    ".HHHSSSSwWWWWWWWWWWvTT..",
    ".HHSSeSSwWWWWWWWWWWTTTT.",
    "..BSSSSSsvwWWWWWWWvTTTTK",
    "..BBBSSSSs.vwwwwwvTTTTKK",
    "...BBSSSSS.....TTTTT.KK.",
  ];
  const cc = { H: COL.hair, h: COL.hair2, S: COL.skin[2], s: COL.skin[1], e: COL.eye, B: COL.beard, W: COL.shirt[2], w: COL.shirt[1], v: COL.shirt[0], T: COL.trou[2], K: COL.boot };
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) { const c = cc[r[x]]; if (c) P.set(x + 1, y + FY - 7, c); } });
}
const cache = new Map();
// a frame of an animation: spec + phase, quantised to `frames` steps per cycle and cached
export function rigSprite(spec, t) {
  if (spec.stance === "lie") { let s = cache.get("lie"); if (!s) { s = sprite(W, H, sleeping); cache.set("lie", s); } return { img: s, ox: FX, oy: FY }; }
  const period = spec.period || 1000, n = spec.frames || 8, f = Math.floor(((t % period) + period) % period / period * n), key = spec.key + ":" + f;
  let s = cache.get(key); if (!s) { s = sprite(W, H, P => drawRig(P, spec, f / n)); cache.set(key, s); }
  return { img: s, ox: FX, oy: FY };
}
