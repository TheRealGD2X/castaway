// Tomas's body language. Every pose his actions set (man.pose) is one line of description for the procedural rig
// (rig.js): a stance, where his hands work, what they do there, and what they hold. To give him a new animation,
// add a line here; nothing is drawn by hand except his head.
import {workPose} from './workpose.js';
import { rigSprite } from "./rig.js";
import { motionFrames } from "./motion.js";

export const ANIM = {
  stand:     { stance: "stand", work: [4, -12], motion: "rest", lean: 0 },
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
  weave:     { stance: "sit", work: [7,-6], motion: "saw", tool: "cord", two: true, period: 1700, frames: 8, lean: .1 },
  potter:    { stance: "sit", work: [7,-5], motion: "stir", tool: "clay", period: 2200, frames: 8, lean: .15 },
  fish:      { stance: "sit", work: [7,-8], motion: "rest", tool: "rod", period: 3000, frames: 8, lean: .05 },
  carry:     { stance: "stand", work: [6,-14], motion: "lift", tool: "basket", two: true, period: 1400, frames: 4 },
  stonewalk: { stance: "walk", work: [5,-9], tool: "stone", period: 900, frames: 8 },
  lash:      {stance:'stand',work:[8,-15],motion:'saw',tool:'cord',two:true,period:1700},
  roof:      {stance:'stand',work:[5,-23],motion:'lift',tool:'bundle',two:true,period:2300},
  dig:       {stance:'kneel',work:[9,-2],motion:'scoop',two:true,period:1600},
  axework:   {stance:'stand',work:[8,-8],motion:'strike',tool:'axe',period:1600},
  handfish:  {stance:'sit',work:[7,-8],motion:'rest',tool:'line',two:true,period:3000},
  sleep:     { stance: "lie" },
  lie:       { stance: "lie" },                                                                         // conserving heat while awake
};
for (const k in ANIM) {
  const a = ANIM[k]; a.key = k;
  if (a.stance !== 'lie') { a.period ||= 4200; a.frames = motionFrames(a.period); }
}
export function manSprite(pose, t, M, W, position) {
  const mood = M?.B.ill > .2 ? 'ill' : M?.B.fatigue > .7 || M?.B.sleepP > .8 ? 'tired' : 'calm';
  const spec={...(ANIM[pose]||ANIM.stand),...workPose(W,M,position),mood};
  if(M?.workContact?.t===W?.t&&M.workContact.pose===pose&&M.workContact.frequency>0){spec.period=1000/M.workContact.frequency;spec.frames=motionFrames(spec.period);}
  spec.key=pose+JSON.stringify([spec.work?.map(n=>Math.round(n*3)/3),spec.stance,spec.tool,spec.two,Math.round((spec.toolLength||0)*100),Math.round((spec.loadKg||0)*2)/2,spec.carry,spec.lineEnd?.map(n=>Math.round(n)),spec.workpiece?.kind,Math.floor((spec.workpiece?.progress||0)*12),Math.round(spec.period/100)]);
  return rigSprite(spec,t);
}
