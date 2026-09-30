// Species physiology: finite gut, reserves, heat capacity, water deficit and
// structural dry tissue. Coefficients are a reduced mammal/bird model.
import { clamp, dexp } from '../core/dmath.js';
import { graze, returnWaste, DRY_KCAL } from './foodweb.js';
import { localWeather } from './atmosphere.js';
import { shelterAt } from '../build/build.js';
import { radiantAt } from './fire.js';
const SPEC={rabbit:{mass:1.5,core:39,gut:120,fat:.15,flesh:.2,fertility:31},gull:{mass:.9,core:40,gut:70,fat:.12,flesh:.2},dog:{mass:18,core:38.5,gut:180,fat:.12,flesh:.2}};
export function ensureAnimal(a){const p=SPEC[a.sp];if(!p)return;
  a.sex??=(a.id%2?'female':'male');
  a.body??={mass:p.mass,tissue:p.mass*p.flesh,reserve:p.mass*p.fat*(a.E??.6),gut:0,core:p.core,waterDef:p.mass*.02*(a.thirst??0),ageDays:a.sp==='rabbit'?200:730,injury:0,heatJ:0,metabolicKcal:0,intakeKg:0};
  a.E??=a.body.reserve/(a.body.mass*p.fat);a.thirst??=0;a.cold??=0;a.wet??=0;a.tired??=0;
}
export const organicAnimalMass=a=>a.body?(a.body.tissue+a.body.reserve+a.body.gut+(a.pregnancy?.dry||0)):0;
export function ingest(W,a,dryKg,efficiency=.75){ensureAnimal(a);const b=a.body;if(!b||dryKg<=0)return;const usable=dryKg*efficiency;b.gut+=usable;b.intakeKg+=dryKg;returnWaste(W,a,dryKg-usable);}
export function burrowMinute(W,dt=1){for(const w of W.warrens){const capacity=3036,c=w.climate??={airT:W.foodweb.soilTemp,animalJ:0,groundJ:0,initialJ:capacity*(W.foodweb.soilTemp+273.15)};let watts=0;for(const a of W.animals)if(a.home===w.id&&a.under&&!a.dead)watts+=a.burrowHeatW||0;
  const next=(capacity*c.airT+watts*dt*60+.3*dt*60*W.foodweb.soilTemp)/(capacity+.3*dt*60);c.animalJ+=watts*dt*60;c.groundJ+=.3*(W.foodweb.soilTemp-next)*dt*60;c.airT=next;}}
