// Read-only descriptions of existing physical state. No inventory or simulation updates.
import {MAT,fitted} from '../build/assembly.js';
import {FAMILIES,propsOf} from '../build/build.js';
import {toolProps} from '../sim/tools.js';
const names={poles:'Wooden poles',withies:'Withies',bracken:'Bracken',boughs:'Pine boughs',reeds:'Reeds',debris:'Leaf litter',mud:'Clay and mud',stones:'Stone',axe:'Stone axe',line:'Fishing line',basket:'Woven basket',cord:'Cordage',wrap:'Woven cape',greenPot:'Unfired pot',clayPot:'Fired clay pot',pot:'Bark pot',flake:'Stone flake',drill:'Hand drill',food:'Ready-to-eat food',raw:'Uncooked food',clean:'Boiled water',fuel:'Firewood',kindling:'Kindling',tinder:'Tinder'};
export const objectName=k=>names[k]||k;
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
  if(p.bench>.1)add('Work surface',p.bench>.8?'Firm and usable':'Partly usable');if(p.drying>.1)add('Drying rails',`${number(p.hangingMetres)} metres`);
  if(s.assembly&&!s.assembly.habitat&&p.maxLoadKg>0)add('Estimated extra load',kg(p.maxLoadKg));
  if(s.assembly){for(const part of s.assembly.parts){const f=fitted(s,part);if(!f)continue;const row=materials[part.mat]||(materials[part.mat]={mass:0,condition:1});row.mass+=part.amount*f*MAT[part.mat].kg;row.condition=Math.min(row.condition,part.condition??1);}}
  else for(const [m,n]of Object.entries(s.have||{}))if(MAT[m])materials[m]={mass:n*MAT[m].kg,condition:s.integrity??1};
  return{title:s.label||FAMILIES[s.k]?.label||s.k,fields,materials:Object.entries(materials).map(([m,q])=>({label:objectName(m),value:kg(q.mass),condition:q.condition<.88?'Strained':'Sound'})),onsite:Object.entries(s.onsite||{}).filter(([,n])=>n>.001).map(([m,n])=>({label:objectName(m),value:kg(n*(MAT[m]?.kg||1))})),comparison:s.assembly?.comparison||null};
}
export function toolDetails(M,key){
  const t=M.tools?.[key],p=toolProps(t),fields=[{label:'Material weight',value:kg(p.mass)}];
  if(p.length)fields.push({label:key==='line'?'Line length':'Handle length',value:`${number(p.length)} metres`});
  if(key==='axe'){const radius=t?.parts.find(q=>q.kind==='edge')?.radius||0;fields.push({label:'Cutting edge',value:radius<.0005?'Sharp':radius<.001?'Worn':'Very blunt'},{label:'Wetness',value:percent(t?.wet)});}
  if(key==='line')fields.push({label:'Estimated steady pull limit',value:kg(p.tension/9.81)},{label:'Wetness',value:percent(t?.wet)});
  const parts=(t?.parts||[]).map(q=>({label:q.kind==='edge'?'Stone head':q.kind==='handle'?'Wooden handle':q.kind==='binding'?'Fibre binding':q.kind==='fibre'?'Twisted fibres':'Retained offcut',value:kg(q.kg),condition:(q.condition??1)<.88?'Worn':'Sound'}));
  return{title:objectName(key),fields,materials:parts};
}
