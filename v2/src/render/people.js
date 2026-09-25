// Tomas as pixel art: a little posable figure (head, torso, two arms, two legs) drawn limb by limb from a pose and
// an animation frame, outlined and cached. Poses come from what he is doing (man.pose, set by the action he's in),
// so every action has its own body language: the drill spun between his palms, the flake struck on the flint,
// poles on his shoulder, bracken in his arms, curled up asleep.
import { R, OUT } from "./palette.js";
import { sprite } from "./pix.js";

const SKIN = R.skin, HAIR = "#4a2e1c", BEARD = "#5e3c24", SHIRT = ["#8f8573", "#b3a992", "#d3c9b1", "#ebe3cd"], TROUS = ["#3a322b", "#51463b", "#675a4b"], BOOT = "#2f241c";
const W = 20, H = 22, FX = 10, FY = 20;       // sprite size; feet at (FX, FY)
const cache = new Map();

// draw a limb as a 2 px wide line from (x0,y0) to (x1,y1)
function limb(P, x0, y0, x1, y1, col, colB, w = 2) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let s = 0; s <= n; s++) { const x = Math.round(x0 + (x1 - x0) * s / n), y = Math.round(y0 + (y1 - y0) * s / n); P.set(x, y, col); if (w > 1) P.set(x + 1, y, colB || col); }
}
function rect(P, x, y, w, h, f) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, f(i, j)); }
function head(P, cx, cy, tilt = 0) {
  // a round head, hair on top and at the back, a beard, one eye on the side he faces (right)
  for (let j = -3; j <= 2; j++) for (let i = -3; i <= 2; i++) {
    if ((i === -3 || i === 2) && (j === -3 || j === 2)) continue;
    const x = cx + i, y = cy + j + (i > 0 ? tilt : 0);
    let c = SKIN[i < 0 ? 2 : 1]; if (i === 2) c = SKIN[1]; if (i <= -2 && j >= -1) c = SKIN[0];
    if (j <= -2 || (i <= -2 && j <= 0)) c = HAIR;
    if (j >= 1 && i >= -2) c = BEARD;
    P.set(x, y, c);
  }
  P.set(cx + 1, cy - 1 + tilt, OUT);                                   // eye
  P.set(cx + 3, cy + tilt, SKIN[1]);                                    // nose
}
function torso(P, x, y, w, h) { rect(P, x, y, w, h, (i, j) => SHIRT[j === h - 1 ? 0 : i === 0 ? 3 : i < w - 1 ? 2 : 1]); }
function held(P, what, x, y, f) {
  if (what === "pole") limb(P, x - 7, y - 1, x + 8, y - 3, R.bark[3], R.bark[2], 1);
  else if (what === "bracken") { for (let i = -3; i <= 3; i++) for (let j = -2; j <= 1; j++) if (Math.abs(i) + Math.abs(j) < 4) P.set(x + i, y + j, R.fern[(i + j + 5) % 4]); }
  else if (what === "stone") rect(P, x, y, 3, 2, (i, j) => R.rock[j ? 1 : 3]);
  else if (what === "stick") limb(P, x, y, x + 4, y - 3 - f, R.bark[3], null, 1);
  else if (what === "wood") { for (let k = 0; k < 3; k++) limb(P, x - 3, y - k, x + 3, y - k - 1, R.bark[k + 1], null, 1); }
}

