import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld, save, load, step } from '../src/sim/world.js';
import { SEED, BORN } from '../src/config.js';
import { propose, TARGETS } from '../src/build/designer.js';
import { analyse, assemblyProps, assemblyStep, installed, reclaimPart, startRepair, finishRepair, projectedOverlap } from '../src/build/assembly.js';
import { place, work, propsOf, stillNeeds, FAMILIES } from '../src/build/build.js';
import { ACTIONS, camp, buildExec } from '../src/mind/actions.js';
import { projects, plan } from '../src/mind/brain.js';
import { heritageTen, campSnapshot } from '../src/sim/heritage.js';
import { hydroTen, waterVolume } from '../src/sim/hydro.js';
const W=createWorld(SEED,BORN),M=W.man,b={skill:1,cover:'reeds',knows:{reeds:true}};
const copy=x=>JSON.parse(JSON.stringify(x)),near=(a,b)=>assert(Math.abs(a-b)<.000001,`${a} !== ${b}`);
const make=need=>{const a=propose(need,b,W.wx),stages=a.stages;delete a.stages;return place(W,{k:'invention',x:60.5,y:42.5,dir:0,stages,assembly:a});};
const full=need=>{const s=make(need);s.stage=s.stages.length;s.props=propsOf(s);return s;};
for(const need of Object.values(TARGETS)){const s=full(need);assert(Object.entries(need).every(([k,v])=>s.props[k]>=v*.8));}
const combo=full({bench:.8,drying:.8,capacity:12,catchArea:.9});assert(combo.props.bench>.7&&combo.props.drying>.7&&combo.props.capacity>12&&combo.props.catchArea>.9);
const renamed=copy(combo);renamed.k='anything';renamed.label='a magical object';assert.deepEqual(propsOf(renamed),combo.props);
console.log('ok   one grammar yields containers, surfaces, roofs, rails and useful combined designs; labels grant no abilities');

// A controlled materials/knowledge fixture exercises proposal -> planning -> real minute-by-minute work.
const workshop=createWorld(SEED,BORN),maker=workshop.man;maker.known.fill(1);maker.skill.build=1;
for(const e of workshop.ents)maker.mem['e'+e.id]={k:e.k,x:e.x,y:e.y,n:e.n,deadKg:e.deadKg};
const c=camp(workshop,maker).tile;workshop.camp=c;const home=place(workshop,{k:'leanto',x:c%workshop.MW+.5,y:Math.floor(c/workshop.MW)+.5,dir:0,stages:FAMILIES.leanto.make({cover:'bracken',bedMat:'boughs'})});home.stage=home.stages.length;home.props=propsOf(home);
const proposal=projects(workshop,maker,500).find(q=>q.d?.k==='invention');assert(proposal?.v>10);const d=proposal.d;assert(d.assembly.wanted.bench&&d.assembly.wanted.capacity);
maker.x=d.x;maker.y=d.y;maker.path=null;maker.inv={...maker.inv,poles:30,withies:30,mud:30,stones:30,reeds:30,bracken:30,flake:1};
for(const st of d.stages)for(const [m,q]of Object.entries(st.need))maker.inv[m]=(maker.inv[m]||0)+q;
const buildTarget={d,x:d.x,y:d.y,tile:d.tile},first=d.stages[0],mats=Object.keys(first.need),goal={vars:['stageDone'],want:S=>S.stageDone,acts:{build_invention:{r:[...mats,'stageDone'],w:['stageDone',...mats],provides:['stageDone'],find:()=>buildTarget,pre:S=>!S.stageDone&&mats.every(m=>S[m]>=first.need[m]),eff:S=>{S.stageDone=1;for(const m of mats)S[m]-=first.need[m];},cost:()=>first.mins}}};
assert.equal(plan(workshop,maker,goal,{...maker.inv,stageDone:0})[0].a,'build_invention');const invention=place(workshop,d);
for(let stage=0;stage<invention.stages.length;stage++){let st={};for(let n=0;n<250&&invention.stage===stage;n++){workshop.t++;assert.notEqual(buildExec(workshop,maker,{sid:invention.id,x:d.x,y:d.y,tile:d.tile},st),'fail');}assert.equal(invention.stage,stage+1);}
assert(invention.props.bench>.7&&invention.props.capacity>12&&invention.props.drying>.7);
console.log('ok   ordinary proposals and best-first planning construct a combined invention from actual supplied materials');