export function animalMinute(W,a,dt=1){ensureAnimal(a);if(a.dead||!a.body)return;const b=a.body,p=SPEC[a.sp],wx=localWeather(W,a.x,a.y),sh=a.under?{rain:1,wind:.95,bed:.8}:shelterAt(W,a.x,a.y);
  b.ageDays+=dt/1440;
  if(a.sp==='rabbit'&&!a.under&&a.act==='graze'){const i=Math.floor(a.y)*W.MW+Math.floor(a.x),food=graze(W,i,.00013*dt*clamp(1-a.E,.1,1));ingest(W,a,food,.55);const water=Math.min(W.hydro.soil[i]||0,food*5/1000);W.hydro.soil[i]-=water;W.hydro.used+=water;drinkAnimal(a,water*1000);}
  if(a.mother&&b.ageDays<21){const mother=W.animals.find(q=>q.id===a.mother&&!q.dead&&q.under&&q.home===a.home);if(mother){const milk=Math.min(mother.body.reserve,.000006*dt*Math.sqrt(b.mass/.05));mother.body.reserve-=milk;mother.body.waterDef+=milk*2.3;ingest(W,a,milk,.9);drinkAnimal(a,milk*2.3);}}
  const absorbed=b.gut*(1-dexp(-dt/p.gut));b.gut-=absorbed;
  const juvenile=a.sp==='rabbit'&&b.ageDays<120,growth=Math.min(absorbed*(juvenile?.5:.2),Math.max(0,(juvenile?p.mass:b.mass)*p.flesh-b.tissue));
  b.tissue+=growth;if(growth&&juvenile)b.mass=b.tissue/p.flesh;b.reserve+=absorbed-growth;
  const activity=a.act==='sleep'||a.act==='roost'||a.under?1:a.act==='fly'?4:a.act==='run'||a.act==='bolt'?3:a.act==='trot'||a.act==='hop'?1.8:a.sp==='gull'?1.7:1.4;
  // Mammal Kleiber baseline; the avian coefficient is higher. The 0.75
  // exponent approximates avian 0.774 allometry using a deterministic root.
  const basal=(a.sp==='gull'?115:70)*Math.sqrt(b.mass)*Math.sqrt(Math.sqrt(b.mass))/1440;
  // Feather insulation must not use the mammal coat coefficient: doing so
  // triples a resting gull's heat demand even in mild weather.
  const wet=a.wet??0,conductance=(a.sp==='rabbit'?.18:a.sp==='gull'?.22:.3)*Math.sqrt(b.mass)*(1+wet*.8)*(1+wx.wind*(1-(sh.wind||0))*(a.sp==='gull'?.02:.08));
  const human=W.man?.B,skin=human?Math.min(36,33-Math.min(5.5,Math.max(0,33-wx.temp)*.22)-Math.max(0,36.9-human.core)*.8+Math.max(0,human.core-36.95)*9):33;
  a.contactHeatW=a.curled&&human?.asleep?Math.max(0,(b.core-skin)*2):0;
  const environment=a.under?(W.warrens[a.home]?.climate?.airT??W.foodweb.soilTemp):wx.temp,loss=(b.core-environment)*conductance*(a.curled?.7:1)+Math.max(0,b.core-p.core)*b.mass*3+a.contactHeatW;
  a.burrowHeatW=a.under?loss:0;
  let fire=0;for(const F of W.fires){const d=2*Math.sqrt((F.x-a.x)*(F.x-a.x)+(F.y-a.y)*(F.y-a.y));if(d<8)fire+=radiantAt(F,Math.max(.5,d))*.15;}
  const distance=2*Math.sqrt((a.x-a.px)*(a.x-a.px)+(a.y-a.py)*(a.y-a.py));
  const baseKcal=basal*activity*dt+(a.adrift?0:distance*b.mass*3.3/4184),heatBase=baseKcal*4184/(dt*60),shiver=Math.max(0,loss-fire-heatBase)*clamp((p.core-b.core)/2,0,1);
  const demand=(heatBase+shiver)*dt*60/4184,used=Math.min(b.reserve+b.tissue,demand/DRY_KCAL),reserve=Math.min(b.reserve,used);b.reserve-=reserve;b.tissue-=used-reserve;
  const nOut=used*.01;
  W.foodweb.animalRespired+=used;const i=Math.floor(a.y)*W.MW+Math.floor(a.x);if(W.soilN[i]!=null&&W.ter[i]>1){W.soilN[i]+=nOut;W.foodweb.nutrientReturned+=nOut;}
  const metabolic=used*DRY_KCAL*4184/(dt*60);b.metabolicKcal+=used*DRY_KCAL;b.heatJ+=(metabolic+fire-loss)*dt*60;
  b.core+=(metabolic+fire-loss)*dt*60/(b.mass*3500);
  const excess=Math.max(0,b.reserve-b.mass*p.fat);if(excess>0){b.reserve-=excess;returnWaste(W,a,excess);}
  b.waterDef+=basal*activity*dt*.0009;b.injury=Math.max(clamp(1-b.tissue/(b.mass*p.flesh),0,1),b.injury-dt*.000003*clamp(b.reserve/(p.mass*p.fat),0,1));
  a.E=clamp(b.reserve/(b.mass*p.fat),0,1);a.thirst=clamp(b.waterDef/(b.mass*.08),0,1);a.cold=clamp((p.core-b.core)/4,0,1);
  a.wet=clamp(wet+wx.rain*dt*.01*(1-(sh.rain||0))-dt*.002,0,1);
  a.tired=clamp((a.tired||0)+dt*(a.act==='sleep'||a.under?-.004:activity>2?.004:.0007),0,1);
  a.call=null;
  if(!a.under&&!a.adrift){const stimulus=a.act==='fly'?.035:a.sp==='dog'&&a.fear>.65?.025:a.sp==='dog'&&a.want==='company'?.0008:0;
    if(stimulus&&W.rng.f()<1-dexp(-stimulus*dt)){const energy=Math.min(b.reserve*DRY_KCAL*4184,.03);b.reserve-=energy/(DRY_KCAL*4184);W.foodweb.animalRespired+=energy/(DRY_KCAL*4184);a.call={t:W.t,energyJ:energy,hz:a.sp==='gull'?950:240,duration:a.sp==='gull'?.45:.3};}}
  if(b.tissue<b.mass*p.flesh*.5||b.core<28||b.core>44||b.waterDef>b.mass*.18){a.dead=1;a.deathCause=b.core<28?'cold':b.core>44?'heat':b.waterDef>b.mass*.18?'dehydration':'starvation';const key=a.sp+':'+a.deathCause;W.foodweb.animalDeaths[key]=(W.foodweb.animalDeaths[key]||0)+1;returnWaste(W,a,organicAnimalMass(a));b.tissue=0;b.reserve=0;b.gut=0;a.pregnancy=null;}
}
export function drinkAnimal(a,litres){ensureAnimal(a);a.body.waterDef=Math.max(0,a.body.waterDef-litres);a.thirst=clamp(a.body.waterDef/(a.body.mass*.08),0,1);}
export function carcass(W,a){ensureAnimal(a);const dry=organicAnimalMass(a),edible=dry*.63;returnWaste(W,a,dry-edible);a.body.tissue=0;a.body.reserve=0;a.body.gut=0;a.pregnancy=null;a.dead=1;return edible*DRY_KCAL;}
export function canBreed(a){ensureAnimal(a);return a.sp==='rabbit'&&a.sex==='female'&&!a.dead&&a.body.ageDays>120&&a.body.reserve>.14&&a.body.core>36&&a.body.waterDef<a.body.mass*.05;}
export function litterBudget(W,mother){const cost=.01*3;mother.body.reserve-=cost;return cost;}
