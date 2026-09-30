// Reduced food web. Stocks are organic dry kg; carbon lost to respiration and
// harvest leaves this boundary explicitly. Ocean exchange is an open boundary.
import { T } from '../world/gen.js';
import { clamp, dexp } from '../core/dmath.js';
import { hash3 } from '../core/rng.js';
export const DRY_KCAL=4000;
export function foodwebInit(W,o){
  const n=W.ter.length,grass=new Float64Array(n);for(let i=0;i<n;i++)if(W.ter[i]===T.GRASS||W.ter[i]===T.MEADOW)grass[i]=.12+.12*hash3(i,18,W.seed);
  const area={stream:W.hydroMap.stream.length*4,lake:W.hydroMap.lake.length*4,sea:W.ter.reduce((v,t)=>v+(t===T.SEA?4:0),0)};
  W.foodweb={grass,area,prey:{stream:area.stream*.008,lake:area.lake*.008},plankton:area.sea*.012,detritus:0,
    marineFishDry:area.sea*.0005,assimilated:0,respired:0,harvested:0,imported:0,exported:0,grazed:0,animalRespired:0,nutrientReturned:0,detritusN:0,soilTemp:W.wx.temp,animalDeaths:{},...o};
  if(o?.grass)W.foodweb.grass=Float64Array.from(o.grass);
}
export const foodwebSave=W=>({...W.foodweb,grass:Array.from(W.foodweb.grass)});
export function webMass(W){const f=W.foodweb;return f.grass.reduce((a,b)=>a+b,0)+f.prey.stream+f.prey.lake+f.plankton+f.marineFishDry+f.detritus+W.shore.reduce((v,b)=>v+b.kg*(b.k==='mussels'?.075:.06),0)+Object.values(W.fish).reduce((v,n)=>v+n*330/DRY_KCAL,0);}
export function marineCatch(W,dryKg){const f=W.foodweb,kg=Math.min(f.marineFishDry,Math.max(0,dryKg));f.marineFishDry-=kg;f.grazed+=kg;return kg;}
export function graze(W,tile,kg){const f=W.foodweb,taken=Math.min(f.grass[tile]||0,Math.max(0,kg));f.grass[tile]-=taken;f.grazed+=taken;return taken;}
export function harvestShell(W,b,kg,animal=false){const v=Math.min(b.kg,Math.max(0,kg));b.kg-=v;const dry=v*(b.k==='mussels'?.075:.06);W.foodweb[animal?'grazed':'harvested']+=dry;return v;}
export function harvestFish(W,water,n=1){const v=Math.min(W.fish[water]||0,Math.max(0,n));W.fish[water]-=v;W.foodweb.harvested+=v*330/DRY_KCAL;return v;}
export function returnWaste(W,a,kg){if(kg<=0)return;const f=W.foodweb;f.detritus+=kg;const i=Math.floor(a.y)*W.MW+Math.floor(a.x),N=kg*.01;if(W.soilN[i]!=null&&W.ter[i]>1)W.soilN[i]+=N;else f.aquaticN=(f.aquaticN||0)+N;f.nutrientReturned+=N; }
export function foodwebTen(W,dt=10){
  const f=W.foodweb,h=W.hydro,x=W.wx,temp=clamp((x.temp+2)/17,0,1),light=Math.max(0,x.sun||0)*dt*60;
  const grassRespiration=1-dexp(-dt*.000008*temp),grassSenescence=1-dexp(-dt*.000003);
  f.soilTemp+=(x.temp-f.soilTemp)*(1-dexp(-dt/4167)); // 0.5 m diffusion time, alpha=5e-7 m²/s
  for(const i of W.hydroMap.land){const g=f.grass[i];if(W.ter[i]!==T.GRASS&&W.ter[i]!==T.MEADOW)continue;
    // PAR/conversion folded into 1.2% of incident sunlight, 18 MJ/kg dry matter.
    const gross=Math.min(light*4*.012/18e6*Math.max(0,1-g/.5)*temp,(h.soil[i]||0)*2,(W.soilN[i]||0)/.01);
    f.grass[i]+=gross;f.assimilated+=gross;W.soilN[i]-=gross*.01;h.soil[i]-=gross*.5;h.evap+=gross*.5;
    const respiration=f.grass[i]*grassRespiration;f.grass[i]-=respiration;f.respired+=respiration;W.soilN[i]+=respiration*.01;f.nutrientReturned+=respiration*.01;
    const senescent=f.grass[i]*grassSenescence;f.grass[i]-=senescent;f.detritus+=senescent;f.detritusN+=senescent*.01;
  }
  // Plankton and aquatic invertebrate production draws sunlight; substrate
  // area limits photosynthesis. Explicit dissolved nutrient inventory below.
  f.aquaticN??=(f.area.stream+f.area.lake+f.area.sea)*.002;
  for(const k of ['stream','lake','sea']){
    const stock=k==='sea'?f.plankton:f.prey[k],area=f.area[k],thermal=clamp((h.temp+2)/18,0,1),cap=area*(k==='sea'?.035:.025);
    const gross=Math.min(light*area*.006/18e6*thermal*Math.max(0,1-stock/Math.max(.001,cap)),f.aquaticN/.01);
    f.aquaticN-=gross*.01;f.assimilated+=gross;const total=stock+gross,resp=total*(1-dexp(-dt*.00001*thermal));f.respired+=resp;f.aquaticN+=resp*.01;
    if(k==='sea')f.plankton=total-resp;else f.prey[k]=total-resp;
  }
  // Coastal flushing replaces a finite fraction of the water, with assumed
  // dry stock at the model boundary specified as 0.012 kg/m².
  const exchange=1-dexp(-dt/720),incoming=f.area.sea*.012*exchange,out=f.plankton*exchange;
  f.plankton+=incoming-out;f.imported+=incoming;f.exported+=out;
  // A mobile coastal fish cohort feeds on real plankton. The same tidal
  // flushing imports/exports fish biomass across the open ocean boundary.
  const fishIn=f.area.sea*.0005*exchange,fishOut=f.marineFishDry*exchange;
  f.marineFishDry+=fishIn-fishOut;f.imported+=fishIn;f.exported+=fishOut;
  const meal=Math.min(f.plankton,f.marineFishDry*.00002*dt),maintenance=Math.min(f.marineFishDry,f.marineFishDry*.000002*dt);
  f.plankton-=meal;f.marineFishDry+=meal*.2-maintenance;f.detritus+=meal*.6;f.detritusN+=meal*.6*.01;f.respired+=meal*.2+maintenance;f.aquaticN+=(meal*.2+maintenance)*.01;
  for(const b of W.shore){if(W.wx.tide<-b.depth)continue;const factor=b.k==='mussels'?.075:.06,cap=(b.k==='mussels'?14:10)*(.5+b.depth/3);
    const food=Math.min(f.plankton,b.kg*.000002*dt*clamp((h.temp+2)/18,0,1));f.plankton-=food;
    const growth=Math.min(food*.35,Math.max(0,cap-b.kg)*factor);b.kg+=growth/factor;f.detritus+=food*.45;f.detritusN+=food*.45*.01;f.respired+=food*.2+(food*.35-growth);f.aquaticN+=(food*.2+food*.35-growth)*.01;
  }
  for(const k of ['stream','lake']){const count=W.fish[k],quality=clamp(h.oxygen/8,0,1)*clamp((h.temp-1)/14,0,1);
    const depth=k==='stream'?h.streamDepth:h.lakeDepth,habitat=clamp(depth/(k==='stream'?.09:.5),0,1),food=Math.min(f.prey[k],count*.0000035*dt*quality*habitat);f.prey[k]-=food;
    // Production is cohort biomass expressed as 250 g fish equivalents. No
    // birth event creates mass; maintenance can shrink the cohort.
    const gain=food*.3,cost=Math.min(count*330/DRY_KCAL,count*.0000006*dt*clamp((h.temp+2)/16,.05,1));
    const mortality=Math.min(Math.max(0,count*330/DRY_KCAL+gain-cost),count*330/DRY_KCAL*(1-habitat)*(1-dexp(-dt/1440)));
    W.fish[k]=Math.max(0,count+(gain-cost-mortality)*DRY_KCAL/330);f.detritus+=food*.5+mortality;f.detritusN+=(food*.5+mortality)*.01;f.respired+=food*.2+cost;f.aquaticN+=(food*.2+cost)*.01;
  }
  const fraction=1-dexp(-dt*.00002*temp),rot=f.detritus*fraction;f.detritus-=rot;f.respired+=rot;const N=f.detritusN*fraction;f.detritusN-=N;f.aquaticN+=N;
}
