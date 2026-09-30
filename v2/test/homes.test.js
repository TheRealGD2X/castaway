import assert from 'node:assert/strict';
import {createWorld,save,load} from '../src/sim/world.js';
import {SEED,BORN} from '../src/config.js';
import {FAMILIES,place,propsOf,work,shelterAt} from '../src/build/build.js';
import {panelGeometry,installed,reclaimPart,startRepair,finishRepair} from '../src/build/assembly.js';
const W=createWorld(SEED,BORN),near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
for(const k of ['leanto','debrisHut','roundhouse','bedding']){
  const stages=FAMILIES[k].make({cover:'bracken',bedMat:'boughs'}),s=place(W,{k,x:60.5,y:42.5,dir:0,stages});
  for(let n=0;n<stages.length;n++){
    Object.assign(s.onsite,stages[n].need);work(W,s,.43);
    for(const m in stages[n].need)near((installed(s,n)[m]||0)+(s.onsite[m]||0),stages[n].need[m]);
    assert.equal(save(load(save(W))),save(W));work(W,s,.57);
  }
  for(const m of Object.keys(s.have))near(s.have[m],stages.reduce((v,st)=>v+(st.need[m]||0),0));
  const p=propsOf(s);assert(p.bed>.8);if(k!=='bedding')assert(p.rain>.85);
  const dry=p.bedR;s.saturation=1;assert(propsOf(s).bedR<dry*.3);s.saturation=0;
  const cloned=JSON.parse(JSON.stringify(s));cloned.k='unlabelled';assert.deepEqual(propsOf(cloned),p);
  const roof=s.assembly.parts.find(p=>p.kind==='panel'&&panelGeometry(p).z>.35&&panelGeometry(p).normal>.1)||s.assembly.parts.find(p=>p.kind==='panel');
  const before=propsOf(s),metric=k==='bedding'?'bed':'rain';reclaimPart(s,roof.id);assert(propsOf(s)[metric]<before[metric]);
  const inv={[roof.mat]:100},r=startRepair(s,roof.id,inv);assert(r);r.progress=12+roof.amount*6;assert(finishRepair(s,roof.id,inv));
  near(propsOf(s)[metric],before[metric]);
}
const old=JSON.parse(save(W));for(const s of old.structs)delete s.assembly;
const migrated=load(JSON.stringify(old));assert(migrated.structs.every(s=>s.assembly));
for(const s of migrated.structs)for(let n=0;n<s.stages.length;n++)for(const m in s.stages[n].need)near(installed(s,n)[m],s.stages[n].need[m]);
console.log('ok   home parts conserve original budgets, migrate, replay, lose protection when removed, recover after paid repairs, and insulate less when wet');
