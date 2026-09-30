import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,step,save,load} from '../src/sim/world.js';
import {SEED,BORN} from '../src/config.js';
import {foodwebTen,webMass,graze,harvestFish,harvestShell} from '../src/sim/foodweb.js';
import {ensureAnimal,animalMinute,burrowMinute,organicAnimalMass,ingest,carcass,canBreed} from '../src/sim/animal-body.js';
import {animalsDay,animalsStep} from '../src/sim/animals.js';
import {atmosphereStep,atmosphericWater,localWater,atmosphericEnergy,localEnergy,transport,transportOpen,returnEvaporation,saturation} from '../src/sim/atmosphere.js';
import {climateAt,sunAt} from '../src/sim/env.js';
import {visible,memoryConfidence,sensoryStep,odourStep} from '../src/sim/senses.js';
import {contactWork} from '../src/sim/contact.js';
import {walkable,findPath} from '../src/mind/path.js';
import {walk,look} from '../src/sim/man.js';
import {T} from '../src/world/gen.js';
import {ACTIONS} from '../src/mind/actions.js';
import {waterVolume} from '../src/sim/hydro.js';
import {acousticState} from '../src/render/sound-state.js';
import {AcousticField} from '../src/render/sound-field.js';
import {place,propsOf,FAMILIES} from '../src/build/build.js';
const near=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<tol,`${a} != ${b}`);
const W=createWorld(SEED,BORN,{man:false}),f=W.foodweb;
const budget=()=>webMass(W)+f.respired+f.harvested+f.exported+f.grazed-f.assimilated-f.imported;
const initial=budget();W.wx={...W.wx,sun:500,temp:15,tide:1};for(let i=0;i<144;i++)foodwebTen(W);near(budget(),initial,1e-6);
const bed=W.shore[0];harvestShell(W,bed,Math.max(0,bed.kg/2));harvestFish(W,'lake',2);near(budget(),initial,1e-6);
const bare=createWorld(SEED,BORN,{man:false});bare.wx.sun=0;bare.foodweb.prey={stream:0,lake:0};bare.foodweb.plankton=0;bare.foodweb.area.sea=0;const fish=bare.fish.lake,shell=bare.shore[0].kg;foodwebTen(bare);assert(bare.fish.lake<fish);near(bare.shore[0].kg,shell);
console.log('ok   the food web closes its organic mass budget; feeding, harvest and respiration need real stocks');
const A=createWorld(SEED,BORN,{man:false}),a=A.animals.find(a=>a.sp==='rabbit');a.under=0;a.act='graze';a.E=.1;const tile=A.hydroMap.land.find(i=>A.ter[i]===T.GRASS);a.x=a.px=tile%A.MW+.5;a.y=a.py=Math.floor(tile/A.MW)+.5;ensureAnimal(a);
const combined=()=>webMass(A)+A.animals.reduce((v,q)=>v+organicAnimalMass(q),0)+A.foodweb.respired+A.foodweb.animalRespired+A.foodweb.harvested-A.foodweb.assimilated-A.foodweb.imported+A.foodweb.exported;
const total=combined(),grass=A.foodweb.grass[tile],reserve=a.body.reserve;for(let i=0;i<120;i++)animalMinute(A,a);assert(A.foodweb.grass[tile]<grass);assert(a.body.gut>0);near(combined(),total,1e-6);assert(a.body.ageDays>200);assert(a.body.metabolicKcal>0);
const meat=carcass(A,a);A.foodweb.harvested+=meat/4000;near(combined(),total,1e-6);assert(meat>0&&a.dead);
const b=A.animals.find(q=>q.sp==='rabbit'&&!q.dead);b.body.reserve=0;assert(!canBreed(b));
console.log('ok   animal digestion, maintenance, grazing and carcasses transfer actual mass and energy');
const thirsty=createWorld(SEED,BORN,{man:false}),r=thirsty.animals.find(a=>a.sp==='rabbit');thirsty.animals=[r];thirsty.treeAt.fill(0);r.under=0;r.act='graze';r.body.waterDef=.15;
const rt=Math.floor(r.y)*thirsty.MW+Math.floor(r.x),pond=rt+2;thirsty.ter[rt]=thirsty.ter[rt+1]=thirsty.ter[pond]=T.GRASS;thirsty.block?.fill(0);thirsty.hydro.pool.fill(0);thirsty.hydro.pool[pond]=.001;
const waterBefore=thirsty.hydro.used;for(let n=0;n<5;n++){thirsty.t++;animalsStep(thirsty);}assert(thirsty.hydro.used>waterBefore);assert(r.body.waterDef<.15);
thirsty.hydro.pool.fill(0);r.body.waterDef=.001;r.thirst=.01;r.act='drink';thirsty.rng.f=()=>.99;thirsty.foodweb.grass[Math.floor(r.y)*thirsty.MW+Math.floor(r.x)]=.1;
const fedBefore=r.body.intakeKg;animalsStep(thirsty);assert.equal(r.act,'graze');assert(r.body.intakeKg>fedBefore);
assert(ACTIONS.eat.pre({food:85})&&ACTIONS.eatRaw.pre({raw:85}));assert(!ACTIONS.eat.pre({food:0}));
console.log('ok   thirsty rabbits seek visible water; hungry Tomas can eat a small remaining meal');
const R=createWorld(SEED,BORN,{man:false}),mother=R.animals.find(a=>a.sp==='rabbit'&&a.sex==='female');mother.body.reserve=.2;mother.pregnancy={due:R.t,dry:.03};mother.body.reserve-=.03;
const familyMass=R.animals.reduce((v,a)=>v+organicAnimalMass(a),0);animalsDay(R,270);near(R.animals.reduce((v,a)=>v+organicAnimalMass(a),0),familyMass);const kits=R.animals.filter(a=>a.mother===mother.id);assert.equal(kits.length,3);assert(kits.every(a=>a.body.ageDays===0&&a.body.mass<.1));
mother.under=1;const nursing=mother.body.reserve;animalMinute(R,kits[0]);assert(mother.body.reserve<nursing&&kits[0].body.gut>0);mother.under=0;const away=mother.body.reserve;animalMinute(R,kits[1]);assert.equal(mother.body.reserve,away);
for(let t=0;t<600;t++){for(const a of R.animals)if(!a.dead)animalMinute(R,a);burrowMinute(R);}
for(const w of R.warrens)near(3036*(w.climate.airT+273.15),w.climate.initialJ+w.climate.animalJ+w.climate.groundJ,1e-6);
console.log('ok   births transfer maternal mass, nursing requires physical presence and burrow heat closes its energy budget');
const C=createWorld(SEED,BORN,{man:false}),ca=C.atmosphere,base=atmosphericWater(C),local=localWater(C),energy=atmosphericEnergy(C),localE=localEnergy(C),c=climateAt(270),sun=sunAt(BORN);
for(let i=1;i<=600;i++){C.t=i;atmosphereStep(C,c,sun);near(atmosphericWater(C)+ca.precipitated-ca.evaporated,base,1e-8);near(localWater(C)+ca.local.precipitated+ca.local.exported-ca.local.imported-ca.local.evaporated,local,1e-5);for(const key of ['h','vapour','cloud'])assert(ca[key].every(v=>Number.isFinite(v)&&v>=0));}
near(atmosphericEnergy(C)-ca.heatExternal-ca.latentExternal,energy,.1);near(localEnergy(C)-ca.local.heatExternal-ca.local.latentExternal-ca.local.heatIn+ca.local.heatOut,localE,20);
returnEvaporation(C,.5);near(localWater(C)+ca.local.precipitated+ca.local.exported-ca.local.imported-ca.local.evaporated,local,1e-5);near(saturation(20),.0173,.0004);
const q=Float64Array.of(1,2,3,4),u=new Float64Array(4).fill(2),v=new Float64Array(4),advInitial=q.reduce((a,b)=>a+b,0);for(let n=0;n<100;n++)transport(q,u,v,2,2,10,10,1,null);near(q.reduce((a,b)=>a+b,0),advInitial,1e-12);assert(q.every(v=>v>=0));
const advect=dt=>{const x=Float64Array.of(0,0,1,0,0,0,0,0),u=new Float64Array(8).fill(1),v=new Float64Array(8);for(let t=0;t<1;t+=dt)transport(x,u,v,8,1,10,10,dt,null);return x;};const ref=advect(.005),err=x=>x.reduce((s,v,i)=>s+Math.abs(v-ref[i]),0);assert(err(advect(.25))<err(advect(.5)));
for(const sx of [-1,1])for(const sy of [-1,1]){const stock=Float64Array.of(1,2,3,4,2,1),u=Float64Array.of(1,2,3,1,3,2).map(q=>q*sx),v=Float64Array.of(3,2,1,2,1,3).map(q=>q*sy),total=stock.reduce((a,b)=>a+b,0);const flux=transportOpen([stock],u,v,3,2,5,5,600,[.2])[0];assert(stock.every(q=>q>=0));near(stock.reduce((a,b)=>a+b,0)+flux.exported-flux.imported,total,1e-10);}
const implicit=dt=>{const q=Float64Array.of(0,0,1,0,0,0,0,0),u=new Float64Array(8).fill(1),v=new Float64Array(8);for(let t=0;t<1-1e-9;t+=dt)transportOpen([q],u,v,8,1,10,10,dt,[0]);return q;};assert(err(implicit(.25))<err(implicit(.5)));
console.log('ok   atmospheric and local water budgets close; transport is positive, conservative and converges as steps shrink');
const S=createWorld(SEED,BORN),M=S.man;M.x=20.5;M.y=20.5;S.treeAt.fill(0);const target={x:25.5,y:20.5};assert(visible(S,M,target));for(let x=21;x<25;x++){const i=20*S.MW+x;S.treeAt[i]=1;S.grid[i]=[{leafKg:10}];}assert(!visible(S,M,target));assert(memoryConfidence({k:'dog',t:0},240)<memoryConfidence({k:'birch',t:0},240));
S.animals=[{id:1,sp:'dog',x:21,y:20.5,call:{t:S.t,energyJ:.03}}];sensoryStep(S,M);assert(M.senses.heard.length);assert.equal(M.senses.heard[0].x,undefined);assert.equal(M.senses.heard[0].bearing,0);
S.animals=[];for(let n=0;n<100;n++)odourStep(S);assert(S.odour.stock.every(q=>q===0));
S.treeAt.fill(0);S.t++;const house=place(S,{k:'roundhouse',x:23,y:20.5,dir:0,stages:FAMILIES.roundhouse.make({cover:'bracken',bedMat:'boughs'})});house.stage=house.stages.length;house.props=propsOf(house);assert(!visible(S,M,target));for(const p of house.assembly.parts)if(p.kind==='panel')p.removed=true;house.props=propsOf(house);assert(visible(S,M,target));
console.log('ok   foliage occludes sight, memories become uncertain and sound observations contain bearings without hidden identities');
const F=createWorld(SEED,BORN),FM=F.man,from=Math.floor(FM.y)*F.MW+Math.floor(FM.x),to=from+1;F.ter[to]=T.GRASS;F.hydro.pool[to]=4;assert(!walkable(F,to));FM.path=[from,to];const before=[FM.x,FM.y];walk(F,FM);assert(FM.movementFailed);assert.deepEqual([FM.x,FM.y],before);F.hydro.pool[to]=0;assert(walkable(F,to));
const knowledge=new Uint8Array(F.ter.length);knowledge[from]=1;const route=findPath(F,from,from+5,{observed:knowledge});F.ter[to]=T.SEA;F.hydro.pool[to]=40;assert.deepEqual(findPath(F,from,from+5,{observed:knowledge}),route);F.ter[to]=T.GRASS;F.hydro.pool[to]=0;
FM.B.fatigue=0;FM.met=3;FM.pose='weave';const rate=contactWork(F,FM,{}),contact=FM.workContact;near(contact.energyJ,contact.heatJ+contact.fractureJ);near(contact.energyJ,contact.forceN*contact.travelM*contact.strokes);near(contact.frequency*60,contact.strokes);assert(contact.energyJ<=2*85*.22*60);FM.B.fatigue=.95;assert(contactWork(F,FM,{})<rate);
const V={cam:{x:FM.x*16,y:FM.y*16}},snapshot=save(F),sound=acousticState(F,V);assert(sound.work>0);assert.equal(save(F),snapshot);FM.workContact.t--;assert.equal(acousticState(F,V).work,0);
const dsp=new AcousticField(48000,SEED);dsp.setState(sound);dsp.voice({gain:.01,pan:0,hz:240,duration:.3});for(let i=0;i<200;i++){const channels=[new Float32Array(128),new Float32Array(128)];dsp.render(channels);assert(channels.every(c=>c.every(v=>Number.isFinite(v)&&Math.abs(v)<=.55)));}
console.log('ok   flooding changes traversability; contact energy drives rate, animation and quiet audio without rendering mutations');
const cp=JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json',import.meta.url))),old=load(cp.blob);assert(old.foodweb&&old.atmosphere);for(let i=0;i<200;i++)step(old);const restored=load(save(old));near(waterVolume(old),waterVolume(restored));assert.equal(save(restored),save(old));for(let i=0;i<200;i++){step(old);step(restored);}assert.equal(save(restored),save(old));
console.log('ok   production checkpoints migrate; new ecology, weather, senses and contacts replay exactly');


