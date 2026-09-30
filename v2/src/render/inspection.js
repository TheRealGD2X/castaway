// Read-only descriptions of existing physical state. No inventory or simulation updates.
import {MAT,fitted} from '../build/assembly.js';
import {FAMILIES,propsOf} from '../build/build.js';
import {toolProps} from '../sim/tools.js';
import {carriedMass} from '../sim/effort.js';
import {foodMass,waterActivity} from '../sim/food.js';
import {LABEL} from '../mind/brain.js';
import {oceanSample} from '../sim/ocean.js';
import {temperature} from '../sim/ocean-grid.js';
import {PERIODS,OMEGA} from '../sim/ocean-waves.js';
const names={poles:'Wooden poles',withies:'Withies',bracken:'Bracken',boughs:'Pine boughs',reeds:'Reeds',debris:'Leaf litter',mud:'Clay and mud',stones:'Stone',axe:'Stone axe',line:'Fishing line',basket:'Woven basket',cord:'Cordage',wrap:'Woven cape',greenPot:'Unfired pot',clayPot:'Fired clay pot',pot:'Bark pot',flake:'Stone flake',drill:'Hand drill',food:'Ready-to-eat food',raw:'Uncooked food',clean:'Boiled water',fuel:'Firewood',kindling:'Kindling',tinder:'Tinder'};
export const objectName=k=>names[k]||k;
const marineNumber=n=>n>0&&n<.001?'<0.001':Number((n||0).toFixed(3)).toLocaleString('en-GB');
const number=n=>Number((n||0).toFixed(1)).toLocaleString('en-GB'),percent=n=>`${Math.round(Math.max(0,Math.min(1,n||0))*100)}%`;
const kg=n=>n>0&&n<.1?`${Math.round(n*1000)} grams`:`${number(n)} kg`,litres=n=>`${number(n)} litres`;
export function inventoryRows(M){return Object.entries(M.inv).filter(([k,n])=>n>.001&&!(k==='pot'&&M.inv.clayPot)).map(([key,n])=>({key,label:objectName(key),value:['food','raw'].includes(key)?`${Math.round(n)} kcal`:key==='clean'?litres(n):MAT[key]?kg(n*MAT[key].kg):['fuel','kindling','tinder'].includes(key)?kg(n):['axe','line','basket','wrap','greenPot','clayPot','pot','flake','drill'].includes(key)?'Made by Tomas':`${number(n)} pieces`,tool:!!M.tools?.[key]}));}
export function structureDetails(s){
  const p=propsOf(s),fields=[],materials={};
  const add=(label,value)=>fields.push({label,value});
  add('Construction',s.stage>=s.stages.length?'Complete':`${s.stages[s.stage].name} · ${Math.round((s.prog||0)*100)}% of this stage`);
  add('Condition',(s.integrity??1)<.5?'Heavily damaged':(s.integrity??1)<.88?'Needs repair':'Sound');
  if(p.rain)add('Rain kept off',percent(p.rain));if(p.wind)add('Best wind protection',percent(p.wind));if(p.bed)add('Ground insulation',percent(p.bed));
  if(p.capacity>0){add('Water held',`${litres(s.waterL)} / ${litres(p.capacity)}`);add('Collecting surface',`${number(p.catchArea)} m²`);}
  if(p.channelDepth>0)add('Cut depth',`${number(p.channelDepth*100)} cm`);if(p.crest>0)add('Stone crest',`${number(p.crest*100)} cm`);
  if(s.spoilKg>0)add('Excavated soil',kg(s.spoilKg));if(s.depositedKg>0)add('Settled sediment',kg(s.depositedKg));
  if(s.stock>0)add('Stored food',`${Math.round(s.stock)} kcal`);
  if(s.climate){add('Air inside',`${number(s.climate.airT)} °C`);add('Walls and bedding',`${number(s.climate.wallT)} °C`);add('Humidity inside',percent(s.climate.hum));if(s.climate.condensateKg>.001)add('Condensation',`${number(s.climate.condensateKg*1000)} grams`);if(s.climate.boundWaterKg>.01)add('Water in the cover',kg(s.climate.boundWaterKg));}
  if(p.bench>.1)add('Work surface',p.bench>.8?'Firm and usable':'Partly usable');if(p.drying>.1)add('Drying rails',`${number(p.hangingMetres)} metres`);
  if(s.assembly&&!s.assembly.habitat&&p.maxLoadKg>0)add('Estimated extra load',kg(p.maxLoadKg));
  if(s.assembly){for(const part of s.assembly.parts){const f=fitted(s,part);if(!f)continue;const row=materials[part.mat]||(materials[part.mat]={mass:0,condition:1});row.mass+=part.amount*f*MAT[part.mat].kg;row.condition=Math.min(row.condition,part.condition??1);}}
  else for(const [m,n]of Object.entries(s.have||{}))if(MAT[m])materials[m]={mass:n*MAT[m].kg,condition:s.integrity??1};
  return{title:s.label||FAMILIES[s.k]?.label||s.k,fields,materials:Object.entries(materials).map(([m,q])=>({label:objectName(m),value:kg(q.mass),condition:q.condition<.88?'Strained':'Sound'})),onsite:Object.entries(s.onsite||{}).filter(([,n])=>n>.001).map(([m,n])=>({label:objectName(m),value:kg(n*(MAT[m]?.kg||1))})),comparison:s.assembly?.comparison||null};
}
export function batchRows(M){return(M.foodBatches||[]).map(b=>({label:b.kind,value:`${kg(foodMass(b))} · ${Math.round(b.kcal)} kcal · ${b.raw?'uncooked':waterActivity(b)<.85?'dried':'ready'} · ${number(b.temp)} °C${(b.decay||0)>.2?' · smells stale':''}`}));}
export function effortRows(M){const rows=[{label:'Weight carried',value:kg(carriedMass(M))}];const most=Object.entries(M.experience||{}).filter(([,e])=>e.n>=2).sort((a,b)=>b[1].n-a[1].n).slice(0,3);for(const [key,e]of most)rows.push({label:LABEL[key]||key.replace('get_','Gathering ').replace(/_/g,' '),value:`${e.n} completed tries · last took ${Math.round(e.last.actual)} min (expected ${Math.round(e.last.predicted)})`});return rows;}
export function animalDetails(a){const b=a.body;return{title:a.name||a.sp,fields:[{label:'Doing',value:a.act||'resting'},...(b?[{label:'Body temperature',value:`${number(b.core)} °C`},{label:'Energy reserves',value:`${Math.round(b.reserve*4000)} kcal`},{label:'Digesting',value:`${Math.round(b.gut*4000)} kcal`},{label:'Age',value:`${Math.floor(b.ageDays)} days`},{label:'Thirst',value:a.thirst>.7?'Very thirsty':a.thirst>.35?'Thirsty':'Comfortable'},{label:'Injury',value:b.injury>.1?'Healing':'No apparent injury'}]:[])]};}
export function oceanDetails(W,x,y){const q=oceanSample(W,x,y),g=q.g,i=q.i,energy=PERIODS.map((_,p)=>{let E=0;for(let d=0;d<8;d++)E+=g.action[(p*8+d)*g.n+i]*OMEGA[p];return E;}),peak=energy.indexOf(Math.max(...energy));return{title:'The ocean',fields:[{label:'Water depth',value:`${number(q.depth)} metres`},{label:'Surface temperature',value:`${number(q.temp)} °C`},{label:'Middle / bottom water',value:`${number(temperature(g,i,1))} / ${number(temperature(g,i,2))} °C`},{label:'Salt content',value:`${number(q.salinity)} g/kg`},{label:'Current speed',value:`${marineNumber(Math.sqrt(q.u*q.u+q.v*q.v))} m/s`},{label:'Significant wave height',value:`${marineNumber(q.wave)} metres`},{label:'Peak wave period',value:`${PERIODS[peak]} seconds`},{label:'Dissolved oxygen',value:`${number(q.oxygen)} mg/L`},{label:'Suspended sediment',value:`${number(q.sediment*1000)} mg/L`},{label:'Plankton',value:`${number(q.plankton*1000)} g/m³`},{label:'Surface foam',value:percent(q.foam)}]};}
export function sensoryRows(M){const q=M.senses?.heard.at(-1);if(!q)return[];return[{label:'Last heard',value:`A ${q.kind}, towards the ${['east','south-east','south','south-west','west','north-west','north','north-east'][q.bearing]}`}];}
export function toolDetails(M,key){
  const t=M.tools?.[key],p=toolProps(t),fields=[{label:'Material weight',value:kg(p.mass)}];
  if(p.length)fields.push({label:key==='line'?'Line length':'Handle length',value:`${number(p.length)} metres`});
  if(key==='axe'){const radius=t?.parts.find(q=>q.kind==='edge')?.radius||0;fields.push({label:'Cutting edge',value:radius<.0005?'Sharp':radius<.001?'Worn':'Very blunt'},{label:'Wetness',value:percent(t?.wet)});}
  if(key==='line')fields.push({label:'Estimated steady pull limit',value:kg(p.tension/9.81)},{label:'Wetness',value:percent(t?.wet)});
  const parts=(t?.parts||[]).map(q=>({label:q.kind==='edge'?'Stone head':q.kind==='handle'?'Wooden handle':q.kind==='binding'?'Fibre binding':q.kind==='fibre'?'Twisted fibres':'Retained offcut',value:kg(q.kg),condition:(q.condition??1)<.88?'Worn':'Sound'}));
  return{title:objectName(key),fields,materials:parts};
}
