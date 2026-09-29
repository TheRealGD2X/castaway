import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld, step, save, load } from '../src/sim/world.js';
import { seasonsStep, liquidRain, groundCost } from '../src/sim/seasons.js';
import { heritageTen, footfall, record } from '../src/sim/heritage.js';
import { FAMILIES, place, propsOf, shelterAt } from '../src/build/build.js';
import { ACTIONS } from '../src/mind/actions.js';
import { craftGoals } from '../src/mind/crafts.js';
import { T } from '../src/world/gen.js';
import { newFire } from '../src/sim/fire.js';
import { animalsStep } from '../src/sim/animals.js';
import { relevant, plan } from '../src/mind/brain.js';
import { BORN, SEED } from '../src/config.js';

const W=createWorld(SEED,BORN),M=W.man;
W.wx={...W.wx,temp:-5,sun:0,cloud:1,hum:.95,rain:3,wind:3,gust:5};W.surface.temp=-5;
for(let n=0;n<120;n++)seasonsStep(W);
assert(W.surface.snow>5&&W.surface.frost>0);assert.equal(liquidRain(W),0);
const snowy=groundCost(W,0);assert(snowy>1);
W.wx.temp=12;W.wx.sun=600;W.wx.rain=0;
for(let n=0;n<360;n++)seasonsStep(W);
assert(W.surface.snow<.01&&W.surface.frost<.01);
W.surface={temp:-5,snow:0,frost:0,puddle:5,ice:0};W.wx.temp=-5;W.wx.sun=0;
seasonsStep(W);assert(W.surface.ice>0&&W.surface.puddle<5);
console.log('ok   snow, frost, freeze, thaw, liquid rain and snow walking cost follow heat and water');

const tile=W.ter.findIndex((t,i)=>t===3&&!W.treeAt[i]),x=tile%W.MW+.5,y=Math.floor(tile/W.MW)+.5;
M.x=x;M.y=y;M.path=null;
const make=k=>{const stages=FAMILIES[k].make({cover:'bracken',bedMat:'boughs'}),s=place(W,{k,x,y,dir:0,stages});s.stage=stages.length;s.props=propsOf(s);return s;};
const hut=make('leanto'),bed=make('bedding');hut.props.bed=0;assert(shelterAt(W,x,y).bed>.9);
const before=hut.props.rain;hut.integrity=.55;hut.props=propsOf(hut);assert(hut.props.rain<before*.6);
W.wx.gust=40;W.wx.rain=8;W.surface.snow=0;const old=hut.integrity;heritageTen(W);assert(hut.integrity<old);
M.inv={poles:1,cord:1,debris:2};let st={},t={sid:hut.id,x,y,tile};
for(let n=0;n<70;n++){W.t++;const r=ACTIONS.repairHome.exec(W,M,t,st);if(r==='done')break;}
assert(hut.integrity>.9);assert.equal(M.inv.cord,0);assert.equal(M.inv.poles,0);
console.log('ok   installed bedding and storm damage change real shelter protection; repair consumes materials');

M.inv={withies:3};st={};
for(let n=0;n<12;n++){W.t++;ACTIONS.twistCord.exec(W,M,{x:null},st);}
assert.equal(M.inv.withies,0);assert(M.workpieces.cord.progress>0);st={};
for(let n=0;n<50;n++){W.t++;if(ACTIONS.twistCord.exec(W,M,{x:null},st)==='done')break;}
assert.equal(M.inv.cord,6);assert.equal(M.inv.withies,0);
const replay=load(save(W));assert.equal(save(replay),save(W));
const beforeInv=JSON.stringify(M.inv);st={};ACTIONS.haftAxe.exec(W,M,{x:null},st);assert.equal(ACTIONS.haftAxe.exec(W,M,{x:null},st),'fail');assert.equal(JSON.stringify(M.inv),beforeInv);
console.log('ok   crafting consumes physical materials; unfinished work survives interruption and checkpoints');