const roof=combo.assembly.parts.find(p=>p.kind==='panel'&&p.mat==='reeds'),wrong=copy(combo),wrongRoof=wrong.assembly.parts.find(p=>p.id===roof.id);
for(const p of wrongRoof.points)p[0]+=5;assert(propsOf(wrong).dry<.01&&propsOf(wrong).catchArea<combo.props.catchArea*.5);
near(projectedOverlap([[0,0,0],[1,0,0],[1,1,0],[0,1,0]],[[.5,0,0],[1.5,0,0],[1.5,1,0],[.5,1,0]]),.5);
const unsupported=copy(combo);for(const p of unsupported.assembly.parts)if(p.kind==='bar'||p.kind==='joint')p.removed=true;assert.equal(propsOf(unsupported).bench,0);assert.equal(propsOf(unsupported).dry,0);
const tipped=copy(combo);tipped.contactLoad=1000;tipped.assembly.loadAt=[4,0];assert.equal(propsOf(tipped).stable,0);assert.equal(propsOf(tipped).bench,0);
const broken=copy(combo);for(const p of broken.assembly.parts)if(p.kind==='joint')p.condition=.001;assert(propsOf(broken).maxLoadKg<combo.props.maxLoadKg*.2);
const cracked=copy(combo);cracked.assembly.parts.find(p=>p.kind==='shell').condition=.3;assert(propsOf(cracked).leakL>combo.props.leakL*100);
console.log('ok   actual overlap, support paths, centre of mass, bindings and clay cracks change physical functions');

const building=make({bench:.9});assert.equal(work(W,building,.5),false);assert.equal(building.prog,0);
for(let stage=0;stage<building.stages.length;stage++){
  const st=building.stages[stage];Object.assign(building.onsite,st.need);work(W,building,.37);
  const use=installed(building,stage);for(const m in st.need)near((use[m]||0)+(building.onsite[m]||0),st.need[m]);assert.deepEqual(stillNeeds(building,st),{});
  let restored=load(save(W));const s=restored.structs.find(s=>s.id===building.id);assert.deepEqual(s,building);
  work(W,building,.63);assert.equal(building.stage,stage+1);
}
const budget={};for(const st of building.stages)for(const m in st.need)budget[m]=(budget[m]||0)+st.need[m];for(const m in budget)near(building.have[m],budget[m]);
console.log('ok   empty sites cannot construct; partial installations conserve materials and survive interruption and save/load');

const p=building.assembly.parts.find(p=>p.kind==='bar');p.condition=.5;const input={poles:10},old=input.poles,recover=p.amount*.5*.85,repair=startRepair(building,p.id,input);
assert(repair);assert.equal(startRepair(building,p.id,input),repair);assert.equal(input.poles,old-repair.amount);
const beforeHave=building.have.poles,offcuts=building.onsite.poles||0;assert(!finishRepair(building,p.id,input));repair.progress=12+p.amount*6;assert(finishRepair(building,p.id,input));near(input.poles,old-repair.amount+recover);near(building.have.poles,beforeHave+p.amount);near(building.onsite.poles,offcuts+repair.amount-p.amount);assert.equal(p.condition,1);assert(!finishRepair(building,p.id,input));
const reclaimed=reclaimPart(building,p.id);assert(reclaimed.amount<=p.amount);assert.equal(reclaimPart(building,p.id),null);assert(building.discarded.poles>=0);
const replacement=startRepair(building,p.id,input);assert(replacement);replacement.progress=12+p.amount*6;assert(finishRepair(building,p.id,input));assert(!p.removed&&p.condition===1);
console.log('ok   replacements require actual materials, keep offcuts and recover only a fraction of the old part; repeated salvage gives nothing');

