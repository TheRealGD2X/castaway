// A small conservative water balance, in cubic metres (one 2 m tile has 4 m² of surface).
// Soil, surface hollows, groundwater, lake and stream exchange actual water. No browser maths or wall clock.
import { T } from '../world/gen.js';
import { clamp } from '../core/dmath.js';
import { liquidRain } from './seasons.js';

export function hydroInit(W) {
  const n=W.ter.length, land=[],lake=[],stream=[],down=new Int32Array(n).fill(-1),fx=new Float64Array(n),fy=new Float64Array(n);
  for(let i=0;i<n;i++) {
    const t=W.ter[i]; if(t===T.LAKE)lake.push(i);else if(t===T.STREAM)stream.push(i);else if(t>1)land.push(i);
    const x=i%W.MW,y=Math.floor(i/W.MW);let best=1e9;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if(x+dx<0||x+dx>=W.MW||y+dy<0||y+dy>=W.MH)continue;
      const j=i+dx+dy*W.MW,h=W.ter[j]<=1?0:(W.h[j]-.12)*18;
      if(h<best){best=h;down[i]=j;}
    }
  }
  for(let k=0;k<(W.stream?.length||0);k++) {
    const i=W.stream[k],j=W.stream[Math.min(k+1,W.stream.length-1)],p=W.stream[Math.max(0,k-1)];
    const dx=(j%W.MW)-(p%W.MW),dy=Math.floor(j/W.MW)-Math.floor(p/W.MW),d=Math.sqrt(dx*dx+dy*dy)||1;fx[i]=dx/d;fy[i]=dy/d;
  }
  const soil=new Float64Array(n),pool=new Float64Array(n),ice=new Float64Array(n);
  for(const i of land){soil[i]=.22*W.wet[i];if(W.ter[i]===T.MARSH)pool[i]=.06;}
  W.hydroMap={land,lake,stream,down,fx,fy,delta:new Float64Array(n)};
  W.hydro={soil,pool,ice,ground:land.length*.4,lake:lake.length*4*.65,stream:stream.length*4*.14,
    snow:0,freshIce:0,flow:0,streamDepth:.14,lakeDepth:.65,temp:W.wx.temp,oxygen:9,sediment:0,wave:.08,
    rain:0,evap:0,sea:0,used:0,runoff:0,debris:[],debrisId:0,debrisOut:0};
}
export function hydroLoad(W,o) {
  if(!o)return;
  W.hydro={...W.hydro,...o,soil:Float64Array.from(o.soil||W.hydro.soil),pool:Float64Array.from(o.pool||W.hydro.pool),ice:Float64Array.from(o.ice||W.hydro.ice)};
}
export const hydroSave=W=>({...W.hydro,soil:Array.from(W.hydro.soil),pool:Array.from(W.hydro.pool),ice:Array.from(W.hydro.ice)});
export function waterVolume(W) {
  const h=W.hydro;let v=h.ground+h.lake+h.stream+h.snow+h.freshIce;
  for(const i of W.hydroMap.land)v+=h.soil[i]+h.pool[i]+h.ice[i];
  for(const s of W.structs||[])v+=(s.waterL||0)/1000;
  return v;
}
const addSurface=(W,i,v)=>{
  const t=W.ter[i];if(t<=1)W.hydro.sea+=v;else if(t===T.LAKE)W.hydro.lake+=v;else if(t===T.STREAM)W.hydro.stream+=v;else W.hydro.pool[i]+=v;
};
// Integrate the same physical rates over ten minutes, like existing water quality and vegetation processes.
export function hydroTen(W,dt=10) {
  const h=W.hydro,m=W.hydroMap,x=W.wx,area=(m.land.length+m.lake.length+m.stream.length)*4;
  const rain=liquidRain(W)*dt/60000,solid=Math.max(0,x.rain-liquidRain(W))*dt/60000;
  h.rain+=(rain+solid)*area;h.snow+=solid*area;
  const melt=Math.min(h.snow,Math.max(0,W.surface.temp)*dt*.000018*area+(x.sun||0)*dt*.000000018*area);
  h.snow-=melt;const wet=rain+(area?melt/area:0);
  const evaporation=(.0000007+Math.max(0,x.temp)*.00000004+(x.sun||0)*.0000000015)*(1-x.hum*.7)*(1+x.wind*.06)*dt;
  const drains=new Map(),drainStructs=new Map(),collectors=new Map(),captured=new Map();for(const s of W.structs){const i=Math.floor(s.y)*W.MW+Math.floor(s.x);if(s.props?.drainage){drains.set(i,s.props.drainage);drainStructs.set(i,s);}if(s.props?.capacity)collectors.set(i,s);}
  let runoff=0;m.delta.fill(0);
  for(const i of m.land) {
    h.pool[i]+=wet*4;
    const collector=collectors.get(i);if(collector){const v=Math.min(wet*4,wet*collector.props.catchArea*.8);h.pool[i]-=v;captured.set(collector.id,v);}
    const wear=W.traces?.[i]?.wear||0,cap=W.ter[i]===T.ROCK?.03:W.ter[i]===T.SAND?.14:.22;
    const infiltration=Math.min(h.pool[i],Math.max(0,cap-h.soil[i]),dt*.00022/(1+wear*.06));
    h.pool[i]-=infiltration;h.soil[i]+=infiltration;
    const percolate=Math.max(0,h.soil[i]-cap*.55)*dt*.0009;h.soil[i]-=percolate;h.ground+=percolate;
    const se=Math.min(h.soil[i],evaporation*4*.5),pe=Math.min(h.pool[i],evaporation*4);h.soil[i]-=se;h.pool[i]-=pe;h.evap+=se+pe;
    const freeze=Math.min(h.pool[i],Math.max(0,-W.surface.temp)*dt*.000072),thaw=Math.min(h.ice[i],Math.max(0,W.surface.temp)*dt*.0001);
    h.pool[i]+=thaw-freeze;h.ice[i]+=freeze-thaw;
    const j=m.down[i];if(j<0)continue;
    const target=W.ter[j]<=1?0:(W.h[j]-.12)*18+(W.ter[j]===T.STREAM?0:W.ter[j]===T.LAKE?0:h.pool[j]/4);
    const head=(W.h[i]-.12)*18+h.pool[i]/4-target,drain=drains.get(i)||0,hold=(W.ter[i]===T.MARSH?.04:.004)*(1-drain*.95);
    const v=Math.min(Math.max(0,h.pool[i]-hold)*.35,dt*Math.sqrt(Math.max(0,head))*.004*(1+drain*4));
    h.pool[i]-=v;runoff+=v;
    if(drainStructs.has(i))drainStructs.get(i).flow=v/dt;
    if(W.ter[j]>1&&W.ter[j]!==T.LAKE&&W.ter[j]!==T.STREAM)m.delta[j]+=v;else addSurface(W,j,v);
  }
  for(const i of m.land)h.pool[i]+=m.delta[i];
  h.runoff=runoff/dt;
  h.lake+=wet*m.lake.length*4;h.stream+=wet*m.stream.length*4;
  const baseflow=Math.min(h.ground,h.ground*dt*.000006);h.ground-=baseflow;
  if(m.lake.length)h.lake+=baseflow;else if(m.stream.length)h.stream+=baseflow;else h.sea+=baseflow;
  const la=Math.max(4,m.lake.length*4),sa=Math.max(4,m.stream.length*4);
  const lakeHead=Math.max(0,h.lake/la-.5),out=Math.min(h.lake,lakeHead*Math.sqrt(lakeHead)*.12*dt);
  h.lake-=out;if(m.stream.length)h.stream+=out;else h.sea+=out;
  const le=Math.min(h.lake,evaporation*la),se=Math.min(h.stream,evaporation*sa);h.lake-=le;h.stream-=se;h.evap+=le+se;
  const freezing=Math.min(h.lake,Math.max(0,-W.surface.temp)*dt*.000018*la),thawing=Math.min(h.freshIce,Math.max(0,W.surface.temp)*dt*.000025*la);
  h.lake+=thawing-freezing;h.freshIce+=freezing-thawing;
  const depth=h.stream/sa,discharge=Math.min(h.stream,depth*Math.sqrt(Math.max(0,depth))*.6*dt);
  h.stream-=discharge;h.sea+=discharge;h.flow=discharge/dt;
  // Excess water can leave the channel and enter its actual adjacent banks.
  const spill=Math.max(0,h.stream-sa*.32)*.2;
  if(spill>0&&m.stream.length) {
    const banks=[];for(const i of m.stream)for(const o of [1,-1,W.MW,-W.MW]){const j=i+o;if(W.ter[j]>1&&W.ter[j]!==T.LAKE&&W.ter[j]!==T.STREAM)banks.push(j);}
    if(banks.length){h.stream-=spill;for(const j of banks)h.pool[j]+=spill/banks.length;}
  }
  h.streamDepth=h.stream/sa;h.lakeDepth=h.lake/la;
  h.temp+=(x.temp+(x.sun||0)*.002-h.temp)*dt/720;
  const oxygenTarget=clamp(12-h.temp*.22+Math.sqrt(h.flow)*3,3,13);
  h.oxygen+=(oxygenTarget-h.oxygen)*dt/180;
  // Incoming runoff carries silt; settling and outgoing water remove it from the freshwater reservoirs.
  const freshVolume=Math.max(1,h.lake+h.stream);
  h.sediment=clamp(h.sediment+runoff*.05/freshVolume-h.sediment*(dt/900+discharge/freshVolume),0,1);
  h.wave+=(Math.min(1.8,.06+x.wind*x.wind*.0025)-h.wave)*dt/120;
  const travel=h.flow/Math.max(.025,h.streamDepth*1.2)/2*dt;
  for(const q of h.debris){q.prev=q.at;q.at+=travel;}
  h.debris=h.debris.filter(q=>{if(q.at<(W.stream?.length||0)-1)return true;h.debrisOut+=q.kg;return false;});
  // The current detaches a little actual bank litter. The seeded draw represents a chancy detachment.
  for(let k=0;k<(W.stream?.length||0)&&h.debris.length<18;k++){
    const i=W.stream[k],j=[1,-1,W.MW,-W.MW].map(o=>i+o).find(j=>W.ter[j]>1&&W.ter[j]!==T.STREAM&&W.ter[j]!==T.LAKE&&(W.litter[j]||0)>.01);
    if(j==null||W.rng.f()>Math.min(.3,h.flow*dt*3))continue;
    const kg=Math.min(.002,W.litter[j]*h.flow*.03);if(kg<.00001)continue;W.litter[j]-=kg;h.debris.push({id:h.debrisId++,prev:k,at:k,kg});
  }
  // Installed collecting area supplies a real, finite basin. Clay leaks; roof debris can carry germs.
  for(const s of W.structs)if(s.props?.capacity) {
    const p=s.props,old=(s.waterL||0)/1000,capacity=p.capacity/1000;
    // Rain intercepted by its collecting surface is taken from the tile's incoming surface water.
    const i=Math.floor(s.y)*W.MW+Math.floor(s.x),capture=captured.get(s.id)||0;
    const all=old+capture,overflow=Math.max(0,all-capacity),leak=Math.min(Math.max(0,all-overflow),dt*(p.leakL??.002)/1000);
    const evaporated=Math.min(Math.max(0,all-overflow-leak),evaporation*.3);
    s.waterL=Math.max(0,all-overflow-leak-evaporated)*1000;addSurface(W,i,overflow+leak);h.evap+=evaporated;
    s.waterLoad=clamp((s.waterLoad??.8)+x.rain*.003+(Math.max(0,h.temp-4)*.0003)*(s.waterL>0?1:0),.3,20);
  }
}
export function availableWater(W,tile) {
  if(!W.hydro)return 1e6;
  const t=W.ter[tile];return (t===T.LAKE?W.hydro.lake:t===T.STREAM?W.hydro.stream:W.hydro.pool[tile]||0)*1000;
}
export function takeWater(W,tile,litres) {
  if(!W.hydro)return litres;
  const h=W.hydro,t=W.ter[tile],v=Math.min(availableWater(W,tile),Math.max(0,litres))/1000;
  if(t===T.LAKE)h.lake-=v;else if(t===T.STREAM)h.stream-=v;else h.pool[tile]-=v;
  h.used+=v;return v*1000;
}
