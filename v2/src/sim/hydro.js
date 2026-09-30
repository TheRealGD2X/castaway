// A small conservative water balance, in cubic metres (one 2 m tile has 4 m² of surface).
// Soil, surface hollows, groundwater, lake and stream exchange actual water. No browser maths or wall clock.
import { T } from '../world/gen.js';
import { clamp,dcbrt,dexp } from '../core/dmath.js';
import { liquidRain } from './seasons.js';
import { elevation, moveRelief, erosionMass,beginRelief,endRelief,touchRelief } from './geomorph.js';
import { localCell, consumePrecipitation } from './atmosphere.js';
const CARDINAL=[[1,0],[-1,0],[0,1],[0,-1]],EMPTY_PROPS=Object.freeze({});

// SI units: rectangular-channel Manning flow and broad-crested overflow.
export function channelDischarge(width,depth,length,head,roughness=.06){
  if(width<=0||depth<=0||head<=0)return 0;const area=width*depth,radius=area/(width+2*depth);
  return area*dcbrt(radius*radius)*Math.sqrt(head/Math.max(.01,length))/roughness;
}
export const weirDischarge=(width,head)=>head>0?.6*2/3*Math.sqrt(2*9.81)*width*head*Math.sqrt(head):0;
// Stokes settling for an ideal 12-micrometre mineral grain in cool water.
export const SILT_V=2*(2650-1000)*9.81*.000006*.000006/(9*.0013);
export function hydroInit(W) {
  const n=W.ter.length, land=[],lake=[],stream=[],down=new Int32Array(n).fill(-1),fx=new Float64Array(n),fy=new Float64Array(n);
  for(let i=0;i<n;i++) {
    const t=W.ter[i]; if(t===T.LAKE)lake.push(i);else if(t===T.STREAM)stream.push(i);else if(t>1)land.push(i);
    const x=i%W.MW,y=Math.floor(i/W.MW);let best=1e9;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      if(x+dx<0||x+dx>=W.MW||y+dy<0||y+dy>=W.MH)continue;
      const j=i+dx+dy*W.MW,h=W.ter[j]<=1?0:elevation(W,j);
      if(h<best){best=h;down[i]=j;}
    }
  }
  for(let k=0;k<(W.stream?.length||0);k++) {
    const i=W.stream[k],j=W.stream[Math.min(k+1,W.stream.length-1)],p=W.stream[Math.max(0,k-1)];
    const dx=(j%W.MW)-(p%W.MW),dy=Math.floor(j/W.MW)-Math.floor(p/W.MW),d=Math.sqrt(dx*dx+dy*dy)||1;fx[i]=dx/d;fy[i]=dy/d;
  }
  const soil=new Float64Array(n),pool=new Float64Array(n),ice=new Float64Array(n);
  for(const i of land){soil[i]=.22*W.wet[i];if(W.ter[i]===T.MARSH)pool[i]=.06;}
  W.hydroMap={land,lake,stream,down,fx,fy,localCells:Uint8Array.from({length:n},(_,i)=>localCell(W,i)),delta:new Float64Array(n),siltDelta:new Float64Array(n)};
  const solid=new Float64Array(n),silt=new Float64Array(n);for(const i of land)solid[i]=4*.3*1600;
  W.hydro={soil,pool,ice,solid,silt,lakeSilt:0,streamSilt:0,lakeBed:0,siltOut:0,siltUsed:0,ground:land.length*.4,lake:lake.length*4*.65,stream:stream.length*4*.14,
    snow:0,freshIce:0,flow:0,streamDepth:.14,lakeDepth:.65,temp:W.wx.temp,oxygen:9,sediment:0,wave:.08,
    rain:0,evap:0,sea:0,used:0,runoff:0,mineralHarvested:0,debris:[],debrisId:0,debrisOut:0,saltPool:new Float64Array(n),saltSoil:new Float64Array(n),saltGround:0,saltLake:0,saltStream:0,saltSea:0,saltUsed:0};
}
export function hydroLoad(W,o) {
  if(!o)return;
  W.hydro={...W.hydro,...o,solid:Float64Array.from(o.solid||W.hydro.solid),silt:Float64Array.from(o.silt||W.hydro.silt),soil:Float64Array.from(o.soil||W.hydro.soil),pool:Float64Array.from(o.pool||W.hydro.pool),ice:Float64Array.from(o.ice||W.hydro.ice)};
  for(const k of ['saltPool','saltSoil'])W.hydro[k]=Float64Array.from(o[k]||new Float64Array(W.ter.length));
}
export const hydroSave=W=>({...W.hydro,saltPool:Array.from(W.hydro.saltPool),saltSoil:Array.from(W.hydro.saltSoil),solid:Array.from(W.hydro.solid),silt:Array.from(W.hydro.silt),soil:Array.from(W.hydro.soil),pool:Array.from(W.hydro.pool),ice:Array.from(W.hydro.ice)});
export function waterSalinity(W,i){const h=W.hydro,t=W.ter[i],V=t===T.LAKE?h.lake:t===T.STREAM?h.stream:h.pool[i],salt=t===T.LAKE?h.saltLake:t===T.STREAM?h.saltStream:h.saltPool[i];return V>0?salt/V:0;} // kg/m3 = g/L
export function freshwaterSalt(W){const h=W.hydro;return h.saltGround+h.saltLake+h.saltStream+h.saltSea+h.saltUsed+h.saltPool.reduce((a,v)=>a+v,0)+h.saltSoil.reduce((a,v)=>a+v,0)+W.structs.reduce((a,s)=>a+(s.saltKg||0),0);}
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
  beginRelief(W);
  const h=W.hydro,m=W.hydroMap,x=W.wx,area=(m.land.length+m.lake.length+m.stream.length)*4;
  const rain=liquidRain(W)*dt/60000,solid=Math.max(0,x.rain-liquidRain(W))*dt/60000,precip=consumePrecipitation(W);
  const rainAt=i=>precip?precip.liquid[m.localCells[i]]:rain,snowAt=i=>precip?precip.snow[m.localCells[i]]:solid;
  for(const list of [m.land,m.lake,m.stream])for(const i of list){h.rain+=(rainAt(i)+snowAt(i))*4;h.snow+=snowAt(i)*4;}
  const melt=Math.min(h.snow,Math.max(0,W.surface.temp)*dt*.000018*area+(x.sun||0)*dt*.000000018*area);
  h.snow-=melt;const wet=rain+(area?melt/area:0);
  const evaporation=(.0000007+Math.max(0,x.temp)*.00000004+(x.sun||0)*.0000000015)*(1-x.hum*.7)*(1+x.wind*.06)*dt;
  const earths=new Map();for(const s of W.structs)if(s.earthwork)earths.set(Math.floor(s.y)*W.MW+Math.floor(s.x),s);
  const drains=new Map(),drainStructs=new Map(),collectors=new Map(),captured=new Map();for(const s of W.structs){const i=Math.floor(s.y)*W.MW+Math.floor(s.x);if(s.props?.drainage){drains.set(i,s.props.drainage);drainStructs.set(i,s);}if(s.props?.capacity)collectors.set(i,s);}
  let runoff=0;m.delta.fill(0);m.siltDelta.fill(0);
  m.saltDelta??=new Float64Array(W.ter.length);m.saltDelta.fill(0);
  const routeSalt=(i,kg)=>{if(W.ter[i]<=1)h.saltSea+=kg;else if(W.ter[i]===T.LAKE)h.saltLake+=kg;else if(W.ter[i]===T.STREAM)h.saltStream+=kg;else m.saltDelta[i]+=kg;};
  const poolSalt=(i,V)=>{const kg=h.saltPool[i]*Math.min(1,V/Math.max(1e-12,h.pool[i]));h.saltPool[i]-=kg;return kg;};
  const moveSilt=(i,kg)=>{const t=W.ter[i];if(t<=1)h.siltOut+=kg;else if(t===T.LAKE)h.lakeSilt+=kg;else if(t===T.STREAM)h.streamSilt+=kg;else m.siltDelta[i]+=kg;};
  const headAt=i=>{const e=earths.get(i)?.props||EMPTY_PROPS,base=elevation(W,i),cut=e.excavatedM3||0,pool=h.pool[i]||0;return cut?base-(e.channelDepth||0)+Math.min(pool,cut)/Math.max(.01,e.earthArea)+Math.max(0,pool-cut)/4:base+pool/4;};
  for(const i of m.land) {
    const wet=rainAt(i)+(area?melt/area:0);
    h.pool[i]+=wet*4;
    const collector=collectors.get(i);if(collector){const v=Math.min(wet*4,wet*collector.props.catchArea*.8);h.pool[i]-=v;captured.set(collector.id,v);}
    const earth=earths.get(i),ep=earth?.props||EMPTY_PROPS;
    if(earth){const moved=earth.earthMovedM3||0,need=Math.max(0,(ep.excavatedM3||0)-moved)*1600,kg=Math.min(h.solid[i],need);h.solid[i]-=kg;earth.spoilKg=(earth.spoilKg||0)+kg;earth.earthMovedM3=moved+kg/1600;}
    if(ep.retention){const room=Math.max(0,ep.capacity/1000-(earth.waterL||0)/1000-(captured.get(earth.id)||0)),v=Math.min(h.pool[i],room,dt*.0005*ep.earthArea);const kg=h.silt[i]*v/Math.max(.000001,h.pool[i]);h.silt[i]-=kg;earth.suspendedKg=(earth.suspendedKg||0)+kg;earth.saltKg=(earth.saltKg||0)+poolSalt(i,v);h.pool[i]-=v;captured.set(earth.id,(captured.get(earth.id)||0)+v);}
    const wear=W.traces?.[i]?.wear||0,cap=Math.min(W.ter[i]===T.ROCK?.03:W.ter[i]===T.SAND?.14:.22,h.solid[i]/1600*.19);
    const expelled=Math.max(0,h.soil[i]-cap),expelledSalt=h.saltSoil[i]*expelled/Math.max(1e-12,h.soil[i]);h.saltSoil[i]-=expelledSalt;h.saltPool[i]+=expelledSalt;h.soil[i]-=expelled;h.pool[i]+=expelled;
    const infiltration=Math.min(h.pool[i],Math.max(0,cap-h.soil[i]),dt*.00022*(ep.infiltration??1)/(1+wear*.06));
    h.saltSoil[i]+=poolSalt(i,infiltration);h.pool[i]-=infiltration;h.soil[i]+=infiltration;
    const percolate=Math.max(0,h.soil[i]-cap*.55)*dt*.0009,salt=h.saltSoil[i]*percolate/Math.max(1e-12,h.soil[i]);h.saltSoil[i]-=salt;h.saltGround+=salt;h.soil[i]-=percolate;h.ground+=percolate;
    const se=Math.min(h.soil[i],evaporation*4*.5),pe=Math.min(h.pool[i],evaporation*4);h.soil[i]-=se;h.pool[i]-=pe;h.evap+=se+pe;
    const freeze=Math.min(h.pool[i],Math.max(0,-W.surface.temp)*dt*.000072),thaw=Math.min(h.ice[i],Math.max(0,W.surface.temp)*dt*.0001);
    h.pool[i]+=thaw-freeze;h.ice[i]+=freeze-thaw;
    let j=m.down[i];if(j<0)continue;
    // A full hollow can drain along a different neighbour from its dry bed.
    // Select the lowest actual free surface, respecting engineered outlets.
    if(h.pool[i]>.004&&!ep.crest&&!ep.drainage){let low=1e99;const ix=i%W.MW,iy=Math.floor(i/W.MW);for(const [dx,dy] of CARDINAL){if(ix+dx<0||ix+dx>=W.MW||iy+dy<0||iy+dy>=W.MH)continue;const q=i+dx+dy*W.MW,value=W.ter[q]<=1?0:headAt(q);if(value<low){low=value;j=q;}}}
    let target=W.ter[j]<=1?0:(W.ter[j]===T.STREAM||W.ter[j]===T.LAKE?elevation(W,j):headAt(j));
    if(ep.crest)target=Math.max(target,elevation(W,i)+ep.crest);
    const head=headAt(i)-target,drain=drains.get(i)||0,hold=(W.ter[i]===T.MARSH?.04:.004)*(1-drain*.95);
    const sourceBase=elevation(W,i),cut=ep.excavatedM3||0;
    const equilibrium=target>=sourceBase?cut+(target-sourceBase)*4:Math.max(0,target-sourceBase+(ep.channelDepth||0))*(ep.earthArea||4);
    const available=Math.max(0,h.pool[i]-equilibrium),wetDepth=Math.min(ep.channelDepth||0,h.pool[i]/Math.max(.01,ep.earthArea||4));
    const engineered=ep.crest?weirDischarge(earth.earthwork.width,head):ep.drainage?channelDischarge(ep.channelWidth,wetDepth,earth.earthwork.length,head):0;
    const v=ep.crest||ep.drainage?Math.min(Math.max(0,h.pool[i]-hold),available,engineered*dt*60):Math.min(available,Math.max(0,h.pool[i]-hold)*.35,dt*Math.sqrt(Math.max(0,head))*.004);
    if(earth)earth.flow=v/dt;
    const eroded=Math.min(h.solid[i],v*20,erosionMass(h.pool[i]/4,head,2,dt*60,W.treeAt?.[i]?1:W.ter[i]===T.MEADOW?.4:0,wear)),silt=h.silt[i]*v/Math.max(.000001,h.pool[i])+eroded;
    h.solid[i]-=eroded;moveRelief(W,i,-eroded);h.silt[i]-=silt-eroded;moveSilt(j,silt);
    routeSalt(j,poolSalt(i,v));h.pool[i]-=v;runoff+=v;
    if(drainStructs.has(i))drainStructs.get(i).flow=v/dt;
    if(W.ter[j]>1&&W.ter[j]!==T.LAKE&&W.ter[j]!==T.STREAM)m.delta[j]+=v;else addSurface(W,j,v);
  }
  for(const i of m.land){h.pool[i]+=m.delta[i];h.saltPool[i]+=m.saltDelta[i];h.silt[i]+=m.siltDelta[i];const kg=h.silt[i]*(1-dexp(-SILT_V*dt*60/Math.max(.001,h.pool[i]/4)));h.silt[i]-=kg;h.solid[i]+=kg;moveRelief(W,i,kg);}
  h.runoff=runoff/dt;
  for(const i of m.lake)h.lake+=(rainAt(i)+(area?melt/area:0))*4;for(const i of m.stream)h.stream+=(rainAt(i)+(area?melt/area:0))*4;
  const baseflow=Math.min(h.ground,h.ground*dt*.000006),baseSalt=h.saltGround*baseflow/Math.max(1e-12,h.ground);h.saltGround-=baseSalt;if(m.lake.length)h.saltLake+=baseSalt;else if(m.stream.length)h.saltStream+=baseSalt;else h.saltSea+=baseSalt;h.ground-=baseflow;
  if(m.lake.length)h.lake+=baseflow;else if(m.stream.length)h.stream+=baseflow;else h.sea+=baseflow;
  const la=Math.max(4,m.lake.length*4),sa=Math.max(4,m.stream.length*4);
  const lakeHead=Math.max(0,h.lake/la+h.lakeBed/(1600*la)-.5),out=Math.min(h.lake,lakeHead*Math.sqrt(lakeHead)*.12*dt);
  const lakeSilt=h.lakeSilt*out/Math.max(.000001,h.lake);h.lakeSilt-=lakeSilt;if(m.stream.length)h.streamSilt+=lakeSilt;else h.siltOut+=lakeSilt;
  const lakeSalt=h.saltLake*out/Math.max(1e-12,h.lake);h.saltLake-=lakeSalt;if(m.stream.length)h.saltStream+=lakeSalt;else h.saltSea+=lakeSalt;h.lake-=out;if(m.stream.length)h.stream+=out;else h.sea+=out;
  const le=Math.min(h.lake,evaporation*la),se=Math.min(h.stream,evaporation*sa);h.lake-=le;h.stream-=se;h.evap+=le+se;
  const freezing=Math.min(h.lake,Math.max(0,-W.surface.temp)*dt*.000018*la),thawing=Math.min(h.freshIce,Math.max(0,W.surface.temp)*dt*.000025*la);
  h.lake+=thawing-freezing;h.freshIce+=freezing-thawing;
  const depth=h.stream/sa,discharge=Math.min(h.stream,depth*Math.sqrt(Math.max(0,depth))*.6*dt);
  const exported=h.streamSilt*discharge/Math.max(.000001,h.stream);h.streamSilt-=exported;h.siltOut+=exported;
  const streamSalt=h.saltStream*discharge/Math.max(1e-12,h.stream);h.saltStream-=streamSalt;h.saltSea+=streamSalt;h.stream-=discharge;h.sea+=discharge;h.flow=discharge/dt;
  // Excess water can leave the channel and enter its actual adjacent banks.
  const spill=Math.max(0,h.stream-sa*.32)*.2;
  if(spill>0&&m.stream.length) {
    const banks=[];for(const i of m.stream)for(const o of [1,-1,W.MW,-W.MW]){const j=i+o;if(W.ter[j]>1&&W.ter[j]!==T.LAKE&&W.ter[j]!==T.STREAM)banks.push(j);}
    if(banks.length){const kg=h.streamSilt*spill/Math.max(.000001,h.stream),salt=h.saltStream*spill/Math.max(1e-12,h.stream);h.saltStream-=salt;h.streamSilt-=kg;h.stream-=spill;for(const j of banks){h.pool[j]+=spill/banks.length;h.silt[j]+=kg/banks.length;h.saltPool[j]+=salt/banks.length;}}
  }
  h.streamDepth=h.stream/sa;h.lakeDepth=h.lake/la;
  h.temp+=(x.temp+(x.sun||0)*.002-h.temp)*dt/720;
  const oxygenTarget=clamp(12-h.temp*.22+Math.sqrt(h.flow)*3,3,13);
  h.oxygen+=(oxygenTarget-h.oxygen)*dt/180;
  // Incoming runoff carries silt; settling and outgoing water remove it from the freshwater reservoirs.
  const freshVolume=Math.max(1,h.lake+h.stream);
  const settled=h.lakeSilt*(1-dexp(-SILT_V*dt*60/Math.max(.02,h.lakeDepth)));h.lakeSilt-=settled;h.lakeBed+=settled;if(settled)for(const i of m.lake)touchRelief(W,i);h.sediment=clamp((h.lakeSilt+h.streamSilt)/freshVolume/.2,0,1);
  if(!W.ocean)h.wave+=(Math.min(1.8,.06+x.wind*x.wind*.0025)-h.wave)*dt/120;
  const travel=h.flow/Math.max(.025,h.streamDepth*1.2)/2*dt;
  for(const q of h.debris){q.prev=q.at;q.at+=travel;}
  h.debris=h.debris.filter(q=>{if(q.at<(W.stream?.length||0)-1)return true;h.debrisOut+=q.kg;if(W.ocean){const tile=W.stream[W.stream.length-1],o=W.ocean;o.drifters.push({id:o.nextDrifter++,x:tile%W.MW+.5,y:Math.floor(tile/W.MW)+.5,kg:q.kg,windage:.02});o.driftInput+=q.kg;}return false;});
  // The current detaches a little actual bank litter. The seeded draw represents a chancy detachment.
  for(let k=0;k<(W.stream?.length||0)&&h.debris.length<18;k++){
    const i=W.stream[k],j=[1,-1,W.MW,-W.MW].map(o=>i+o).find(j=>W.ter[j]>1&&W.ter[j]!==T.STREAM&&W.ter[j]!==T.LAKE&&(W.litter[j]||0)>.01);
    if(j==null||W.rng.f()>Math.min(.3,h.flow*dt*3))continue;
    const kg=Math.min(.002,W.litter[j]*h.flow*.03);if(kg<.00001)continue;W.litter[j]-=kg;h.debris.push({id:h.debrisId++,prev:k,at:k,kg});
  }
  // Installed collecting area supplies a real, finite basin. Clay leaks; roof debris can carry germs.
  for(const s of W.structs)if(s.props?.capacity||(s.waterL||0)>0) {
    const p=s.props||{},old=(s.waterL||0)/1000,capacity=(p.capacity||0)/1000;
    // Rain intercepted by its collecting surface is taken from the tile's incoming surface water.
    const i=Math.floor(s.y)*W.MW+Math.floor(s.x),capture=captured.get(s.id)||0;
    const all=old+capture;
    if(s.props?.retention){
      const previousKg=s.suspendedKg||0;
      const settled=previousKg*(1-dexp(-SILT_V*dt*60/Math.max(.02,s.props.channelDepth)));
      s.suspendedKg=previousKg-settled;s.depositedKg=(s.depositedKg||0)+settled;
      s.waterLoad=all>0?((s.waterLoad??2)*old+Math.max(2,W.water.marsh||2)*capture)/all:2;
    }
    const overflow=Math.max(0,all-capacity),leak=Math.min(Math.max(0,all-overflow),dt*(p.leakL??.002)/1000);
    const evaporated=Math.min(Math.max(0,all-overflow-leak),evaporation*.3);
    if(s.props?.retention){const lost=(s.suspendedKg||0)*Math.min(1,(overflow+leak)/Math.max(.000001,all));s.suspendedKg=Math.max(0,(s.suspendedKg||0)-lost);h.silt[i]+=lost;}
    const salt=(s.saltKg||0)*Math.min(1,(overflow+leak)/Math.max(1e-12,all));s.saltKg=(s.saltKg||0)-salt;if(W.ter[i]<=1)h.saltSea+=salt;else if(W.ter[i]===T.LAKE)h.saltLake+=salt;else if(W.ter[i]===T.STREAM)h.saltStream+=salt;else h.saltPool[i]+=salt;s.waterL=Math.max(0,all-overflow-leak-evaporated)*1000;addSurface(W,i,overflow+leak);h.evap+=evaporated;
    s.waterLoad=clamp((s.waterLoad??.8)+x.rain*.003+(Math.max(0,h.temp-4)*.0003)*(s.waterL>0?1:0),.3,20);
  }
  endRelief(W);
}
export function availableWater(W,tile) {
  if(!W.hydro)return 1e6;
  const t=W.ter[tile];return (t===T.LAKE?W.hydro.lake:t===T.STREAM?W.hydro.stream:W.hydro.pool[tile]||0)*1000;
}
export function takeWater(W,tile,litres) {
  if(!W.hydro)return litres;
  const h=W.hydro,t=W.ter[tile],v=Math.min(availableWater(W,tile),Math.max(0,litres))/1000;
  const salt=v*waterSalinity(W,tile);if(t===T.LAKE)h.saltLake-=salt;else if(t===T.STREAM)h.saltStream-=salt;else h.saltPool[tile]-=salt;h.saltUsed+=salt;h.lastTakenSalt=salt;
  const massKey=t===T.LAKE?'lakeSilt':t===T.STREAM?'streamSilt':null,kg=(massKey?h[massKey]:h.silt[tile]||0)*v/Math.max(.000001,availableWater(W,tile)/1000);
  if(massKey)h[massKey]-=kg;else h.silt[tile]=Math.max(0,h.silt[tile]-kg);h.siltUsed+=kg;
  if(t===T.LAKE)h.lake-=v;else if(t===T.STREAM)h.stream-=v;else h.pool[tile]-=v;
  h.used+=v;return v*1000;
}

export function takeCollectedWater(W,s,litres){
  const L=Math.min(s.waterL||0,Math.max(0,litres)),kg=(s.suspendedKg||0)*L/Math.max(.000001,s.waterL||0);
  const salt=(s.saltKg||0)*L/Math.max(1e-12,s.waterL||0);s.saltKg=(s.saltKg||0)-salt;W.hydro.saltUsed+=salt;W.hydro.lastTakenSalt=salt;s.suspendedKg=Math.max(0,(s.suspendedKg||0)-kg);s.waterL=Math.max(0,(s.waterL||0)-L);W.hydro.used+=L/1000;W.hydro.siltUsed+=kg;return L;
}
export function mineralMass(W){const h=W.hydro;return h.solid.reduce((a,b)=>a+b,0)+h.silt.reduce((a,b)=>a+b,0)+h.lakeSilt+h.streamSilt+h.lakeBed+h.siltOut+h.siltUsed+(h.mineralHarvested||0)+W.structs.reduce((v,s)=>v+(s.spoilKg||0)+(s.suspendedKg||0)+(s.depositedKg||0),0);}
