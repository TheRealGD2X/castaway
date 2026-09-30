import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,step,save,load} from '../src/sim/world.js';
import {hydroTen,waterVolume,takeWater,availableWater} from '../src/sim/hydro.js';
import {FAMILIES,place,propsOf} from '../src/build/build.js';
import {ACTIONS} from '../src/mind/actions.js';
import {SEED,BORN} from '../src/config.js';
import {T} from '../src/world/gen.js';
import {fishTen} from '../src/sim/fish.js';

const W=createWorld(SEED,BORN),h=W.hydro;
const total=()=>waterVolume(W)+h.evap+h.sea+h.used-h.rain;
const initial=total();
for(const [temp,rain,sun] of [[15,6,0],[20,0,600],[-6,4,0],[8,0,350]]){
 W.wx={...W.wx,temp,rain,sun,hum:.8,wind:7};W.surface.temp=temp;
 for(let n=0;n<144;n++)hydroTen(W);
 assert(Math.abs(total()-initial)<1e-7,'rain, runoff, freezing and evaporation must conserve water');
 for(const a of [h.soil,h.pool,h.ice])for(const v of a)assert(Number.isFinite(v)&&v>=0);
 assert(h.lake>=0&&h.stream>=0&&h.ground>=0);
 if(temp<0)assert(h.snow>0&&h.freshIce>0);
}
assert(h.flow>0&&h.sea>0&&h.oxygen>0&&h.oxygen<14);
console.log('ok   rainfall, dry weather, snow, freeze and thaw conserve physical water');

const i=W.hydroMap.land.find(i=>W.ter[i]===T.GRASS&&!W.treeAt[i]),x=i%W.MW+.5,y=Math.floor(i/W.MW)+.5;
const stages=FAMILIES.rainCollector.make({}),basin=place(W,{k:'rainCollector',x,y,dir:0,stages});
W.wx={...W.wx,temp:12,rain:12,sun:0};W.surface.temp=12;
hydroTen(W);assert.equal(basin.waterL||0,0,'an unbuilt basin cannot collect water');
basin.stage=stages.length;basin.props=propsOf(basin);
for(let n=0;n<20;n++)hydroTen(W);
assert(basin.waterL>1&&basin.waterL<=basin.props.capacity);
assert(Math.abs(total()-initial)<1e-7,'capture, leakage and overflow conserve water');
const M=W.man;M.x=x;M.y=y;M.path=null;M.B.waterDef=1;
const target=ACTIONS.drinkCollected.find(W,M);assert(target);
const before=basin.waterL;let st={};
for(let n=0;n<15;n++){if(ACTIONS.drinkCollected.exec(W,M,target,st)==='done')break;}
assert(basin.waterL<before&&M.B.waterDef<1);assert(Math.abs(total()-initial)<1e-7);
basin.waterL=0;assert.equal(ACTIONS.drinkCollected.find(W,M),null);
console.log('ok   construction enables finite rain collection and real drinking; empty basins provide none');

const a=load(save(W)),b=load(save(W));
const ds=FAMILIES.drainage.make({}),drain=place(b,{k:'drainage',x,y,dir:0,stages:ds});drain.stage=ds.length;drain.props=propsOf(drain);
a.hydro.pool[i]=b.hydro.pool[i]=.06;a.wx.rain=b.wx.rain=0;
for(let n=0;n<12;n++){hydroTen(a);hydroTen(b);}
assert(b.hydro.pool[i]<a.hydro.pool[i],'a finished drain reduces standing water');
console.log('ok   installed drainage changes water movement rather than inventing dry ground');

const stream=W.stream[0],available=availableWater(W,stream),used=h.used,massBeforeExtraction=total();
assert.equal(takeWater(W,stream,available+100),available);assert.equal(availableWater(W,stream),0);assert.equal(takeWater(W,stream,1),0);
assert(Math.abs(h.used-used-available/1000)<1e-12);
assert(Math.abs(total()-massBeforeExtraction)<1e-7);
console.log('ok   water extraction cannot take more than exists');
M.inv.line=1;M.known[stream]=1;M.x=stream%W.MW+.5;M.y=Math.floor(stream/W.MW)+.5;M.path=null;
st={};let fishing;for(let n=0;n<10;n++){fishing=ACTIONS.lineFish.exec(W,M,{tile:stream,x:M.x,y:M.y},st);if(fishing==='fail')break;}
assert.equal(fishing,'fail','a dry watercourse cannot provide line fishing');
const healthy=load(save(W)),poor=load(save(W));healthy.hydro.streamDepth=.12;healthy.hydro.oxygen=9;poor.hydro.streamDepth=.02;poor.hydro.oxygen=3;
for(let n=0;n<120;n++){fishTen(healthy);fishTen(poor);}assert(poor.fish.stream<healthy.fish.stream);
console.log('ok   dry water cannot be fished; shallow, low-oxygen habitat supports fewer fish');

const fixture=createWorld(SEED,BORN);fixture.wx={...fixture.wx,rain:0,sun:0,temp:12,wind:2};fixture.surface.temp=12;
const bank=fixture.hydroMap.land.find(i=>fixture.hydroMap.down[i]>=0);fixture.hydro.pool[bank]=.5;
const originalLitter=Array.from(fixture.litter).reduce((s,v)=>s+v,0);
for(let n=0;n<500;n++)hydroTen(fixture);
const remaining=Array.from(fixture.litter).reduce((s,v)=>s+v,0)+fixture.hydro.debris.reduce((s,q)=>s+q.kg,0)+fixture.hydro.debrisOut;
assert(Math.abs(remaining-originalLitter)<.001,'drifting litter comes from real bank material');
console.log('ok   drifting debris consumes bank litter and records material carried out to sea');

const cp=JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json',import.meta.url))),thoughts=JSON.parse(fs.readFileSync(new URL('../../data/v2/mind.json',import.meta.url)));
const old=JSON.parse(cp.blob);delete old.hydro;const legacy=load(JSON.stringify(old),thoughts);assert(legacy.hydro.pool.length===legacy.ter.length);
for(let n=0;n<200;n++)step(legacy);const restored=load(save(legacy),thoughts);assert.equal(save(restored),save(legacy));
for(let n=0;n<1440;n++){step(legacy);step(restored);}assert.equal(save(restored),save(legacy));
console.log('ok   old checkpoints gain defaults; water, debris, RNG and life replay identically');
