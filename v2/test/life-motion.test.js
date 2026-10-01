import assert from 'node:assert/strict';
import {lifeMotion} from '../src/render/life-motion.js';
import {drawRig} from '../src/render/rig.js';
const B={alive:true,fatigue:.3,shiver:.2,sleepP:.4,hurt:[{sev:.1}]},before=JSON.stringify(B),work={stance:'stand',motion:'hold',work:[5,-9],lean:0},P={grid:3,dot(){},set(){}};
const samples=Array.from({length:600},(_,i)=>lifeMotion(B,work,i*100,71));
assert.equal(JSON.stringify(B),before);assert(samples.every(s=>Object.values(s).every(v=>typeof v==='boolean'||Number.isFinite(v))));
assert(new Set(samples.map(s=>JSON.stringify(s))).size>100,'Independent clocks should provide substantial combinations');
assert(samples.some(s=>s.blink)&&samples.some(s=>!s.blink));assert(samples.some(s=>s.breath>0)&&samples.some(s=>s.breath<0));
assert.deepEqual(lifeMotion(B,work,12345,71),lifeMotion(B,work,12345,71));
assert(lifeMotion({...B,fatigue:1}, {stance:'walk'},1000,71).stride<lifeMotion({...B,fatigue:0,hurt:[]},{stance:'walk'},1000,71).stride);
assert.equal(lifeMotion({...B,alive:false},work,1000,71).breath,0);
assert.notEqual(lifeMotion(B,{stance:'lie'},1000,71).chest,lifeMotion(B,{stance:'lie'},3000,71).chest);
const base=drawRig(P,work,.3);
for(const life of samples){const pose=drawRig(P,{...work,life},.3);for(let j=0;j<2;j++){assert.equal(pose.feet[j].fx,base.feet[j].fx);assert.equal(pose.feet[j].fy,base.feet[j].fy);assert(Math.hypot(pose.hands[j].hx-base.hands[j].hx,pose.hands[j].hy-base.hands[j].hy)<1e-7,'Held work contact drifted with breathing');}}
console.log('ok   independent living motion, sleep breath, physiological variation, deterministic display, fixed feet and held work contacts; body state untouched');
