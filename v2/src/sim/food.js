// Individual lots: kcal, dry kg, water kg, core Celsius and organisms/kcal.
// Coefficients are declared approximations, not a food-safety certification.
import { dexp, clamp, dcbrt } from '../core/dmath.js';
import { localWeather } from './atmosphere.js';
export const foodMass=b=>b.dryKg+b.waterKg+(b.shellKg||0);
export const waterActivity=b=>b.waterKg/Math.max(.000001,b.waterKg+b.dryKg*.22);
const batchOrder=(a,b)=>(a.born+(a.decay||0)*14400)-(b.born+(b.decay||0)*14400)||a.id-b.id;
export function newBatch(M,kcal,load,kind,raw=false){
  const nuts=kind.includes('nut'),berry=kind.includes('berr'),shell=kind==='mussels'||kind==='cockles',dryKg=kcal/(nuts?6500:4000),gross=shell?kcal/(kind==='mussels'?300:240):0;
  const shellKg=gross*2/3,waterKg=shell?gross/3-dryKg:kind==='fish'?kcal/1320-dryKg:dryKg*(nuts?.08:berry?6:3);
  return{id:M.foodId=(M.foodId||0)+1,kcal,dryKg,waterKg,shellKg,temp:M.foodAmbient??15,load:load||0,kind,raw,born:M.foodTime||0,dose:0,decay:0};
}
export function addBatch(M,kcal,load,kind,raw=false){if(kcal<=0)return;M.foodBatches||=[];
  // Consecutive gathering belongs to the same harvest, without combining unrelated old meals.
  const b=M.foodBatches.at(-1),n=newBatch(M,kcal,load,kind,raw);
  if(b&&b.kind===kind&&b.raw===raw&&M.foodTime-b.born<60&&b.dose===0){const total=b.kcal+kcal;b.temp=(b.temp*foodMass(b)+n.temp*foodMass(n))/(foodMass(b)+foodMass(n));b.load=(b.load*b.kcal+load*kcal)/total;b.kcal=total;b.dryKg+=n.dryKg;b.waterKg+=n.waterKg;b.shellKg=(b.shellKg||0)+n.shellKg;}else M.foodBatches.push(n);
  syncFood(M);
}
export function syncFood(M){let ready=0,raw=0,rl=0,fl=0,preserved=0;for(const b of M.foodBatches||[]){if(b.raw){raw+=b.kcal;rl+=b.load*b.kcal;M.rawWhat=b.kind;}else{ready+=b.kcal;fl+=b.load*b.kcal;preserved+=(waterActivity(b)<.85?b.kcal:0);M.foodWhat=b.kind;}}
  M.inv.raw=raw;M.inv.food=ready;M.rawLoad=raw?rl/raw:0;M.foodLoad=ready?fl/ready:0;M.preserved=ready?preserved/ready:0;
}
export function ensureFood(W){const M=W.man;if(!M)return;M.foodTime??=W.t;M.foodAmbient??=W.wx.temp;
  if(!M.foodBatches){M.foodBatches=[];const fraction=clamp(M.preserved||0,0,1);if(M.inv.food>0){if(fraction<1)M.foodBatches.push(newBatch(M,M.inv.food*(1-fraction),M.foodLoad,M.foodWhat||'food'));if(fraction>0){const b=newBatch(M,M.inv.food*fraction,M.foodLoad,M.foodWhat||'dried food');b.waterKg=Math.min(b.waterKg,b.dryKg*.5);M.foodBatches.push(b);}}if(M.inv.raw>0)M.foodBatches.push(newBatch(M,M.inv.raw,M.rawLoad,M.rawWhat||'fish',true));}
  for(const s of W.structs)if(!s.foodBatches&&s.stock>0){s.foodBatches=[newBatch(M,s.stock,s.load,'stored food')];syncStore(s);}
  for(const it of W.items)if((it.k==='scraps'||it.k==='quarry')&&!it.foodBatches&&it.kcal>0){const b=newBatch(M,it.kcal,it.k==='quarry'?W.water.stream*.01:0,it.k==='quarry'?'rabbit':'shared food',it.k==='quarry');b.born=it.t??W.t;b.temp=W.wx.temp;it.foodBatches=[b];}
}
export function takeBatches(M,kcal,raw=false,source=M.foodBatches){let left=kcal,load=0,taken=0,parts=[];
  // Older meals first; visible spoilage is a reason to prefer the next batch.
  const ordered=source.slice().sort((a,b)=>(a.raw!==raw)-(b.raw!==raw)||batchOrder(a,b));
  for(const b of ordered){if(b.raw!==raw||left<=0)continue;const k=Math.min(left,b.kcal),f=k/Math.max(.000001,b.kcal);parts.push({...b,kcal:k,dryKg:b.dryKg*f,waterKg:b.waterKg*f,shellKg:(b.shellKg||0)*f});load+=b.load*k;taken+=k;left-=k;b.kcal-=k;b.dryKg*=1-f;b.waterKg*=1-f;b.shellKg=(b.shellKg||0)*(1-f);}
  for(let i=source.length-1;i>=0;i--)if(source[i].kcal<.000001)source.splice(i,1);syncFood(M);return{kcal:taken,load,parts};
}
export const syncStore=s=>{s.stock=(s.foodBatches||[]).reduce((v,b)=>v+b.kcal,0);s.load=s.stock?s.foodBatches.reduce((v,b)=>v+b.load*b.kcal,0)/s.stock:0;};
export function moveFood(M,s,kcal,toStore){s.foodBatches||=[];const from=toStore?M.foodBatches:s.foodBatches,to=toStore?s.foodBatches:M.foodBatches;
  let k=kcal;if(toStore){const room=Math.max(0,(s.props.storageKg||0)-to.reduce((v,b)=>v+foodMass(b),0));let remaining=room,kcap=0;for(const b of from.slice().sort(batchOrder)){if(b.raw)continue;const f=Math.min(1,remaining/Math.max(.000001,foodMass(b)));kcap+=b.kcal*f;remaining-=foodMass(b)*f;}k=Math.min(k,kcap);}
  const got=takeBatches(M,k,false,from);for(const b of got.parts)to.push({...b,id:M.foodId=(M.foodId||0)+1});syncFood(M);syncStore(s);return got.kcal;
}
export function foodRate(b,airT,hum,dt=1){
  const mass=Math.max(.001,foodMass(b));
  b.temp=airT+(b.temp-airT)*dexp(-.0018*dt*60/(mass*.7+.1));
  const aw=waterActivity(b),warm=clamp((b.temp-2)/18,0,1)*clamp((48-b.temp)/15,0,1),growth=.006*warm*clamp((aw-.85)/.15,0,1);
  const kill=b.temp>55?.015*dexp(clamp((b.temp-65)*.16,-8,5)):0;
  b.load=Math.min(1e6,b.load*dexp((growth-kill)*dt));
  const fraction=1-dexp(-.000006*warm*aw*dt),rot=b.dryKg*fraction;b.dryKg-=rot;b.kcal*=1-fraction;b.decay=1-(1-(b.decay||0))*(1-fraction);
  return rot;
}
export function foodStep(W){const M=W.man;if(!M)return;ensureFood(W);const wx=localWeather(W,M.x,M.y),indoor=W.structs.find(s=>s.climate&&Math.abs(s.x-M.x)<.95&&Math.abs(s.y-M.y)<.95)?.climate;M.foodTime=W.t;M.foodAmbient=indoor?.airT??wx.temp;M.foodRespiredKg??=0;for(const b of M.foodBatches)M.foodRespiredKg+=foodRate(b,M.foodAmbient,indoor?.hum??wx.hum);for(const s of W.structs){const w=localWeather(W,s.x,s.y);if(s.foodBatches){for(const b of s.foodBatches)M.foodRespiredKg+=foodRate(b,s.climate?.airT??w.temp,s.climate?.hum??w.hum);syncStore(s);}if(s.catchBatch)M.foodRespiredKg+=foodRate(s.catchBatch,w.temp,w.hum);}
  for(const it of W.items)if(it.foodBatches){const i=Math.floor(it.y)*W.MW+Math.floor(it.x),w=localWeather(W,it.x,it.y);for(const b of it.foodBatches){const rot=foodRate(b,w.temp,w.hum);M.foodRespiredKg+=rot;W.soilN[i]+=rot*.01;W.bio.recycledN=(W.bio.recycledN||0)+rot*.01;}it.kcal=it.foodBatches.reduce((v,b)=>v+b.kcal,0);}syncFood(M);}
