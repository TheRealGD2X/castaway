// Tomas's body language. Every pose his actions set (man.pose) is one line of description for the procedural rig
// (rig.js): a stance, where his hands work, what they do there, and what they hold. To give him a new animation,
// add a line here; nothing is drawn by hand except his head.
import { rigSprite } from "./rig.js";

export const ANIM = {
  stand:     { stance: "stand", work: [3, -8], motion: "rest", lean: 0 },
  walk:      { stance: "walk", period: 650, frames: 8 },
  carrywalk: { stance: "walk", tool: "pole", period: 750, frames: 8 },
  wave:      { stance: "stand", work: [2, -10], motion: "wave", period: 700, frames: 6, lean: 0 },
  pick:      { stance: "stand", work: [9, -15], motion: "pick", period: 1800, frames: 8, lean: .05 },          // berries at chest height
  snap:      { stance: "stand", work: [8, -9], motion: "pull", tool: "branch", two: true, period: 1400, frames: 6, lean: .1 },
  chop:      { stance: "stand", work: [9, -7], motion: "strike", tool: "stone", period: 900, frames: 8, lean: .2 },
  build:     { stance: "stand", work: [8, -8], motion: "strike", tool: "stone", period: 1000, frames: 8, lean: .15 },  // driving a stake, lashing
  crouch:    { stance: "kneel", work: [9, -2], motion: "scoop", period: 1600, frames: 8 },                   // gathering off the ground
  pull:      { stance: "kneel", work: [10, -3], motion: "pull", tool: "bundle", period: 1500, frames: 8 },    // bracken, reeds
  cut:       { stance: "kneel", work: [10, -3], motion: "saw", tool: "flake", period: 700, frames: 6 },
  tend:      { stance: "kneelUp", work: [9, -4], motion: "stir", tool: "stick", period: 2000, frames: 8 },    // feeding, cooking, boiling
  drink:     { stance: "kneel", work: [10, -1], motion: "mouth", period: 2400, frames: 8 },
  drill:     { stance: "kneelUp", work: [7, -8], motion: "rub", period: 900, frames: 8, lean: .15 },         // the hand drill, palms working down
  knap:      { stance: "sit", work: [6, -5], motion: "strike", tool: "stone", period: 800, frames: 8, lean: .25 },
  whittle:   { stance: "sit", work: [6, -5], motion: "saw", tool: "flake", period: 700, frames: 6, lean: .25 },
  sit:       { stance: "sit", work: [5, -6], motion: "rest", lean: .05 },
  rest:      { stance: "sit", work: [5, -6], motion: "rest", lean: .05 },
  warm:      { stance: "sit", work: [9, -8], motion: "warm", period: 3000, frames: 4, lean: .1 },           // hands to the fire
  eat:       { stance: "sit", work: [5, -6], motion: "mouth", period: 2600, frames: 8, lean: .05 },
  sleep:     { stance: "lie" },
};
for (const k in ANIM) ANIM[k].key = k;
export function manSprite(pose, t) { return rigSprite(ANIM[pose] || ANIM.stand, t); }