M.x=combo.x;M.y=combo.y;M.B.alive=true;W.wx={...W.wx,rain:8,gust:100,temp:6,sun:0};W.surface.snow=10;
const rng=W.rng.save();assemblyStep(W,combo);assemblyStep(W,combo);assert(combo.integrity<1);assert(Object.values(M.materialBeliefs).some(q=>q.observations>0));assert.deepEqual(W.rng.save(),rng);
const observer=copy(M.materialBeliefs),far=full({bench:.9});far.x=10;far.y=10;assemblyStep(W,far);assert.deepEqual(M.materialBeliefs,observer);
const calm=full({bench:.9});W.wx.gust=0;W.wx.rain=0;W.surface.snow=0;for(let k=0;k<100;k++)assemblyStep(W,calm);assert.equal(calm.integrity,1);
const cautious=propose({bench:.9},{...b,beliefs:{poles:{upper:.25}}},W.wx),ordinary=propose({bench:.9},b,W.wx);assert(cautious.parts.filter(p=>p.mat==='poles').reduce((v,p)=>v+p.amount,0)>=ordinary.parts.filter(p=>p.mat==='poles').reduce((v,p)=>v+p.amount,0));
assert.deepEqual(propose({bench:.9},{...b,beliefs:{mud:{upper:.25}}},W.wx),ordinary);
console.log('ok   overload and weather strain real components; local observation informs design; mechanics use no random draws');

const tank=full({capacity:12,catchArea:1.1});tank.waterL=10;W.wx.rain=0;W.wx.temp=0;W.wx.sun=0;W.surface.temp=0;const total=()=>waterVolume(W)+W.hydro.evap+W.hydro.sea+W.hydro.used-W.hydro.rain,volumes=total(),water=tank.waterL;
hydroTen(W);assert(tank.waterL<water);near(total(),volumes);
tank.props=propsOf(tank);tank.waterL=3;M.x=tank.x;M.y=tank.y;M.path=null;M.B.waterDef=1;const target=ACTIONS.drinkCollected.find(W,M);assert(target);let state={};for(let k=0;k<8;k++)ACTIONS.drinkCollected.exec(W,M,target,state);assert(tank.waterL<3);
W.camp=Math.floor(combo.y)*W.MW+Math.floor(combo.x);const picture=campSnapshot(W).find(s=>s.label===combo.label),savedCondition=picture.assembly.parts[0].condition;combo.assembly.parts[0].condition=0;assert.equal(picture.assembly.parts[0].condition,savedCondition);
console.log('ok   invented basins supply finite water and leak into the island; journal pictures preserve historical parts');
const filled=full({capacity:12,catchArea:1.1});filled.waterL=8;const balance=total(),lining=filled.assembly.parts.find(p=>p.kind==='shell');reclaimPart(filled,lining.id);assert.equal(filled.props.capacity,0);hydroTen(W);assert.equal(filled.waterL,0);near(total(),balance);
console.log('ok   dismantling a filled basin spills its water into the island and conserves the total');

const oldWorld=createWorld(SEED,BORN),stages=FAMILIES.workbench.make({}),legacy={id:oldWorld.nextId++,k:'workbench',x:60,y:42,dir:0,stages,stage:1,prog:.5,have:{poles:3},onsite:{poles:4,withies:3}};
oldWorld.structs=[legacy];const migrated=load(save(oldWorld)),ms=migrated.structs[0];assert(ms.assembly);for(const m of ['poles','withies'])near(ms.have[m]+ms.onsite[m],(legacy.have[m]||0)+(legacy.onsite[m]||0));assert.equal(save(load(save(migrated))),save(migrated));
const cp=JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json',import.meta.url))),thoughts=JSON.parse(fs.readFileSync(new URL('../../data/v2/mind.json',import.meta.url))),life=load(cp.blob,thoughts);
for(let k=0;k<1440;k++)step(life);const replay=load(save(life),thoughts);for(let k=0;k<1440;k++){step(life);step(replay);}assert.equal(save(life),save(replay));assert(life.man.B.alive);
console.log('ok   legacy constructions migrate without inventing materials; production future replays identically with Tomas alive');
