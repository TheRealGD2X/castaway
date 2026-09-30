// Coupled shelter air and solid contents, backward-Euler heat balance (J, W, kg, Celsius).
// Weather air is an open boundary. Moisture exchange has its own explicit input/output ledger.
import { FAMILIES } from '../build/build.js';
import { fitted, MAT } from '../build/assembly.js';
import { dexp, clamp } from '../core/dmath.js';
import { liquidRain } from './seasons.js';
export const vapourDensity=(t,hum)=>.61078*dexp(17.27*t/(t+237.3))*1000*hum/(461.5*(t+273.15));
const geometryCache=new WeakMap();
export function thermalBalance(c, p, outside, heatW, dt=60){
  const a=p.airCapacity/dt+p.airWall+p.vent,b=-p.airWall,d=p.wallCapacity/dt+p.airWall+p.wallOutside;
  const u=p.airCapacity/dt*c.airT+p.vent*outside+heatW,v=p.wallCapacity/dt*c.wallT+p.wallOutside*outside;
  const det=a*d-b*b;const airT=(u*d-b*v)/det,wallT=(a*v-b*u)/det;
  const exchanged=(p.vent*(outside-airT)+p.wallOutside*(outside-wallT)+heatW)*dt;
  return {airT,wallT,exchanged};
}
export function climateParams(s,wind=0){const p=s.props||{},a=s.assembly;let mass=0,area=4,height=1.2;
  const cached=geometryCache.get(s);if(cached&&cached.props===s.props&&cached.stage===s.stage&&cached.prog===s.prog){const q=cached.value,closed=clamp(p.wind||0,0,.98);return{...q,vent:q.volume*1.2*1005*(.5+(1-closed)*(18+wind*4))/3600};}
  if(a){let minX=1e9,maxX=-1e9,minY=1e9,maxY=-1e9;for(const n of a.nodes){minX=Math.min(minX,n[0]);maxX=Math.max(maxX,n[0]);minY=Math.min(minY,n[1]);maxY=Math.max(maxY,n[1]);height=Math.max(height,n[2]);}area=Math.max(1,(maxX-minX)*(maxY-minY));for(const q of a.parts)mass+=q.amount*MAT[q.mat].kg*fitted(s,q);}
  else for(const m in s.have)mass+=(s.have[m]||0)*(MAT[m]?.kg||0);
  const volume=Math.max(1,area*height*.6),closed=clamp(p.wind||0,0,.98),shellArea=area+4*Math.sqrt(area)*height;
  const value={volume,area,surfaceArea:shellArea,mass,airCapacity:volume*1.2*1005,wallCapacity:Math.max(1500,mass*1500),airWall:shellArea*2.5,vent:volume*1.2*1005*(.5+(1-closed)*(18+wind*4))/3600,wallOutside:shellArea/(.12+Math.max(0,p.bed||0)*.5+mass/Math.max(1,shellArea)*.08)};geometryCache.set(s,{props:s.props,stage:s.stage,prog:s.prog,value});return{...value};
}
export function climateAtHome(W,x,y){return W.structs.find(s=>FAMILIES[s.k]?.shelter&&s.climate&&Math.abs(s.x-x)<.95&&Math.abs(s.y-y)<.95)?.climate;}
export function microclimateStep(W){
  const homes=W.structs.filter(s=>FAMILIES[s.k]?.shelter&&(s.props?.rain||0)>.1);if(!homes.length)return;
  const share=new Map();for(const f of W.fires){let total=0;const weights=[];for(const s of homes){const d2=((f.x-s.x)*(f.x-s.x)+(f.y-s.y)*(f.y-s.y))*4,w=(s.props.rain||0)/(1+d2)*.2;weights.push(w);total+=w;}for(let i=0;i<homes.length;i++)share.set(homes[i].id,(share.get(homes[i].id)||0)+f.heat*weights[i]/Math.max(1,total));}
  for(const s of homes){const p=climateParams(s,W.wx.wind),c=s.climate||(s.climate={airT:W.wx.temp,wallT:W.wx.temp,vapourKg:vapourDensity(W.wx.temp,W.wx.hum)*p.volume,condensateKg:0,moistureIn:0,moistureOut:0,heatJ:0});
    c.boundWaterKg??=0;c.initialWaterKg??=c.vapourKg+c.condensateKg+c.boundWaterKg;
    const capacity=p.mass*.3,rain=Math.min(Math.max(0,capacity-c.boundWaterKg),liquidRain(W)/60*p.area*(s.props.rain||0));
    const oldCapacity=p.wallCapacity+c.boundWaterKg*4180;c.wallT=(c.wallT*oldCapacity+rain*4180*W.wx.temp)/(oldCapacity+rain*4180);
    c.boundWaterKg+=rain;c.moistureIn+=rain;
    p.wallCapacity+=c.boundWaterKg*4180;
    const inside=W.man&&Math.abs(s.x-W.man.x)<.95&&Math.abs(s.y-W.man.y)<.95;
    const breath=inside?.00035:0;const rho=vapourDensity(W.wx.temp,W.wx.hum),exchange=p.vent/(1.2*1005)*60,frac=1-dexp(-exchange/p.volume),old=c.vapourKg;
    c.vapourKg+=(rho*p.volume-c.vapourKg)*frac+breath;c.moistureIn+=Math.max(0,c.vapourKg-old);c.moistureOut+=Math.max(0,old-c.vapourKg);
    const q=thermalBalance(c,p,W.wx.temp,share.get(s.id)||0);c.airT=q.airT;c.wallT=q.wallT;c.heatJ+=q.exchanged;
    const cap=vapourDensity(Math.min(c.wallT,c.airT),1)*p.volume,condensed=Math.max(0,c.vapourKg-cap);c.vapourKg-=condensed;c.condensateKg+=condensed;c.wallT+=condensed*2.3e6/p.wallCapacity;
    const evap=Math.min(c.condensateKg,Math.max(0,vapourDensity(c.wallT,1)*p.volume-c.vapourKg)*.08);c.condensateKg-=evap;c.vapourKg+=evap;c.wallT-=evap*2.3e6/p.wallCapacity;
    const dry=Math.min(c.boundWaterKg,Math.max(0,vapourDensity(c.wallT,1)-c.vapourKg/p.volume)*p.area*.001*60);c.boundWaterKg-=dry;c.vapourKg+=dry;c.wallT-=dry*2.3e6/p.wallCapacity;
    // A 20-micrometre surface film is retained; excess leaves the shelter's moisture boundary as drips.
    const drip=Math.max(0,c.condensateKg-p.surfaceArea*.02);c.condensateKg-=drip;c.drippedKg=(c.drippedKg||0)+drip;c.moistureOut+=drip;
    c.hum=clamp(c.vapourKg/(vapourDensity(c.airT,1)*p.volume),0,1);c.volume=p.volume;
  }
}
// His forecast uses the same heat equations with held, anticipated weather; it cannot inspect future weather.
export function forecastAir(home,outside,wind,fireW,minutes=480){if(!home?.climate)return outside;const p=climateParams(home,wind),c={...home.climate};for(let t=0;t<minutes;t+=10)Object.assign(c,thermalBalance(c,p,outside,fireW,600));return c.airT;}
