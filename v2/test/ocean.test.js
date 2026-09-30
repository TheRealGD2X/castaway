import assert from 'node:assert/strict';
import fs from 'node:fs';
import {T} from '../src/world/gen.js';
import {newGrid,circulation,mixLayers,horizontalMix,totals,TRACERS,temperature,salinity,RHO,CP,gridSave,gridLoad} from '../src/sim/ocean-grid.js';
import {wavesInit,wavesStep,waveEnergy,dispersion,waveCache,phaseAt,OMEGA,phaseGradients} from '../src/sim/ocean-waves.js';
import {marineInit,ecologyStep,carbon,nitrogen} from '../src/sim/ocean-ecology.js';
import {createWorld,step,save,load} from '../src/sim/world.js';
import {SEED,BORN} from '../src/config.js';
import {coastal,oceanTen,oceanSample,driftObject} from '../src/sim/ocean.js';
import {waterVolume,freshwaterSalt,hydroTen,takeCollectedWater} from '../src/sim/hydro.js';
import {oceanSurface,oceanPoint} from '../src/render/ocean-surface.js';
import {heritageTen} from '../src/sim/heritage.js';
import {acousticState} from '../src/render/sound-state.js';
const near=(a,b,tol=1e-8)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`),calm=()=>({u:0,v:0,pressure:101325,sun:0,temp:12,hum:.8}),boundary=()=>null;
const lake=newGrid(12,8,20,20,Array.from({length:96},(_,i)=>-1-(i%12)*.2));lake.closed=true;const baseline=totals(lake);
for(let t=0;t<20;t++)circulation(lake,600,boundary,calm);
for(const v of lake.eta)near(v,0,1e-9);for(const v of lake.u)near(v,0,1e-9);for(const k of ['water',...TRACERS])near(totals(lake)[k],baseline[k],1e-10);
console.log('ok   still water stays at rest over variable bathymetry');
for(let i=0;i<lake.n;i++){lake.u[i]=.3;lake.v[i]=-.1;lake.salt[i]*=i%3===0?1.2:.9;}
const flowing=totals(lake);for(let t=0;t<20;t++){circulation(lake,30,boundary,calm);mixLayers(lake,30,calm);}
for(const k of ['water',...TRACERS]){near(totals(lake)[k],flowing[k],1e-9);assert(lake[k==='water'?'volume':k].every(v=>Number.isFinite(v)&&v>=-1e-7));}
console.log('ok   circulation and vertical mixing conserve water, salt, heat and all tracers');
const parent=newGrid(2,2,1000,1000,[-100,-100,-100,-100],null,12,[.05,.15,.8]),child=newGrid(8,6,20,20,Array(48).fill(-2),null,12,[.4,.3,.3]);const total=k=>totals(parent)[k]+totals(child)[k],start=Object.fromEntries(['water',...TRACERS].map(k=>[k,total(k)]));parent.eta.fill(.2);
for(let t=0;t<10;t++)circulation(child,60,()=>({grid:parent,index:0,eta:parent.eta[0]}),calm);
for(const k of ['water',...TRACERS])near(total(k),start[k],1e-9);for(let i=0;i<parent.n;i++)near(salinity(parent,i),35,1e-8);for(let i=0;i<child.n;i++)near(salinity(child,i),35,1e-8);
console.log('ok   nested exchanges map vertical layers without creating water, salt or heat');
for(const period of [6,10,16])for(const depth of [.1,1,10,1000]){const d=dispersion(period,depth),kh=d.k*depth,e=Math.exp(-2*kh),tanh=(1-e)/(1+e);near(9.81*d.k*tanh,d.omega*d.omega,1e-9);assert(d.cg>0&&d.cg<=d.cp*1.00001);}
const shallow=dispersion(10,.1);near(shallow.cp,Math.sqrt(9.81*.1),.01);const deep=dispersion(10,1000);near(deep.cg,deep.cp/2,1e-8);
console.log('ok   dispersion satisfies omega² = g k tanh(k depth), including shallow/deep limits');
function packet(dt){const g=newGrid(80,1,100,100,Array(80).fill(-100));wavesInit(g);g.action[8*g.n+10]=1e6;const initial=waveEnergy(g);for(let t=0;t<300;t+=dt){g.u.fill(0);g.v.fill(0);wavesStep(g,dt,()=>({action:Array(24).fill(0)}),calm,SEED);}const E=waveEnergy(g),L=g.waveLedger;near(E+L.bottomJ+L.whitecapJ+L.breakingJ+L.currentJ-L.boundaryJ-L.windJ,initial,1e-9);let mean=0,mass=0;for(let i=0;i<g.n;i++){const A=g.action[8*g.n+i];mass+=A;mean+=A*(i+.5)*100;}return{mean:mean/mass,g};}
const coarse=packet(60),fine=packet(30),expected=1050+dispersion(10,100).cg*300;near(fine.mean,expected,.01);assert(Math.abs(fine.mean-expected)<=Math.abs(coarse.mean-expected)+.01);
const c=waveCache(fine.g),p=8* fine.g.n;near((c.travel[p+30]-c.travel[p+20])/1000,1/dispersion(10,100).cp,1e-8);near(phaseAt(fine.g,8,20,2050,50,301,SEED)-phaseAt(fine.g,8,20,2050,50,300,SEED),-OMEGA[1],1e-8);
console.log('ok   wave packets propagate at group velocity; phase propagates at phase velocity and energy closes');
const bio=newGrid(6,4,20,20,Array(24).fill(-5));marineInit(bio);const C=carbon(bio),N=nitrogen(bio);for(let t=0;t<100;t++)ecologyStep(bio,600,()=>({...calm(),sun:400}));near(carbon(bio)-bio.ledger['air:carbon'],C,1e-9);near(nitrogen(bio),N,1e-9);for(const k of TRACERS)assert(bio[k].every(v=>v>=-1e-10&&Number.isFinite(v)));
console.log('ok   marine production, feeding, maturation and decomposition close carbon and nitrogen budgets');
const W=createWorld(SEED,BORN),before=save(W);const field=oceanSurface(W,0),audio=acousticState(W,{cam:{x:W.cx*16,y:W.cy*16}});assert(field.height.every(Number.isFinite));assert.equal(save(W),before);assert(Number.isFinite(audio.sea));
const cp=JSON.parse(fs.readFileSync(new URL('../../data/v2/checkpoint.json',import.meta.url))),old=load(cp.blob);assert(old.ocean&&old.hydro.saltPool);for(let i=0;i<40;i++)step(old);const saved=save(old),restored=load(saved);assert.equal(save(restored),saved);assert.deepEqual(oceanSurface(old,old.t*60).height,oceanSurface(restored,restored.t*60).height);for(let i=0;i<40;i++){step(old);step(restored);}assert.equal(save(old),save(restored));
console.log('ok   old checkpoints migrate; ocean state, wave phase and the coupled future replay exactly');
const saltWorld=createWorld(SEED,BORN,{man:false});saltWorld.hydro.saltSoil[saltWorld.hydroMap.land[0]]=1;saltWorld.hydro.saltPool[saltWorld.hydroMap.land[1]]=2;const saltStart=freshwaterSalt(saltWorld);hydroTen(saltWorld);near(freshwaterSalt(saltWorld),saltStart,1e-9);
console.log('ok   freshwater circulation transports finite salt; evaporation leaves salt behind');
const drift=createWorld(SEED,BORN,{man:false});for(const g of drift.ocean.grids){g.u.fill(.1);g.v.fill(0);g.action.fill(0);}drift.wx.u=drift.wx.v=0;const obj={x:-20,y:0},startX=obj.x;assert(!driftObject(drift,obj,60,0));near(obj.x-startX,3,1e-9);
console.log('ok   floating objects follow the solved current with swept shoreline contact');
const rough=newGrid(8,6,120000,120000,Array.from({length:48},(_,i)=>-1200-1800*((i*931)%1000)/1000));rough.u.fill(.1);
const sameWater=()=>({eta:0,pressure:101325,salt:Array(3).fill(RHO*.035),heat:[12,10.5,9].map(T=>RHO*CP*T)});
for(let i=0;i<1440;i++)circulation(rough,600,sameWater,calm);
assert(Math.max(...rough.u.map(Math.abs),...rough.v.map(Math.abs))<.5);assert(Math.max(...rough.eta.map(Math.abs))<2);
console.log('ok   uneven seabed and open boundaries do not generate runaway currents');
const mixed=newGrid(2,1,8,8,[-.2,-4]);wavesInit(mixed);mixed.breaking[0]=20000;for(const k of TRACERS)mixed[k][0]*=2;const mixedStart=totals(mixed);horizontalMix(mixed,600);for(const k of TRACERS){near(totals(mixed)[k],mixedStart[k],1e-10);assert(mixed[k].every(v=>v>=0));}
console.log('ok   surf mixing conserves all finite inventories across shallow and deep water');
const phaseGrid=newGrid(12,12,8,8,Array(144).fill(-5));wavesInit(phaseGrid);wavesStep(phaseGrid,30,()=>({action:Array(24).fill(0)}),calm,SEED);const phaseBefore=phaseAt(phaseGrid,9,65,44,44,60,SEED);phaseGrid.volume.fill(0);const phaseCopy=gridLoad(gridSave(phaseGrid));near(phaseAt(phaseCopy,9,65,44,44,60,SEED),phaseBefore,1e-12);
console.log('ok   saved wave phase survives subsequent wetting and drying');
const basinWorld=createWorld(SEED,BORN,{man:false}),tile=basinWorld.hydroMap.land.find(i=>basinWorld.ter[i]!==T.ROCK);
const basin={id:basinWorld.nextId++,x:tile%basinWorld.MW+.5,y:Math.floor(tile/basinWorld.MW)+.5,earthwork:{width:1,length:1},props:{retention:true,capacity:1000,catchArea:4,earthArea:4,channelDepth:.2,leakL:.1},waterL:100,saltKg:1};basinWorld.structs.push(basin);basinWorld.hydro.pool[tile]=.2;basinWorld.hydro.saltPool[tile]=2;const basinSalt=freshwaterSalt(basinWorld);hydroTen(basinWorld);takeCollectedWater(basinWorld,basin,10);near(freshwaterSalt(basinWorld),basinSalt,1e-9);assert(basinWorld.hydro.lastTakenSalt>0);
console.log('ok   retention basins, leaks and drinking transfer salt without duplicating it');
const cached=load(cp.blob),structure=cached.structs.find(s=>s.assembly);cached.man.B.alive=false;
cached.man.projCache={t:cached.t,sig:'replay fixture',list:[{s:structure,v:1}]};
const cachedSave=save(cached),cachedCopy=load(cachedSave);assert.equal(save(cachedCopy),cachedSave);assert.equal(cachedCopy.man.projCache.list[0].s,cachedCopy.structs.find(s=>s.id===structure.id));
for(let i=0;i<20;i++){step(cached);step(cachedCopy);}assert.equal(save(cached),save(cachedCopy));
console.log('ok   cached structures keep their physical references after death and reload');
const packetWorld=createWorld(SEED,BORN,{man:false}),wood={id:packetWorld.nextId++,k:'branch',x:-1,y:0,kg:2,len:2,moist:.5};packetWorld.items.push(wood);heritageTen(packetWorld);
assert(!packetWorld.items.includes(wood));assert.equal(packetWorld.ocean.drifters.length,1);assert.equal(packetWorld.ocean.drifters[0].kg,2);assert.equal(packetWorld.ocean.driftInput,2);
console.log('ok   wood leaving the island continues as a finite marine drifter');
const renderBefore=save(old),outsidePoint=oceanPoint(old,-100,0);assert.equal(outsidePoint.g,old.ocean.grids[1]);
const viewport=oceanSurface(old,old.t*60,{x:-150,y:0,width:50,height:50});assert.equal(viewport.spacing,1);assert(viewport.height.every(Number.isFinite));assert(viewport.normalX.every(Number.isFinite));assert.equal(save(old),renderBefore);
console.log('ok   fine viewport waves and offshore rendering are read-only and finite');
