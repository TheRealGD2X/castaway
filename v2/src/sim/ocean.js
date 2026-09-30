// A persistent 960 x 720 km regional ocean, a 120 km shelf and an 8 m
// island mesh. Parent storage excludes nested area: no duplicate water stocks.
import { clamp,dexp,dsin,dcos,TAU } from '../core/dmath.js';
import { hash3 } from '../core/rng.js';
import { T } from '../world/gen.js';
import { elevation,moveRelief } from './geomorph.js';
import { saturation } from './atmosphere.js';
import { newGrid,gridSave,gridLoad,circulation,mixLayers,horizontalMix,temperature,salinity,layerVolume,concentration,addWater,ledger,RHO,CP,TRACERS,sums } from './ocean-grid.js';
import { wavesInit,wavesStep,waveHeight,stokesDrift,waveCache,phaseGradients,bubblesStep } from './ocean-waves.js';
import { marineInit,ecologyStep,organic,takeMarine } from './ocean-ecology.js';
const LV=2.45e6,REGION_HOLE=28,SHELF_PATCH=78;
const coastNeighbours=new WeakMap();
function nearestSea(g){let map=coastNeighbours.get(g);if(map)return map;map=new Uint16Array(g.n);for(let i=0;i<g.n;i++){let best=i,distance=Infinity;if(g.area[i]>0){map[i]=i;continue;}for(let j=0;j<g.n;j++)if(g.area[j]>0){const x=i%g.nx-j%g.nx,y=Math.floor(i/g.nx)-Math.floor(j/g.nx),d=x*x+y*y;if(d<distance){best=j;distance=d;}}map[i]=best;}coastNeighbours.set(g,map);return map;}
export function oceanInit(W,o){
 if(o){W.ocean={...o,grids:o.grids.map(gridLoad),soilSalt:Float64Array.from(o.soilSalt),spray:Float64Array.from(o.spray),coastBed:Float64Array.from(o.coastBed)};for(const g of W.ocean.grids)if(!g.phaseX){g.phaseX=new Float64Array(g.n*24);g.phaseY=new Float64Array(g.n*24);phaseGradients(g);}return;}
 const seaT=W.atmosphere.seaTemp||W.wx.temp+1,regionBed=Array.from({length:48},(_,i)=>-1200-1800*hash3(i,804,W.seed)),regionArea=Array(48).fill(120000*120000);regionArea[REGION_HOLE]=0;
 const regional=newGrid(8,6,120000,120000,regionBed,regionArea,seaT,[.05,.15,.8]);regional.name='offshore';
 const shelfBed=Array.from({length:144},(_,i)=>{const x=i%12-6.5,y=Math.floor(i/12)-6.5,r=Math.sqrt(x*x+y*y);return -(30+25*r*r+hash3(i,805,W.seed)*20);}),shelfArea=Array(144).fill(1e8);shelfArea[SHELF_PATCH]-=W.MW*W.MH*4;
 const shelf=newGrid(12,12,10000,10000,shelfBed,shelfArea,seaT,[.1,.3,.6]);shelf.name='shelf';
 const nx=W.MW/4,ny=W.MH/4,bed=[],coastBed=Float64Array.from(W.h,(_,i)=>W.ter[i]<=1?Math.min(-.08,(W.h[i]-.12)*18):elevation(W,i));
 // Cut cells retain only the sea portion of their footprint. Averaging high
 // land into a mixed shore cell would turn genuine sea pixels into dry blocks.
 const coastArea=[];
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){let z=0,seaZ=0,seaN=0;for(let dy=0;dy<4;dy++)for(let dx=0;dx<4;dx++){const i=(y*4+dy)*W.MW+x*4+dx;z+=coastBed[i];if(W.ter[i]<=1){seaZ+=coastBed[i];seaN++;}}bed.push(seaN?seaZ/seaN:z/16);coastArea.push(seaN*4);}
 const coastal=newGrid(nx,ny,8,8,bed,coastArea,seaT,[.4,.3,.3]);coastal.name='island';coastal.baseBed=Array.from(coastal.bed);
 for(const g of [regional,shelf,coastal]){wavesInit(g);marineInit(g);g.solid=new Float64Array(g.n);for(let i=0;i<g.n;i++)g.solid[i]=g.area[i]*.5*1600;}
 // Existing coastal stocks migrate into spatial inventories, rather than
 // keeping an independent fish or plankton reservoir beside the new ocean.
 const f=W.foodweb;for(const [k,target] of [['phyto',f.plankton],['adult',f.marineFishDry]]){const total=sums(coastal[k]);for(let q=0;q<coastal[k].length;q++)coastal[k][q]=total?coastal[k][q]*target/total:0;}coastal.juvenile.fill(0);
 W.ocean={version:1,grids:[regional,shelf,coastal],soilSalt:new Float64Array(W.ter.length),spray:new Float64Array(W.ter.length),coastBed,lastSea:W.hydro.sea,lastSilt:W.hydro.siltOut,lastSalt:W.hydro.saltSea,floodIn:0,floodOut:0,saltUsed:0,drifters:[],driftOut:0,driftLanded:0,driftInput:0,nextDrifter:1,elapsed:0};
 W.foodweb.aquaticN??=(f.area.stream+f.area.lake)*.002;W.foodweb.dissolvedCarbon??=(W.hydro.lake+W.hydro.stream+W.hydro.ground)*.005;
 syncMarine(W);W.atmosphere.oceanCoupled=true;W.atmosphere.seaTemps=Array.from({length:48},(_,i)=>temperature(regional,i));
}
export function oceanSave(W){return{...W.ocean,grids:W.ocean.grids.map(gridSave),soilSalt:Array.from(W.ocean.soilSalt),spray:Array.from(W.ocean.spray),coastBed:Array.from(W.ocean.coastBed)};}
export const coastal=W=>W.ocean.grids[2];
export const seaLevel=(W,x,y)=>W.ocean?coastal(W).eta[oceanCell(W,x,y)]:W.wx.tide;
export function oceanCell(W,x,y){const g=coastal(W),i=clamp(Math.floor(y/4),0,g.ny-1)*g.nx+clamp(Math.floor(x/4),0,g.nx-1);return g.area[i]>0?i:nearestSea(g)[i];}
export function oceanSample(W,x,y){if(!W.ocean)return null;let g,i;if(x>=0&&y>=0&&x<W.MW&&y<W.MH){g=coastal(W);i=oceanCell(W,x,y);}else{g=W.ocean.grids[1];i=clamp(Math.floor(6.5+(y-W.MH/2)*2/g.dy),0,11)*12+clamp(Math.floor(6.5+(x-W.MW/2)*2/g.dx),0,11);}
 const depth=g.volume[i]/Math.max(1,g.area[i]),drift=stokesDrift(g,i);return{g,i,eta:g.eta[i],depth,u:g.u[i],v:g.v[i],temp:depth>.001?temperature(g,i):W.wx.temp,salinity:depth>.001?salinity(g,i):35,oxygen:concentration(g,i,'oxygen',0)*1000,sediment:concentration(g,i,'sediment',0),plankton:concentration(g,i,'phyto',0),fish:concentration(g,i,'adult',0)+concentration(g,i,'juvenile',0),germs:concentration(g,i,'germs',0)/1000,wave:waveHeight(g,i),breaking:g.breaking[i],foam:g.foam[i],driftU:drift.u,driftV:drift.v};
}
export function syncMarine(W){const f=W.foodweb,g=coastal(W);f.plankton=sums(g.phyto);f.marineFishDry=sums(g.adult)+sums(g.juvenile);f.oceanOrganic=organic(g)-f.plankton-f.marineFishDry;}
export function marineTake(W,x,y,k,kg,tag='consumer'){const g=coastal(W),i=oceanCell(W,x,y),q=takeMarine(g,i,k,kg,tag);if(k==='phyto')W.foodweb.plankton-=q;else if(k==='adult'||k==='juvenile')W.foodweb.marineFishDry-=q;else W.foodweb.oceanOrganic-=q;return q;}
function weather(W,g,i){const a=W.atmosphere,j=g.name==='offshore'?i:REGION_HOLE,pressure=101325+1.2*9.81*(a.h[j]-400);return{u:a.u[j],v:a.v[j],temp:a.heat[j]/a.h[j]-273.15,hum:clamp(a.vapour[j]/Math.max(.0001,saturation(a.heat[j]/a.h[j]-273.15)*3000),0,1),sun:W.wx.sun||0,pressure,rain:a.rain[j],vapour:a.vapour[j]/3000};}
function oceanBoundary(W,level,i,axis,sign){const g=W.ocean.grids[level];
 if(level===0){const temp=W.atmosphere.seaTemp??12,b={eta:W.wx.tide||0,pressure:101325};for(const k of TRACERS)b[k]=[0,0,0];b.salt.fill(RHO*.035);b.heat=[temp,temp-1.5,temp-3].map(T=>RHO*CP*T);b.nutrient.fill(.00008);b.oxygen.fill(.008);b.carbon.fill(.025);b.phyto[0]=.003;b.zoo[0]=.0005;b.juvenile[0]=.00003;b.adult[0]=.00008;b.detritus.fill(.0001);return b;}
 const parent=W.ocean.grids[level-1];let index;if(level===1)index=axis===0?REGION_HOLE+sign:REGION_HOLE+sign*parent.nx;else index=SHELF_PATCH;
 const x=i%g.nx,y=Math.floor(i/g.nx),parentX=level===1?480000+(x+.5)*g.dx:65000-W.MW+(x+.5)*g.dx,parentY=level===1?360000+(y+.5)*g.dy:65000-W.MH+(y+.5)*g.dy;
 return{grid:parent,index,eta:parent.eta[index],pressure:weather(W,parent,index).pressure,parentX,parentY};
}
// The atmosphere computes sea evaporation every minute. It records per-cell
// through-fluxes, applied to each ocean cell's wet area. The regional atmosphere
// uses representative sea cover; thin-cell evaporation is storage-limited.
function surfaceExchange(W,g,level,dt){const a=W.atmosphere,area=g.area;
 for(let i=0;i<g.n;i++){if(!area[i]||g.volume[i]<=area[i]*.001)continue;const w=weather(W,g,i),j=level===0?i:REGION_HOLE,T=temperature(g,i),top=g.volume[i]*g.fractions[0];
  const rain=(a.oceanRain?.[j]||0)*area[i]/1000,evap=Math.min(g.volume[i]*.01,(a.oceanEvap?.[j]||0)*area[i]/1000);addWater(g,i,rain,w.temp,0,'rain');
  // Evaporation removes pure water. Salts and dissolved inventories remain.
  g.volume[i]-=evap;g.eta[i]=g.bed[i]+g.volume[i]/area[i];ledger(g,'evap:water',-evap);
  const wind=Math.sqrt(w.u*w.u+w.v*w.v),exchange=.0013*1.2*1005*wind*area[i]*dt,capacityWater=RHO*CP*g.volume[i]*g.fractions[0],latent=evap*1000*LV,airK=w.temp+273.15,down=(.94*(w.sun||0)+5.67e-8*(.8+.15*w.hum)*airK*airK*airK*airK)*area[i]*dt,oldHeat=g.heat[i];let nextT=T;
  // Implicit sensible and nonlinear longwave exchange remains stable in a
  // millimetre-deep wetting cell, where explicit ten-minute heat steps do not.
  for(let j=0;j<10;j++){const K=nextT+273.15,up=5.67e-8*K*K*K*K*area[i]*dt,residual=capacityWater*nextT-oldHeat-exchange*(w.temp-nextT)-down+up+latent,derivative=capacityWater+exchange+4*5.67e-8*K*K*K*area[i]*dt;nextT-=residual/derivative;}
  const sensible=exchange*(w.temp-nextT),K=nextT+273.15,radiative=down-5.67e-8*K*K*K*K*area[i]*dt;g.heat[i]+=sensible+radiative-latent;ledger(g,'surface:heat',sensible+radiative-latent);
  // Sensible exchange feeds the same regional air column. Radiation crosses
  // the external Sun/space boundary. Latent heat is in atmospheric vapour.
  const capacity=a.h[j]*1.2*1005*3000/400,airChange=-sensible/(120000*120000);a.heat[j]+=airChange/capacity*a.h[j];a.heatExternal+=airChange;
 }
}
export function oceanTen(W,dt=10,observe){if(!W.ocean)return;const o=W.ocean,seconds=dt*60,f=W.foodweb,g=coastal(W),oldOrganic=organic(g),oldProduced=g.ledger['biology:production']||0,oldResp=g.ledger['biology:respiration']||0;
 const freshwater=Math.max(0,W.hydro.sea-o.lastSea),silt=Math.max(0,W.hydro.siltOut-o.lastSilt),mouth=W.stream[W.stream.length-1]??0,index=oceanCell(W,mouth%W.MW,Math.floor(mouth/W.MW));let outlet=index;
 if(g.volume[outlet]<.001){let best=1e99;for(let i=0;i<g.n;i++)if(g.volume[i]>.001){const dx=i%g.nx-index%g.nx,dy=Math.floor(i/g.nx)-Math.floor(index/g.nx),d=dx*dx+dy*dy;if(d<best){best=d;outlet=i;}}}
 addWater(g,outlet,freshwater,W.hydro.temp,0,'river');g.sediment[outlet]+=silt;ledger(g,'river:sediment',silt);const germs=freshwater*1000*(W.water.stream||0);g.germs[outlet]+=germs;ledger(g,'river:germs',germs);const fraction=1-dexp(-freshwater/Math.max(1,W.hydro.lake+W.hydro.stream+W.hydro.ground)),N=(f.aquaticN||0)*fraction,C=(f.dissolvedCarbon||0)*fraction;f.aquaticN-=N;f.dissolvedCarbon-=C;g.nutrient[outlet]+=N;g.carbon[outlet]+=C;ledger(g,'river:nutrient',N);ledger(g,'river:carbon',C);
 const salt=Math.max(0,W.hydro.saltSea-o.lastSalt);g.salt[outlet]+=salt;ledger(g,'river:salt',salt);o.lastSalt=W.hydro.saltSea;o.lastSea=W.hydro.sea;o.lastSilt=W.hydro.siltOut;
 for(let level=0;level<3;level++){const grid=o.grids[level],forcing=Array.from({length:grid.n},(_,i)=>weather(W,grid,i)),edges=new Map(),wind=i=>forcing[i],boundary=(i,axis,sign)=>{const key=i*4+axis*2+(sign>0?1:0);let b=edges.get(key);if(!b){b=oceanBoundary(W,level,i,axis,sign);edges.set(key,b);}return b;};wavesStep(grid,seconds,boundary,wind,W.seed);observe?.('waves',grid);horizontalMix(grid,seconds);observe?.('stir',grid);circulation(grid,seconds,boundary,wind);observe?.('flow',grid);mixLayers(grid,seconds,wind);observe?.('mix',grid);surfaceExchange(W,grid,level,seconds);observe?.('surface',grid);ecologyStep(grid,seconds,i=>weather(W,grid,i));sedimentStep(grid,seconds);bubblesStep(grid,seconds);}
 for(const k of ['oceanEvap','oceanRain'])if(W.atmosphere[k])W.atmosphere[k].fill(0);
 W.atmosphere.seaTemps=Array.from(o.grids[0].volume,(V,i)=>V?temperature(o.grids[0],i):temperature(o.grids[1],SHELF_PATCH));W.atmosphere.seaTemp=W.atmosphere.seaTemps[REGION_HOLE];
 coastStep(W,seconds);driftersStep(W,seconds);syncMarine(W);
 const production=(g.ledger['biology:production']||0)-oldProduced,respiration=(g.ledger['biology:respiration']||0)-oldResp,change=organic(g)-oldOrganic;f.assimilated+=production;f.respired+=respiration;const exchange=change-production+respiration;if(exchange>=0)f.imported+=exchange;else f.exported-=exchange;
 W.hydro.wave=Math.sqrt(g.action.reduce((s,A,at)=>s+A*[TAU/6,TAU/10,TAU/16][Math.floor(at/g.n/8)],0)/Math.max(1,sums(g.area))/RHO/9.81)*4;o.elapsed+=seconds;
}
function sedimentStep(g,dt){for(let i=0;i<g.n;i++){if(g.volume[i]<=.001)continue;const d=g.volume[i]/g.area[i],speed=Math.sqrt(g.u[i]*g.u[i]+g.v[i]*g.v[i]),shear=RHO*.0025*speed*speed+g.breaking[i]*.02,eroded=Math.min(g.solid[i],Math.max(0,shear-.2)*.000002*g.area[i]*dt),q=2*g.n+i;g.solid[i]-=eroded;g.sediment[q]+=eroded;const deposited=g.sediment[q]*(1-dexp(-.0001*dt/Math.max(.02,d)));g.sediment[q]-=deposited;g.solid[i]+=deposited;const relief=(deposited-eroded)/(1600*g.area[i]);g.bed[i]+=relief;g.eta[i]+=relief;}}
function coastStep(W,dt){const o=W.ocean,g=coastal(W),h=W.hydro;h.saltPool??=new Float64Array(W.ter.length);h.saltSoil??=new Float64Array(W.ter.length);
 o.spray.fill(0);
 for(const i of W.hydroMap.land){if(W.dsea[i]>2)continue;const x=i%W.MW+.5,y=Math.floor(i/W.MW)+.5,j=oceanCell(W,x,y),height=elevation(W,i),level=g.eta[j],target=Math.max(0,level-height)*4,current=h.pool[i],S=salinity(g,j),T=temperature(g,j);
  if(target>current&&g.volume[j]>0){const V=Math.min(target-current,g.volume[j]*.02),fraction=V/g.volume[j];for(let l=0;l<3;l++)for(const k of TRACERS){const q=l*g.n+j,amount=g[k][q]*fraction;g[k][q]-=amount;ledger(g,'flood:'+k,-amount);if(k==='salt')h.saltPool[i]+=amount;}g.volume[j]-=V;h.pool[i]+=V;h.rain+=V;o.floodIn+=V;ledger(g,'flood:water',-V);}
  else if(level<height&&current>0&&h.saltPool[i]>0){const V=current*(1-dexp(-dt/600)),salt=h.saltPool[i]*V/current;h.pool[i]-=V;h.saltPool[i]-=salt;h.sea+=V;o.floodOut+=V;addWater(g,j,V,h.temp,0,'return');g.salt[j]+=salt;ledger(g,'return:salt',salt);o.lastSea=h.sea;}
  // Spray deposits a finite parcel of seawater, including salt, rather than
  // wetting clothes or soil from an unlimited cosmetic source.
  if(g.volume[j]>.001&&g.breaking[j]>0){const V=Math.min(g.volume[j]*.001,g.breaking[j]*4*dt*1e-10),fraction=V/g.volume[j];for(let l=0;l<3;l++)for(const k of TRACERS){const at=l*g.n+j,amount=g[k][at]*fraction;g[k][at]-=amount;ledger(g,'spray:'+k,-amount);if(k==='salt')h.saltPool[i]+=amount;if(k==='sediment')h.silt[i]+=amount;}g.volume[j]-=V;g.eta[j]=g.bed[j]+g.volume[j]/g.area[j];ledger(g,'spray:water',-V);h.pool[i]+=V;h.rain+=V;o.spray[i]=V/4/dt*3600000;}
  o.soilSalt[i]=h.saltSoil[i]+h.saltPool[i];
  // Surf erosion moves actual beach soil into suspended coastal sediment.
  if((W.ter[i]===T.SAND||W.ter[i]===T.SHINGLE)&&target>0){const kg=Math.min(h.solid[i],g.breaking[j]*.000002*4*dt);h.solid[i]-=kg;moveRelief(W,i,-kg);g.sediment[j]+=kg;ledger(g,'shore:sediment',kg);h.siltOut+=kg;o.lastSilt=h.siltOut;}
 }
}
export function floatVelocity(W,x,y,windage=.03,out={}){let g,X,Y;if(x>=0&&y>=0&&x<W.MW&&y<W.MH){g=coastal(W);X=x/4-.5;Y=y/4-.5;}else{g=W.ocean.grids[1];X=6+(x-W.MW/2)*2/g.dx;Y=6+(y-W.MH/2)*2/g.dy;}X=clamp(X,0,g.nx-1);Y=clamp(Y,0,g.ny-1);const ix=Math.min(g.nx-2,Math.floor(X)),iy=Math.min(g.ny-2,Math.floor(Y)),fx=X-ix,fy=Y-iy;let u=0,v=0,wet=0;for(let k=0;k<4;k++){const i=(iy+(k>>1))*g.nx+ix+(k&1),weight=(k&1?fx:1-fx)*(k>>1?fy:1-fy);if(!g.area[i]||!weight)continue;const q=stokesDrift(g,i);u+=weight*(g.u[i]+q.u);v+=weight*(g.v[i]+q.v);wet+=weight;}const w=W.wx;out.u=(wet?u/wet:0)+(w.u??dcos(w.windDir*TAU/8)*w.wind)*windage;out.v=(wet?v/wet:0)+(w.v??dsin(w.windDir*TAU/8)*w.wind)*windage;return out;}
export function driftObject(W,obj,seconds,windage=.03){const q={};let remaining=seconds;
 // Interpolated currents are continuous across shelf cells. Offshore
 // segments are <=100 m (1% of a shelf cell); <=1 m sweeps near the island
 // prevent a fast packet from passing through a narrow beach or headland.
 while(remaining>1e-9){floatVelocity(W,obj.x,obj.y,windage,q);const speed=Math.sqrt(q.u*q.u+q.v*q.v);if(speed<1e-12)break;const dx=Math.max(0,-obj.x,obj.x-W.MW)*2,dy=Math.max(0,-obj.y,obj.y-W.MH)*2,distance=Math.sqrt(dx*dx+dy*dy),dt=Math.min(remaining,Math.max(1,Math.min(100,distance-1))/speed);
  const x=obj.x+q.u*dt/2,y=obj.y+q.v*dt/2,tile=Math.floor(y)*W.MW+Math.floor(x);if(x>=0&&y>=0&&x<W.MW&&y<W.MH&&W.ter[tile]>1&&W.ter[tile]!==T.STREAM&&W.ter[tile]!==T.LAKE&&elevation(W,tile)>seaLevel(W,x,y)){obj.x=x;obj.y=y;return true;}obj.x=x;obj.y=y;remaining-=dt;
 }return false;
}
export function addDrifter(W,obj){const q={...obj,id:W.ocean.nextDrifter++};W.ocean.drifters.push(q);W.ocean.driftInput+=q.kg||0;return q;}
function driftersStep(W,dt){const o=W.ocean;for(const q of o.drifters){if(driftObject(W,q,dt,q.windage??.02)){W.items.push({id:W.nextId++,k:'branch',x:q.x,y:q.y,kg:q.kg,moist:1});o.driftLanded+=q.kg;q.done=true;}else if(Math.abs(q.x-W.cx)>30000||Math.abs(q.y-W.cy)>30000){o.driftOut+=q.kg;q.done=true;}}o.drifters=o.drifters.filter(q=>!q.done);}
