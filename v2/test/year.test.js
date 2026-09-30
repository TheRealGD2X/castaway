// Long-run numerical audit; survival/population are observations, not pass conditions.
import assert from 'node:assert/strict';
import {createWorld,step,save,load} from '../src/sim/world.js';
import {SEED,BORN} from '../src/config.js';
import {atmosphericWater,localWater} from '../src/sim/atmosphere.js';
const seeds=process.argv.slice(2).map(Number);if(!seeds.length)seeds.push(SEED,SEED+1,SEED+101);
for(const seed of seeds){const W=createWorld(seed,BORN),a=W.atmosphere,initial=atmosphericWater(W),initialLocal=localWater(W);let rain=0,maxWind=0,tmin=100,tmax=-100,last=null;const start=performance.now();
  for(let i=0;i<365*1440;i++){
    step(W);rain+=W.wx.rain/60;maxWind=Math.max(maxWind,W.wx.gust);tmin=Math.min(tmin,W.wx.temp);tmax=Math.max(tmax,W.wx.temp);
    if(i%1440===0){
      for(const stock of [a.h,a.vapour,a.cloud,a.local.vapour,a.local.cloud,W.hydro.soil,W.hydro.pool,W.hydro.ice,W.foodweb.grass])assert(stock.every(v=>Number.isFinite(v)&&v>=-1e-12));
      for(const v of [W.hydro.lake,W.hydro.stream,W.hydro.ground,W.foodweb.plankton,...Object.values(W.fish)])assert(Number.isFinite(v)&&v>=0);
      assert(Math.abs(atmosphericWater(W)+a.precipitated-a.evaporated-initial)<1e-6);
      assert(Math.abs(localWater(W)+a.local.precipitated+a.local.exported-a.local.imported-a.local.evaporated-initialLocal)<.01); // 10 g across a year of open-boundary fluxes
      for(const animal of W.animals)if(animal.body)for(const v of Object.values(animal.body))if(typeof v==='number')assert(Number.isFinite(v));
    }
    if(i===364*1440-1)last=save(W);
  }
  const replay=load(last);while(replay.t<W.t)step(replay);assert.equal(save(replay),save(W));
  console.log(JSON.stringify({seed,days:365,msPerDay:(performance.now()-start)/365,rainMm:rain,maxWind,temp:[tmin,tmax],alive:W.man.B.alive,cause:W.man.B.cause,populations:Object.fromEntries(['rabbit','gull','dog'].map(sp=>[sp,W.animals.filter(a=>a.sp===sp&&!a.dead).length])),animalDeaths:W.foodweb.animalDeaths,deterministicFromCheckpoint:true}));
}