export function caughtBatch(W,kcal=1100){const b=newBatch(W.man||{},kcal,W.water.stream*.01,'rabbit',true);b.born=W.t;b.temp=W.wx.temp;return b;}
// Food receives a finite share of emitted fire heat. Thick, heavy portions heat more slowly.
export function heatFood(M,F,dry=false,dt=1){const emitted=Math.max(0,F.heat)*.08*dt*60,batches=M.foodBatches.filter(b=>b.raw),areas=batches.map(b=>dcbrt(foodMass(b)*foodMass(b))),totalArea=areas.reduce((v,a)=>v+a,0);
  for(let i=0;i<batches.length;i++){const b=batches[i];let budget=emitted*areas[i]/Math.max(.000001,totalArea);const c=b.dryKg*1700+b.waterKg*4180+(b.shellKg||0)*800,target=Math.min(110,20+Math.sqrt(F.heat)*1.2),q=Math.min(budget,Math.max(0,(target-b.temp)*c*(1-dexp(-dt*60*.004/Math.max(.1,foodMass(b))))));
    const sensible=Math.min(q,Math.max(0,95-b.temp)*c);b.temp+=sensible/Math.max(1,c);budget-=q;
    const latent=Math.min(b.waterKg*2.3e6,Math.max(0,q-sensible));let evap=latent/2.3e6;
    if(dry){const extra=Math.min(Math.max(0,b.waterKg*2.3e6-latent),budget,120*dt*60);evap+=extra/2.3e6;budget-=extra;}b.waterKg-=evap;M.foodEvaporatedKg=(M.foodEvaporatedKg||0)+evap;
    if(b.temp>55)b.dose+=Math.max(0,b.temp-55)*dt;
    b.load*=dexp(-Math.min(8,Math.max(0,b.temp-55)*.07)*dt);
  }syncFood(M);
  return batches.length>0&&batches.every(b=>dry?waterActivity(b)<.85:b.dose>=90);
}
export function finishFood(M,dry=false){for(const b of M.foodBatches)if(b.raw){M.foodShellWasteKg=(M.foodShellWasteKg||0)+(b.shellKg||0);b.shellKg=0;b.raw=false;b.kind=(dry?'dried ':'cooked ')+b.kind;}syncFood(M);}