// pose -> the figure for frame f. Every pose sets hip height, torso lean and where hands and feet go.
function paint(P, pose, f) {
  const leg = (hx, hy, fx, fy, back) => { limb(P, hx, hy, fx, fy - 1, TROUS[back ? 0 : 2], TROUS[back ? 0 : 1]); P.set(fx, fy, BOOT); P.set(fx + 1, fy, BOOT); P.set(fx + 2, fy, back ? null : BOOT); };
  const arm = (sx, sy, hx, hy, back) => { limb(P, sx, sy, hx, hy, back ? SHIRT[0] : SHIRT[2], back ? SHIRT[0] : SHIRT[1]); P.set(hx + (back ? 0 : 1), hy, SKIN[back ? 1 : 2]); };
  const std = (hipY, lean, a1, a2, l1, l2, tilt, carry) => {       // a standing-type figure
    const tx = FX - 2 + lean, ty = hipY - 6;
    leg(FX - 1 + (l2 || 0), hipY, FX - 2 + (l2 || 0) * 2, FY, true);                    // back leg
    arm(tx + 1, ty + 1, a2[0], a2[1], true);                                               // back arm
    torso(P, tx, ty, 5, 7);
    leg(FX + (l1 || 0), hipY, FX + (l1 || 0) * 2, FY, false);                              // front leg
    head(P, tx + 2 + (lean > 0 ? 1 : 0), ty - 3, tilt || 0);
    if (carry) held(P, carry.what, carry.x, carry.y, f);
    arm(tx + 3, ty + 1, a1[0], a1[1], false);                                              // front arm
  };
  switch (pose) {
    case "walk": case "carrywalk": {
      const s = [-2, 0, 2, 0][f], b = [0, -1, 0, -1][f];
      const P2 = { what: pose === "carrywalk" ? "pole" : null };
      std(14 + b, 0, [FX + 2 - s, 15 + b], [FX - 1 + s, 15 + b], s / 2, -s / 2, 0, P2.what ? { what: "pole", x: FX, y: 10 + b } : null);
      break;
    }
    case "stand": std(14, 0, [FX + 2, 15], [FX - 1, 15], 0, 0); break;
    case "wave": std(14, 0, f ? [FX + 5, 1] : [FX + 3, 0], f ? [FX - 2, 1] : [FX - 4, 2], 0, 0, -1); break;     // both arms up, waving
    case "pick": std(14, 0, [FX + 4, 4 + f], [FX - 1, 15], 0, 0, -1); break;                  // reaching up into a bush
    case "snap": case "chop": std(14, f ? 1 : 0, f ? [FX + 5, 12] : [FX + 4, 4], f ? [FX + 3, 12] : [FX + 2, 4], 0, 0, 0, { what: "stick", x: f ? FX + 5 : FX + 4, y: f ? 12 : 4 }); break;
    case "build": std(14, 1, f ? [FX + 5, 6] : [FX + 5, 9], [FX + 3, 8], .5, 0, 0, { what: "pole", x: FX + 5, y: f ? 5 : 8 }); break;
    case "pull": case "crouch": case "tend": case "drink": case "cut": {       // down on one knee, hands to the ground
      const tx = FX - 2 + 2, ty = 10;
      leg(FX - 1, 16, FX - 4, FY, true);
      limb(P, FX + 1, 16, FX + 4, 16, TROUS[2], TROUS[1]); limb(P, FX + 4, 17, FX + 4, FY - 1, TROUS[2]); P.set(FX + 4, FY, BOOT); P.set(FX + 5, FY, BOOT);
      arm(tx + 1, ty + 1, FX + 5, 17 - f, true);
      torso(P, tx, ty, 5, 6);
      head(P, tx + 3, ty - 3, 1);
      if (pose === "pull") held(P, "bracken", FX + 6, 16 - f, f);
      arm(tx + 3, ty + 1, pose === "tend" ? FX + 7 : FX + 6 + f, pose === "tend" ? 15 - f : 18, false);
      break;
    }
    case "sit": case "warm": case "eat": case "rest": {
      const tx = FX - 3, ty = 10;
      limb(P, FX - 1, 16, FX + 4, 16, TROUS[1], TROUS[0]); limb(P, FX + 4, 16, FX + 5, FY - 1, TROUS[1]); P.set(FX + 5, FY, BOOT); P.set(FX + 6, FY, BOOT);
      arm(tx + 1, ty + 1, FX + 1, 15, true);
      torso(P, tx, ty, 5, 7);
      limb(P, FX, 16, FX + 5, 16, TROUS[2], TROUS[1]); limb(P, FX + 5, 16, FX + 5, FY - 1, TROUS[2]); P.set(FX + 6, FY, BOOT);
      head(P, tx + 2, ty - 3, pose === "rest" ? 1 : 0);
      if (pose === "eat") arm(tx + 3, ty + 1, tx + 5, ty - 1 + f, false);
      else if (pose === "warm") arm(tx + 3, ty + 1, FX + 6, 12 + f, false);
      else arm(tx + 3, ty + 1, FX + 3, 15, false);
      break;
    }
    case "drill": {       // kneeling over the hearth board, the spindle spun between flat palms, hands working down it
      const tx = FX - 3, ty = 9 + (f & 1);
      limb(P, FX - 1, 16, FX + 3, 16, TROUS[1], TROUS[0]); limb(P, FX + 3, 17, FX + 3, FY - 1, TROUS[1]); P.set(FX + 3, FY, BOOT);
      torso(P, tx, ty, 5, 7);
      head(P, tx + 3, ty - 3, 1);
      limb(P, FX + 6, 8, FX + 6, FY - 1, R.bark[4], null, 1);                         // the spindle
      rect(P, FX + 3, FY - 1, 7, 1, () => R.bark[2]);                                  // the hearth board
      const hy = 10 + ((f * 3) % 7);
      arm(tx + 2, ty + 1, FX + 5, hy, true); arm(tx + 4, ty + 1, FX + 6, hy + 1, false);
      if (f % 2) P.set(FX + 8, FY - 3 - f, "#c9c3b8");                                  // a wisp of smoke
      break;
    }
    case "knap": case "whittle": {
      const tx = FX - 3, ty = 10;
      limb(P, FX - 1, 16, FX + 4, 16, TROUS[1], TROUS[0]); limb(P, FX + 4, 17, FX + 4, FY - 1, TROUS[1]); P.set(FX + 4, FY, BOOT); P.set(FX + 5, FY, BOOT);
      torso(P, tx, ty, 5, 7); head(P, tx + 3, ty - 3, 1);
      rect(P, FX + 3, 14, 3, 2, (i, j) => (pose === "knap" ? R.flint : R.bark)[j ? 1 : 3]);   // the core, or the stick
      arm(tx + 2, ty + 1, FX + 3, 15, true);
      arm(tx + 3, ty + 1, FX + 5, pose === "knap" ? (f ? 13 : 8) : 14 - f, false);
      if (pose === "knap") rect(P, FX + 5, f ? 12 : 7, 2, 2, (i, j) => R.rock[2 + j]);
      break;
    }
    case "sleep": {       // curled on his side, knees up
      for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) P.set(FX - 6 + i, FY - 4 + j, j === 0 ? SHIRT[3] : j === 3 ? SHIRT[0] : SHIRT[2]);
      for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) P.set(FX + 3 + i, FY - 3 + j, TROUS[j ? 1 : 2]);
      for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) P.set(FX - 10 + i, FY - 4 + j, j < 2 ? HAIR : SKIN[1]);
      break;
    }
    default: std(14, 0, [FX + 2, 15], [FX - 1, 15], 0, 0);
  }
}
const FRAMES = { wave: 2, walk: 4, carrywalk: 4, drill: 6, knap: 2, whittle: 2, snap: 2, chop: 2, build: 2, pick: 2, pull: 2, crouch: 2, tend: 2, cut: 2, warm: 2, eat: 2 };
export function manSprite(pose, t) {
  const n = FRAMES[pose] || 1, speed = pose === "drill" ? 110 : pose === "walk" || pose === "carrywalk" ? 170 : 420;
  const f = n > 1 ? Math.floor(t / speed) % n : 0, key = pose + f;
  let s = cache.get(key); if (!s) { s = sprite(W, H, P => paint(P, pose, f)); cache.set(key, s); }
  return { img: s, ox: FX, oy: FY };
}
