// Dry organic matter, kg. Photosynthesis is an atmospheric input; respiration an output.
// Harvested matter crosses into the camp inventory. This ledger covers vegetation, not animal chemistry.
import { SP, T, idx } from '../world/gen.js';
import { clamp, dexp } from '../core/dmath.js';
export const cropKg=e=>e.k==='reeds'?1.25:.9;
export const fruitKg=e=>e.k==='hazel'?2400/6500:e.k==='bramble'?.225:.15;
export function biomassInit(W, saved) {
  W.bio=saved||{solarJ:0,assimilatedKg:0,respiredKg:0,harvestedKg:0};
  W.soilN=W.soilN?Float64Array.from(W.soilN):Float64Array.from(W.ter,t=>t>1?.12:0);
  for(const e of W.ents)if(SP[e.k]?.kind!=='rock'){
    const size=e.size||1;
    e.liveKg??=(SP[e.k]?.kind==='tree'?300:SP[e.k]?.kind==='shrub'?24:2)*size;
    e.reserveKg??=2*size;e.leafKg??=(SP[e.k]?.kind==='tree'?5:1)*size*(1-(e.fall||0));
    if(e.k==='fern'||e.k==='reeds')e.n??=e.k==='reeds'?3:1;
  }
}
export function plantMass(e){return(e.liveKg||0)+(e.reserveKg||0)+(e.leafKg||0)+(e.deadKg||0)+(e.shoots||0)*.18+(e.fruit||0)*fruitKg(e)+(e.k==='fern'||e.k==='reeds'?(e.n??(e.k==='reeds'?3:1))*cropKg(e):0);}
export function biomassMass(W){let kg=0;for(const e of W.ents)kg+=plantMass(e);for(const v of W.litter)kg+=v;for(const it of W.items)if(it.k==='branch')kg+=it.kg;for(const it of W.hydro?.debris||[])kg+=it.kg||0;return kg+(W.hydro?.debrisOut||0);}
// Dawn integrates the accumulated daylight; water and mineral N limit assimilation.
export function growPlants(W){
  const b=W.bio,solar=b.solarJ;b.solarJ=0;const wx=W.wx;
  for(let i=0;i<W.litter.length;i++)if(W.litter[i]>0){const rot=W.litter[i]*(1-dexp(-.008*Math.max(0,wx.temp+5)/15));W.litter[i]-=rot;b.respiredKg+=rot;W.soilN[i]+=rot*.01;}
  for(const e of W.ents){if(e.liveKg==null)continue;const i=idx(Math.floor(e.x),Math.floor(e.y)),size=e.size||1;
    const leaf=clamp(e.leafKg/Math.max(.01,SP[e.k]?.kind==='tree'?5*size:size),0,1);
    const temp=clamp((wx.temp-2)/16,0,1)*clamp((40-wx.temp)/15,0,1);
    const water=W.hydro?.soil[i]||0,n=W.soilN[i];
    const salt=(W.hydro.saltSoil?.[i]||0)/Math.max(.0001,water),osmotic=1/(1+salt*salt/4);
    const growth=Math.min(solar*Math.min(4,4*size)*.012*leaf*temp*osmotic/18e6,water*2,n/.01);
    e.reserveKg+=growth;b.assimilatedKg+=growth;W.soilN[i]-=growth*.01;
    if(W.hydro){W.hydro.soil[i]-=growth*.5;W.hydro.evap+=growth*.5;}
    const respiration=Math.min(e.reserveKg,e.liveKg*.000002*Math.max(0,wx.temp+5)/15);e.reserveKg-=respiration;b.respiredKg+=respiration;W.soilN[i]+=respiration*.01;
    const stem=Math.min(e.reserveKg*.1,.02*size);e.reserveKg-=stem;e.liveKg+=stem;
    moveLeaves(W,e);
    const dead=Math.min(e.liveKg,(SP[e.k]?.deadKgDay||0)*size);e.liveKg-=dead;e.deadKg=(e.deadKg||0)+dead*.6;W.litter[i]+=dead*.4;
    if(e.shoots!=null){const kg=Math.min(e.reserveKg,Math.max(0,16*size-e.shoots)*.18,Math.max(0,wx.temp-5)*.012*size*.18);e.reserveKg-=kg;e.shoots+=kg/.18;}
    if(e.k==='fern'||e.k==='reeds'){const kg=Math.min(e.reserveKg,Math.max(0,3-(e.n??1))*cropKg(e),Math.max(0,wx.temp-6)*.006*cropKg(e)/(1+(W.traces?.[i]?.wear||0)*.1));e.reserveKg-=kg;e.n=(e.n??1)+kg/cropKg(e);}
  }
}
export function moveLeaves(W,e,oldFall){const target=(SP[e.k]?.kind==='tree'?5:1)*(e.size||1)*(1-(e.fall||0)),i=idx(Math.floor(e.x),Math.floor(e.y));if(target<e.leafKg){W.litter[i]+=e.leafKg-target;e.leafKg=target;}else {const kg=Math.min(e.reserveKg,target-e.leafKg);e.reserveKg-=kg;e.leafKg+=kg;}}
export function moveFruit(W,e,target){const scale=fruitKg(e),kg=(target-(e.fruit||0))*scale;if(kg>0){const got=Math.min(e.reserveKg,kg);e.reserveKg-=got;e.fruit=(e.fruit||0)+got/scale;}else{W.litter[idx(Math.floor(e.x),Math.floor(e.y))]-=kg;e.fruit=target;}}