const F=newFire(x,y);F.id=W.nextId++;F.lit=true;F.heat=500;W.fires=[F];M.inv.greenPot=1;M.potDry=1;M.potTemp=20;M.potDose=0;
t={sid:F.id,x,y,tile};st={};for(let n=0;n<123;n++)ACTIONS.fireClay.exec(W,M,t,st);
assert(!M.inv.clayPot);assert(M.inv.greenPot);F.heat=9000;st={};
for(let n=0;n<140;n++){if(ACTIONS.fireClay.exec(W,M,t,st)==='done')break;}
assert(M.inv.clayPot&&M.inv.pot);assert.equal(M.inv.greenPot,0);
console.log('ok   pottery needs sustained firing heat; a weak fire cannot make ceramics');

const water=W.ter.findIndex(t=>t===T.STREAM);t={tile:water,x:water%W.MW+.5,y:Math.floor(water/W.MW)+.5};M.x=t.x;M.y=t.y;M.path=null;M.inv.line=1;M.lineStrength=.95;
W.fish.stream=0;const raw=M.inv.raw||0;st={};for(let n=0;n<65;n++)ACTIONS.lineFish.exec(W,M,t,st);assert.equal(M.inv.raw||0,raw);
W.fish.stream=W.fishK.stream;M.skill.forage=8;M.lineStrength=.95;
let caught=0;for(let pass=0;pass<10;pass++){st={};M.inv.line=1;M.lineStrength=.95;for(let n=0;n<62;n++)ACTIONS.lineFish.exec(W,M,t,st);caught=M.inv.raw||0;if(caught>0)break;}
assert(caught>0);assert(W.fish.stream<W.fishK.stream);
console.log('ok   fishing takes a real fish from its population; empty water provides no food');

footfall(W,x,y,4);const wear=W.traces[tile].wear;W.wx.temp=15;W.wx.gust=0;W.wx.rain=0;heritageTen(W);assert(W.traces[tile].wear<wear);
W.scent[tile]=3;const scent=W.scent[tile];W.wx.rain=4;heritageTen(W);assert(W.scent[tile]<scent);
const dog=W.animals.find(a=>a.sp==='dog');dog.adrift=0;dog.x=x;dog.y=y;dog.tx=x;dog.ty=y;dog.E=.9;dog.thirst=0;dog.cold=0;dog.tired=0;dog.trust=.9;dog.fear=0;M.B.alive=true;M.x=x;M.y=y;W.wx.rain=0;W.wx.wind=2;W.wx.elev=.5;
animalsStep(W);assert(dog.places&&dog.confidence>0&&dog.memories);assert(['wag','relaxed','low'].includes(dog.tail));
record(W,'test-milestone','home','An actual test milestone.');record(W,'test-milestone','home','Duplicate.');assert.equal(W.story.filter(e=>e.text==='Duplicate.').length,0);
console.log('ok   paths regrow, rain washes scent, the dog learns familiarity and milestones are deduplicated');

const checkpoint=JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json',import.meta.url))),thoughts=JSON.parse(fs.readFileSync(new URL('../../data/v2/mind.json',import.meta.url)));
const oldWorld=load(checkpoint.blob,thoughts);assert(oldWorld.surface&&oldWorld.traces&&oldWorld.scent&&oldWorld.story);
for(let n=0;n<400;n++)step(oldWorld);const restored=load(save(oldWorld),thoughts);
for(let n=0;n<600;n++){step(oldWorld);step(restored);}
assert.equal(save(oldWorld),save(restored));assert(oldWorld.man.B.alive);
console.log('ok   production checkpoint loads; all new state and future life replay identically');

const poleActions=relevant(['poles']);assert(poleActions.includes('get_poles'));assert(!poleActions.includes('haftAxe')&&!poleActions.includes('repairHome'));
const simpleGoal={vars:['fed'],want:S=>S.fed},limited={...ACTIONS.eatRaw,find:()=>({x:null})};
const simplePlan=plan(W,M,{...simpleGoal,acts:{testMeal:limited},exclude:Object.keys(ACTIONS)},{fed:0,raw:900});
assert.equal(simplePlan[0].a,'testMeal');
console.log('ok   consuming poles is not mistaken for obtaining poles; a feasible meal remains available to the planner');
