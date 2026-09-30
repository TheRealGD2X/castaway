// Dissolved C/N/O2 and organic dry kg share the water transport. Carbon and
// nitrogen conversions are finite; photosynthesis draws energy from sunlight.
import { clamp,dexp } from '../core/dmath.js';
import { layerVolume,temperature,salinity,ledger } from './ocean-grid.js';
export const ORGANIC=['phyto','zoo','juvenile','adult','detritus'];
export function marineInit(g){g.kelp=new Float64Array(g.n);for(let i=0;i<g.n;i++){const d=g.volume[i]/Math.max(1,g.area[i]);if(d>1&&d<12)g.kelp[i]=g.area[i]*.015;}g.organicInitial=organic(g);g.carbonInitial=carbon(g);g.nitrogenInitial=nitrogen(g);}
export const organic=g=>ORGANIC.reduce((s,k)=>s+g[k].reduce((a,v)=>a+v,0),g.kelp.reduce((a,v)=>a+v,0));
export const carbon=g=>g.carbon.reduce((s,v)=>s+v,0)+organic(g)*.4;
export const nitrogen=g=>g.nutrient.reduce((s,v)=>s+v,0)+organic(g)*.01;
export function ecologyStep(g,dt,weather){
 for(let i=0;i<g.n;i++){if(g.volume[i]<=g.area[i]*.001)continue;const d=g.volume[i]/g.area[i],w=weather(i),area=g.area[i];
  for(let l=0;l<3;l++){const q=l*g.n+i,V=layerVolume(g,i,l),T=temperature(g,i,l),S=salinity(g,i,l),thermal=clamp((T+2)/20,0,1),salt=clamp(1-Math.abs(S-33)/33,0,1),turbidity=g.sediment[q]/Math.max(1e-12,V),light=Math.max(0,w.sun||0)*dexp(-(.12+turbidity*.5)*d*(l===0?.1:l===1?.35:.75));
   const gross=Math.min(light*area*.006*dt/18e6*thermal*salt,g.nutrient[q]/.01,g.carbon[q]/.4);g.nutrient[q]-=gross*.01;g.carbon[q]-=gross*.4;g.phyto[q]+=gross;g.oxygen[q]+=gross*1.067;ledger(g,'biology:production',gross);
   const respire=(k,rate)=>{const kg=Math.min(g[k][q]*(1-dexp(-rate*dt*thermal)),g.oxygen[q]/1.067);g[k][q]-=kg;g.carbon[q]+=kg*.4;g.nutrient[q]+=kg*.01;g.oxygen[q]-=kg*1.067;ledger(g,'biology:respiration',kg);};
   respire('phyto',1.7e-7);respire('zoo',3e-8);respire('juvenile',3e-8);respire('adult',2e-8);respire('detritus',2e-7);
   const feed=(prey,predator,rate,efficiency)=>{const meal=Math.min(g[prey][q],g[predator][q]*rate*dt*thermal,g.oxygen[q]/(.2*1.067));g[prey][q]-=meal;g[predator][q]+=meal*efficiency;g.detritus[q]+=meal*(.8-efficiency);g.carbon[q]+=meal*.2*.4;g.nutrient[q]+=meal*.2*.01;g.oxygen[q]-=meal*.2*1.067;ledger(g,'biology:respiration',meal*.2);};
   feed('phyto','zoo',2e-6,.3);feed('zoo','juvenile',8e-7,.25);feed('zoo','adult',5e-7,.2);
   const mature=g.juvenile[q]*(1-dexp(-dt/(120*86400))),eggs=g.adult[q]*(1-dexp(-dt/(365*86400)))*thermal;g.juvenile[q]+=eggs-mature;g.adult[q]+=mature-eggs;
   // Environmental mortality transfers existing tissue into detritus.
   const oxygen=g.oxygen[q]/V,hazard=(1-salt)*2e-6+Math.max(0,.003-oxygen)*.001;for(const k of ['phyto','zoo','juvenile','adult']){const dead=g[k][q]*(1-dexp(-hazard*dt));g[k][q]-=dead;g.detritus[q]+=dead;}
   if(l===0){const saturation=Math.max(.004,.011-T*.00018-S*.00004),transfer=(saturation-g.oxygen[q]/V)*area*.00001*(1+Math.sqrt(w.u*w.u+w.v*w.v)) *dt,oxygen=Math.max(-g.oxygen[q],transfer);g.oxygen[q]+=oxygen;ledger(g,'air:oxygen',oxygen);
    // CO2 gas transfer has an explicitly prescribed atmospheric equilibrium.
    const exchange=(.025-g.carbon[q]/V)*area*.0000008*dt,C=Math.max(-g.carbon[q],exchange);g.carbon[q]+=C;ledger(g,'air:carbon',C);
   }
   const decay=g.germs[q]*(1-dexp(-dt/86400));g.germs[q]-=decay;ledger(g,'decay:germs',-decay);
  }
  if(d<20){const q=2*g.n+i,light=Math.max(0,w.sun||0)*dexp(-.15*d),thermal=clamp((temperature(g,i,2)+2)/20,0,1),growth=Math.min(light*area*.008*dt/18e6*thermal*Math.max(0,1-g.kelp[i]/Math.max(.001,area*.4)),g.carbon[q]/.4,g.nutrient[q]/.01);g.kelp[i]+=growth;g.carbon[q]-=growth*.4;g.nutrient[q]-=growth*.01;g.oxygen[q]+=growth*1.067;ledger(g,'biology:production',growth);const shed=g.kelp[i]*(1-dexp(-dt/8640000));g.kelp[i]-=shed;g.detritus[q]+=shed;}
 }
}
export function takeMarine(g,i,k,kg,tag='harvest'){
 const q=i,n=Math.min(Math.max(0,kg),g[k][q]);g[k][q]-=n;ledger(g,tag+':'+k,-n);return n;
}
