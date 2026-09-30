// Optional long coupled audit: node v2/test/ocean-audit.js [days=365] [seed].
import assert from 'node:assert/strict';
import {createWorld,step,save,load} from '../src/sim/world.js';
import {SEED,BORN} from '../src/config.js';
import {totals,TRACERS} from '../src/sim/ocean-grid.js';
import {waveEnergy} from '../src/sim/ocean-waves.js';
import {waterVolume} from '../src/sim/hydro.js';
import {atmosphericWater,localWater} from '../src/sim/atmosphere.js';
const days=+(process.argv[2]||365),seed=+(process.argv[3]||SEED);
assert(Number.isInteger(days)&&days>0);
const W=createWorld(seed,BORN),o=W.ocean,initial=o.grids.map(totals);
const water=waterVolume(W)+initial.reduce((s,q)=>s+q.water,0),air=atmosphericWater(W),local=localWater(W),start=performance.now();let checkpoint;
const close=(a,b,tol)=>assert(Math.abs(a-b)<=tol*Math.max(1,Math.abs(a),Math.abs(b)),`${a} != ${b}`);
for(let d=0;d<days;d++){
 if(d===days-1)checkpoint=save(W);
 for(let m=0;m<1440;m++)step(W);
 for(let j=0;j<3;j++){
  const g=o.grids[j],now=totals(g);
  for(const k of ['water','salt','heat','germs']){
   const expected=initial[j][k]+Object.entries(g.ledger).filter(([key])=>key.endsWith(':'+k)).reduce((s,[,v])=>s+v,0);
   close(now[k],expected,2e-9);
  }
  for(const k of ['volume',...TRACERS.filter(k=>k!=='heat'),'action','kelp','solid'])assert(g[k].every(v=>Number.isFinite(v)&&v>=-1e-8),`${g.name} ${k} negative/nonfinite on day ${d+1}`);
  for(const k of ['u','v','heat','bed','eta','rayTravel','phaseX','phaseY','faceU','faceV'])assert(g[k].every(Number.isFinite),`${g.name} ${k} nonfinite`);
  const L=g.waveLedger;close(waveEnergy(g),L.initialJ+L.windJ+L.boundaryJ+L.nestJ-L.bottomJ-L.whitecapJ-L.breakingJ-L.currentJ,2e-9);
 }
 const external=o.grids.reduce((s,g)=>s+Object.entries(g.ledger).filter(([k])=>k.endsWith(':water')).reduce((v,[,q])=>v+q,0),0);
 const fresh=W.hydro.rain-W.hydro.sea-W.hydro.used-W.hydro.evap;
 close(o.grids.reduce((s,g)=>s+totals(g).water,waterVolume(W)),water+external+fresh,2e-9);
 const a=W.atmosphere;assert(Math.abs(atmosphericWater(W)+a.precipitated-a.evaporated-air)<1e-6);
 assert(Math.abs(localWater(W)+a.local.precipitated+a.local.exported-a.local.imported-a.local.evaporated-local)<.01);
 if((d+1)%5===0||d===0)console.log(JSON.stringify({seed,day:d+1,msPerDay:(performance.now()-start)/(d+1),alive:W.man.B.alive}));
}
const expected=save(W),copy=load(checkpoint);assert.equal(save(copy),checkpoint,'load changes checkpoint');while(copy.t<W.t)step(copy);
assert.equal(save(copy),expected,'final-day replay differs');
console.log(JSON.stringify({seed,days,budgets:true,finite:true,deterministicFromCheckpoint:true,alive:W.man.B.alive,cause:W.man.B.cause,msPerDay:(performance.now()-start)/(days+1)}));
