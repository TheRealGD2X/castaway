// Nested reduced atmosphere: 8x6 regional cells, each 120 km; a 6x4 island
// mesh transports vapour/cloud with open regional boundaries. Water in kg/m².
// Hydrostatic pressure acceleration, Coriolis rotation, surface drag,
// condensation/latent heat and precipitation replace scheduled weather regimes.
import { clamp, dexp, dsin, dcos, TAU } from '../core/dmath.js';
import { hash3 } from '../core/rng.js';
import { vnoise } from '../core/noise.js';
const NX=8,NY=6,DX=120000,LX=6,LY=4,F=1.22e-4,RHO=1.2,CP=1005,LV=2.45e6,COLUMN=3000;
const deltas=new WeakMap(),weatherCache=new WeakMap();
export const saturation=T=>.00485*dexp(clamp(17.27*T/(237.3+T),-12,6))*273.15/(273.15+T); // Tetens pressure / ideal-gas temperature
const array=n=>new Float64Array(n);
const sum=a=>a.reduce((v,q)=>v+q,0);
// Compensated totals keep long runs from losing small fluxes beside large
// boundary heat throughput. Compensation is checkpointed with each ledger.
function add(o,k,v){o.compensation??={};const y=v-(o.compensation[k]||0),next=(o[k]||0)+y;o.compensation[k]=(next-(o[k]||0))-y;o[k]=next;}
function hydrate(o,keys){for(const k of keys)o[k]=Float64Array.from(o[k]);return o;}
export function atmosphereInit(W,o){
  if(o){W.atmosphere=hydrate({...o},['h','u','v','heat','vapour','cloud','rain']);W.atmosphere.local=hydrate({...o.local},['temp','mass','heat','vapour','cloud','rain','u','v']);return;}
  const n=NX*NY,a={h:array(n),u:array(n),v:array(n),heat:array(n),vapour:array(n),cloud:array(n),rain:array(n),seaTemp:W.wx.temp+1,evaporated:0,precipitated:0,heatExternal:0,latentExternal:0};
  for(let i=0;i<n;i++){const T=W.wx.temp+(hash3(i,311,W.seed)-.5)*6;a.h[i]=400+(hash3(i,312,W.seed)-.5)*16;a.u[i]=6;a.v[i]=2;a.heat[i]=a.h[i]*(T+273.15);a.vapour[i]=saturation(T)*COLUMN*(.85+hash3(i,313,W.seed)*.25);a.cloud[i]=hash3(i,314,W.seed)*.3;}
  const l={temp:array(LX*LY).fill(W.wx.temp),mass:array(24).fill(RHO*30),heat:array(24).fill(RHO*30*CP*(W.wx.temp+273.15)),vapour:array(LX*LY),cloud:array(LX*LY),rain:array(LX*LY),u:array(LX*LY),v:array(LX*LY),liquidMm:Array(24).fill(0),snowMm:Array(24).fill(0),imported:0,exported:0,evaporated:0,precipitated:0,heatIn:0,heatOut:0,heatExternal:0,latentExternal:0};
  for(let i=0;i<LX*LY;i++){l.vapour[i]=a.vapour[28]*30/COLUMN*(.96+.08*hash3(i,315,W.seed));l.cloud[i]=a.cloud[28]*30/COLUMN*(.8+.4*hash3(i,316,W.seed));}a.local=l;W.atmosphere=a;
}
export function atmosphereSave(W){const a=W.atmosphere;if(!a)return null;const out={...a,local:{...a.local}};for(const k of ['h','u','v','heat','vapour','cloud','rain'])out[k]=Array.from(a[k]);for(const k of ['temp','mass','heat','vapour','cloud','rain','u','v'])out.local[k]=Array.from(a.local[k]);return out;}
// Conservative face fluxes with fixed neighbour order and donor-cell transport.
export function transport(q,u,v,nx,ny,dx,dy,dt,boundary){
  let delta=deltas.get(q);if(!delta){delta=array(q.length);deltas.set(q,delta);}delta.fill(0);let imported=0,exported=0;
  const face=(i,j,velocity,scale,outside)=>{const rate=velocity*dt/scale,donor=rate>=0?i:j,concentration=donor<0?outside:q[donor],amount=rate*concentration;if(i>=0)delta[i]-=amount;if(j>=0)delta[j]+=amount;
    if(i<0){if(amount>0)imported+=amount;else exported-=amount;}if(j<0){if(amount<0)imported-=amount;else exported+=amount;}};
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x;
    if(x<nx-1)face(i,i+1,u[i],dx,boundary);else if(boundary==null)face(i,y*nx,u[i],dx,0);else face(i,-1,u[i],dx,boundary);
    if(y<ny-1)face(i,i+nx,v[i],dy,boundary);else if(boundary==null)face(i,x,v[i],dy,0);else face(i,-1,v[i],dy,boundary);
    if(boundary!=null&&x===0)face(-1,i,u[i],dx,boundary);if(boundary!=null&&y===0)face(-1,i,v[i],dy,boundary);
  }
  for(let i=0;i<q.length;i++)q[i]+=delta[i];return{imported,exported};
}
// The same face calculation transports several conserved quantities together.
function transportFields(fields,u,v,nx,ny,dx,dy,dt,boundaries){
  const delta=fields.map(q=>{let d=deltas.get(q);if(!d){d=array(q.length);deltas.set(q,d);}d.fill(0);return d;}),flux=fields.map(()=>({imported:0,exported:0}));
  const face=(i,j,velocity,size)=>{const r=velocity*dt/size;for(let k=0;k<fields.length;k++){const donor=r>=0?i:j,q=donor<0?boundaries[k]:fields[k][donor],v=r*q;if(i>=0)delta[k][i]-=v;if(j>=0)delta[k][j]+=v;if(i<0){if(v>0)flux[k].imported+=v;else flux[k].exported-=v;}if(j<0){if(v<0)flux[k].imported-=v;else flux[k].exported+=v;}}};
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x;face(i,x<nx-1?i+1:boundaries? -1:y*nx,u[i],dx);face(i,y<ny-1?i+nx:boundaries?-1:x,v[i],dy);if(boundaries&&x===0)face(-1,i,u[i],dx);if(boundaries&&y===0)face(-1,i,v[i],dy);}
  for(let k=0;k<fields.length;k++)for(let i=0;i<fields[k].length;i++)fields[k][i]+=delta[k][i];return flux;
}
// Backward-Euler donor-cell transport with an open boundary. Surface velocities
// share a sign in each axis; their upwind dependency graph is acyclic, allowing
// an exact sweep rather than dozens of CFL substeps. Face fluxes still close
// the budget. This first-order coarse-grid method has numerical diffusion.
export function transportOpen(fields,u,v,nx,ny,dx,dy,dt,boundaries){
  const sx=u[0]>=0?1:-1,sy=v[0]>=0?1:-1;
  if(u.some(q=>q*sx<0)||v.some(q=>q*sy<0)){
    const max=u.reduce((a,q,i)=>Math.max(a,Math.abs(q)/dx+Math.abs(v[i])/dy),0),sub=Math.max(1,Math.floor(max*dt/.4)+1),out=fields.map(()=>({imported:0,exported:0}));
    for(let j=0;j<sub;j++){const f=transportFields(fields,u,v,nx,ny,dx,dy,dt/sub,boundaries);for(let k=0;k<f.length;k++){out[k].imported+=f[k].imported;out[k].exported+=f[k].exported;}}return out;
  }
  const flux=fields.map(()=>({imported:0,exported:0}));
  for(let yy=0;yy<ny;yy++)for(let xx=0;xx<nx;xx++){
    const x=sx>0?xx:nx-1-xx,y=sy>0?yy:ny-1-yy,i=y*nx+x,left=x?u[i-1]:u[i],top=y?v[i-nx]:v[i];
    const ax=dt*(sx>0?left:-u[i])/dx,ay=dt*(sy>0?top:-v[i])/dy,outX=dt*(sx>0?u[i]:-left)/dx,outY=dt*(sy>0?v[i]:-top)/dy;
    const ix=x-sx,iy=y-sy,bx=ix<0||ix>=nx,by=iy<0||iy>=ny,ex=x+sx<0||x+sx>=nx,ey=y+sy<0||y+sy>=ny;
    for(let k=0;k<fields.length;k++){const q=fields[k],boundary=boundaries[k],upX=bx?boundary:q[i-sx],upY=by?boundary:q[i-sy*nx];q[i]=(q[i]+ax*upX+ay*upY)/(1+outX+outY);flux[k].imported+=(bx?ax*boundary:0)+(by?ay*boundary:0);flux[k].exported+=(ex?outX*q[i]:0)+(ey?outY*q[i]:0);}
  }return flux;
}
export function atmosphereStep(W,climate,sun,dt=1){
  const a=W.atmosphere;if(!a)return;a.t=W.t;const seconds=dt*60,n=a.h.length,T=array(n),base=climate.tmean+273.15;
  // Prescribed ocean boundary with 45-day thermal inertia, rather than SST
  // instantly following the land air temperature. Not a resolved ocean model.
  a.seaTemp??=climate.tmean+1;if(!W.ocean)a.seaTemp+=(climate.tmean+1-a.seaTemp)*(1-dexp(-dt/(45*1440)));
  a.oceanEvap??=Array(48).fill(0);a.oceanRain??=Array(48).fill(0);
  const z=F*seconds/2,co=(1-z*z)/(1+z*z),si=2*z/(1+z*z),drag=dexp(-seconds/21600),thermal=1-dexp(-dt/180),condRate=1-dexp(-dt/5),dissolveRate=1-dexp(-dt/10),rainRate=1-dexp(-dt/30);
  for(let i=0;i<n;i++)T[i]=a.heat[i]/a.h[i]-273.15;
  // Staggered pressure gradients and midpoint rotation about a prescribed
  // Atlantic geostrophic flow. Its balancing pressure gradient is external.
  for(let y=0;y<NY;y++)for(let x=0;x<NX;x++){const i=y*NX+x,j=y*NX+(x+1)%NX,k=((y+1)%NY)*NX+x;
    const pressure=i=>a.h[i]*(T[i]+273.15)/base;
    const u=a.u[i]-9.81*(pressure(j)-pressure(i))/DX*seconds,v=a.v[i]-9.81*(pressure(k)-pressure(i))/DX*seconds;
    const gu=6+20*(vnoise(W.t/1800,x*.24+y*.13,W.seed+442)-.5),gv=2+16*(vnoise(W.t/1800+31,x*.17+y*.23,W.seed+443)-.5);
    a.u[i]=gu+(co*(u-gu)+si*(v-gv))*drag;a.v[i]=gv+(co*(v-gv)-si*(u-gu))*drag;
  }
  const max=a.u.reduce((v,q,i)=>Math.max(v,Math.abs(q)+Math.abs(a.v[i])),0),sub=Math.max(1,Math.floor(max*seconds/DX/.4)+1),s=seconds/sub;
  for(let k=0;k<sub;k++)transportFields([a.h,a.heat,a.vapour,a.cloud],a.u,a.v,NX,NY,DX,DX,s,null);
  for(let i=0;i<n;i++){
    let temp=a.heat[i]/a.h[i]-273.15;
    // Unresolved Atlantic heat exchange is a seeded, correlated boundary
    // temperature (±6 K, 12-hour correlation scale), not a rain/gale switch.
    // Its sensible heat input is accounted explicitly; this closure is not a
    // forecast of observed Hebridean weather.
    const atlantic=12*(vnoise(W.t/720+i%NX*.18,Math.floor(i/NX)*.22,W.seed+441)-.5);
    const equilibrium=climate.tmean+atlantic+(sun.elev>0?sun.elev:0)*climate.trange-(1-clamp(a.cloud[i]/.6,0,1))*climate.trange*.3+(NY/2-Math.floor(i/NX))*1.2;
    const heat=(equilibrium-temp)*thermal;temp+=heat;const capacity=a.h[i]*RHO*CP*COLUMN/400;a.heatExternal+=heat*capacity;
    // Bulk aerodynamic ocean evaporation: CE U (rho_v,s - rho_v,a).
    // SST is an explicitly prescribed seasonal ocean boundary; CE=0.0013.
    const saturated=saturation(temp)*COLUMN,SST=a.seaTemps?.[i]??a.seaTemp,evap=.0013*Math.max(.5,Math.sqrt(a.u[i]*a.u[i]+a.v[i]*a.v[i]))*Math.max(0,saturation(SST)-a.vapour[i]/COLUMN)*seconds;
    a.oceanEvap[i]+=evap;
    a.vapour[i]+=evap;a.evaporated+=evap;a.latentExternal+=evap*LV;
    const cond=Math.max(0,a.vapour[i]-saturated)*condRate;a.vapour[i]-=cond;a.cloud[i]+=cond;temp+=cond*LV/capacity;
    const dissolve=Math.min(a.cloud[i],Math.max(0,saturation(temp)*COLUMN-a.vapour[i])*dissolveRate);a.cloud[i]-=dissolve;a.vapour[i]+=dissolve;temp-=dissolve*LV/capacity;
    const rain=a.cloud[i]*rainRate;a.cloud[i]-=rain;a.precipitated+=rain;a.rain[i]=rain*60/dt;a.heat[i]=a.h[i]*(temp+273.15);a.oceanRain[i]+=rain;
  }
  const centre=28,temp=a.heat[centre]/a.h[centre]-273.15,u=(a.u[centre]+a.u[centre-1])*.5,v=(a.v[centre]+a.v[centre-NX])*.5;
  const wx=W.wx;wx.temp=temp;wx.wind=Math.sqrt(u*u+v*v);wx.u=u;wx.v=v;wx.gust=Math.max(wx.wind,Math.sqrt(a.u[centre]*a.u[centre]+a.v[centre]*a.v[centre]));wx.cloud=clamp(a.cloud[centre]/.6,0,1);wx.hum=clamp(a.vapour[centre]/Math.max(.001,saturation(temp)*COLUMN),0,1);wx.rain=a.rain[centre];wx.fog=clamp(a.cloud[centre]/.1,0,1)*clamp((wx.hum-.95)/.05,0,1);wx.pressure=101325+RHO*9.81*(a.h[centre]-400);
  // Retain the UI's octant convention (its historical name labels are legacy).
  let best=-1,oct=0;for(let k=0;k<8;k++){const dot=u*dcos(k*TAU/8)+v*dsin(k*TAU/8);if(dot>best){best=dot;oct=k;}}wx.windDir=oct;
  wx.reg=wx.rain>.4?'front':wx.cloud>.65?'low':wx.cloud<.2?'high':'ridge';delete wx.until;
  wx.sun=sun.rad*(1-.75*wx.cloud*wx.cloud*wx.cloud)*(1-wx.fog*.6);wx.elev=sun.elev;
  localStep(W,seconds,dt);
  weatherCache.delete(W);
}
function localStep(W,seconds,dt){const a=W.atmosphere,l=a.local,wx=W.wx,dx=W.MW*2/LX,dy=W.MH*2/LY,layer=30;
  const thermal=1-dexp(-dt/20),phase=1-dexp(-dt/3),settle=1-dexp(-dt/2);
  for(let y=0;y<LY;y++)for(let x=0;x<LX;x++){const i=y*LX+x,tile=Math.floor((y+.5)*W.MH/LY)*W.MW+Math.floor((x+.5)*W.MW/LX),cover=W.treeAt?.[tile]? .65:W.ter[tile]>1?.12:0;
    l.u[i]=wx.u*(1-cover);l.v[i]=wx.v*(1-cover);const change=(wx.temp+(wx.sun||0)*.0015*(1-cover)-l.temp[i])*thermal,heat=change*l.mass[i]*CP;l.heat[i]+=heat;l.heatExternal+=heat*dx*dy;}
  const vap=a.vapour[28]*layer/COLUMN,cloud=a.cloud[28]*layer/COLUMN;
  // Falling regional rain crosses the 30 m surface layer in seconds. It is
  // a through-flux, not suspended cloud that wind can blow away before landing.
  const falling=wx.rain*dt/60;
  const flux=transportOpen([l.mass,l.heat,l.vapour,l.cloud],l.u,l.v,LX,LY,dx,dy,seconds,[RHO*layer,RHO*layer*CP*(wx.temp+273.15),vap,cloud]);add(l,'heatIn',flux[1].imported*dx*dy);add(l,'heatOut',flux[1].exported*dx*dy);add(l,'latentExternal',(flux[2].imported-flux[2].exported)*LV*dx*dy);add(l,'imported',(flux[2].imported+flux[3].imported)*dx*dy);add(l,'exported',(flux[2].exported+flux[3].exported)*dx*dy);
  for(let i=0;i<l.temp.length;i++){l.temp[i]=l.heat[i]/(l.mass[i]*CP)-273.15;const cap=saturation(l.temp[i])*l.mass[i]/RHO,cond=Math.max(0,l.vapour[i]-cap)*phase;l.vapour[i]-=cond;l.cloud[i]+=cond;l.heat[i]+=cond*LV;
    const evap=Math.min(l.cloud[i],Math.max(0,cap-l.vapour[i])*phase);l.cloud[i]-=evap;l.vapour[i]+=evap;l.heat[i]-=evap*LV;l.temp[i]=l.heat[i]/(l.mass[i]*CP)-273.15;
    const drizzle=l.cloud[i]*settle;l.cloud[i]-=drizzle;const rain=falling+drizzle;l.imported+=falling*dx*dy;l.precipitated+=rain*dx*dy;l.rain[i]=rain*60/dt;
    const snow=clamp((1-l.temp[i])/2,0,1);l.liquidMm[i]+=rain*(1-snow);l.snowMm[i]+=rain*snow;}
  wx.rain=sum(l.rain)/l.rain.length;
}
export function localWeather(W,x,y){const a=W.atmosphere;if(!a||a.t!==W.t||!Number.isFinite(x)||x<0||y<0||x>=W.MW||y>=W.MH)return W.wx;const l=a.local,i=Math.min(LY-1,Math.floor(y/W.MH*LY))*LX+Math.min(LX-1,Math.floor(x/W.MW*LX));
  let cells=weatherCache.get(W);if(!cells){cells=[];weatherCache.set(W,cells);}const w=W.wx;return cells[i]??=({reg:w.reg,temp:l.temp[i],cloud:w.cloud,rain:l.rain[i],wind:Math.sqrt(l.u[i]*l.u[i]+l.v[i]*l.v[i]),windDir:w.windDir,hum:clamp(l.vapour[i]/Math.max(.000001,saturation(l.temp[i])*l.mass[i]/RHO),0,1),fog:w.fog,gust:w.gust,sun:w.sun,elev:w.elev,tide:w.tide,u:l.u[i],v:l.v[i],pressure:w.pressure});
}
export function localRain(W,tile){const w=localWeather(W,tile%W.MW+.5,Math.floor(tile/W.MW)+.5);return w.rain*(1-clamp((1-w.temp)/2,0,1));}
export const localCell=(W,tile)=>Math.min(LY-1,Math.floor(Math.floor(tile/W.MW)/W.MH*LY))*LX+Math.min(LX-1,Math.floor((tile%W.MW)/W.MW*LX));
export function consumePrecipitation(W){if(W.atmosphere?.t!==W.t)return null;const l=W.atmosphere.local,out={liquid:l.liquidMm.map(v=>v/1000),snow:l.snowMm.map(v=>v/1000)};l.liquidMm.fill(0);l.snowMm.fill(0);return out;}
export function returnEvaporation(W,m3){if(!W.atmosphere||m3<=0)return;const l=W.atmosphere.local,kg=m3*1000,area=W.MW*W.MH*4;for(let i=0;i<l.vapour.length;i++)l.vapour[i]+=kg/area;l.evaporated+=kg;l.latentExternal+=kg*LV;}
export const atmosphericWater=W=>sum(W.atmosphere.vapour)+sum(W.atmosphere.cloud);
export const localWater=W=>(sum(W.atmosphere.local.vapour)+sum(W.atmosphere.local.cloud))*W.MW*W.MH*4/(LX*LY);
export const atmosphericEnergy=W=>sum(W.atmosphere.heat)*RHO*CP*COLUMN/400+sum(W.atmosphere.vapour)*LV;
export const localEnergy=W=>(sum(W.atmosphere.local.heat)+sum(W.atmosphere.local.vapour)*LV)*W.MW*W.MH*4/(LX*LY);
