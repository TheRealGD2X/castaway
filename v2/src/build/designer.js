// A bounded search over a construction grammar. Targets describe useful physical outcomes, not abilities.
import { assemblyProps, panelGeometry } from './assembly.js';
import { clamp, dceil } from '../core/dmath.js';

export const TARGETS={workbench:{bench:.9},foodStore:{storageKg:5,dry:.85},dryingRack:{drying:.9},rainCollector:{capacity:12,catchArea:1.1}};
export const ASSEMBLED=new Set(Object.keys(TARGETS));
const labels=(need,cover)=>need.capacity?(need.bench?'rain-catching work stand':'clay-lined rain collector'):need.bench&&need.drying?(cover?'covered work rack':'work and drying stand'):need.storageKg?'covered food shelf':need.drying?'lashed drying rack':'wooden work table';
function grammar(need,b,w,height,gauge,cover) {
  const nodes=[],parts=[],stages=[],node=p=>{nodes.push(p);return nodes.length-1;};
  const add=(stage,kind,mat,amount,fields)=>parts.push({id:parts.length,stage,kind,mat,amount,condition:1,...fields});
  const stage=(name,say)=>{stages.push({name,say,need:{},mins:0});return stages.length-1;};
  const framed=!!(need.bench||need.storageKg||need.drying||need.catchArea),depth=need.drying?.55:.65;
  let tops=[],deck=[],base=[],frame;
  if(framed){
    frame=stage('supports','Uprights, crosspieces and lashings carry the load down to the ground.');
    for(const [x,y]of[[-w/2,-depth/2],[w/2,-depth/2],[w/2,depth/2],[-w/2,depth/2]]){
      const a=node([x,y,0]),c=node([x,y,height]);base.push(a);deck.push(c);
      add(frame,'bar','poles',gauge*.65,{a,b:c});add(frame,'joint','withies',gauge*.45,{node:c,quality:clamp(.7+b.skill*.1,.7,.98)});
      if(cover){const z=height+(x<0?.55:.18),r=node([x,y,z]);tops.push(r);add(frame,'bar','poles',gauge*.3,{a:c,b:r});add(frame,'joint','withies',gauge*.2,{node:r,quality:clamp(.7+b.skill*.1,.7,.98)});}else tops.push(c);
    }
    for(let n=0;n<4;n++){add(frame,'bar','poles',gauge*.65,{a:deck[n],b:deck[(n+1)%4]});if(cover)add(frame,'bar','poles',gauge*.3,{a:tops[n],b:tops[(n+1)%4]});}
    if(gauge>1.2)for(const n of [0,2])add(frame,'bar','poles',gauge*.35,{a:base[n],b:deck[(n+1)%4]});
  }
  if(need.bench||need.storageKg){
    const st=stage('surface','A fitted surface distributes the weight across its supports.');
    const z=height,points=[[-w/2,-depth/2,z],[w/2,-depth/2,z],[w/2,depth/2,z],[-w/2,depth/2,z]];
    add(st,'panel',need.bench?'poles':'withies',need.bench?gauge*2.4:gauge*7,{points,nodes:deck});
  }
  if(need.drying){const st=stage('rails','Crossbars leave room for air and warm smoke around hanging food.');
    for(const q of [0,1,2]){const a=node([-w/2,-depth/2+q*depth/2,height]),c=node([w/2,-depth/2+q*depth/2,height]);
      for(const k of [a,c])add(st,'joint','withies',gauge*.3,{node:k,quality:clamp(.7+b.skill*.1,.7,.98)});
      add(st,'bar','poles',gauge*.35,{a,b:c});add(st,'bar','withies',.3,{a:deck[0],b:a});add(st,'bar','withies',.3,{a:deck[1],b:c});}
  }
  if(need.capacity){const st=stage('basin','Stone support and a thick clay lining form a hollow basin.');
    const bw=.52*w,bd=.42,bh=.11,center=[w/2,0,.025];
    add(st,'shell','mud',w*8*gauge,{center,size:[bw,bd,bh]});add(st,'stock','stones',w*6,{center:[w/2,0,0]});
  }
  if(cover){const st=stage('cover','Overlapping material follows the sloping frame; water runs towards its lower edge.');
    const end=need.capacity?w/2:w/2+.08,fall=.37/w,points=[[-w/2-.08,-depth/2-.12,height+.55+.08*fall],[end,-depth/2-.12,height+.55-(end+w/2)*fall],[end,depth/2+.12,height+.55-(end+w/2)*fall],[-w/2-.08,depth/2+.12,height+.55+.08*fall]];
    const mat=b.knows?.reeds?'reeds':b.cover||'bracken';add(st,'panel',mat,w*5*gauge,{points,nodes:tops});
  }
  // Whole gathered units are charged once. Offcuts remain physical parts and can later be reclaimed.
  for(let k=0;k<stages.length;k++){
    const st=stages[k];for(const p of parts.filter(p=>p.stage===k))st.need[p.mat]=(st.need[p.mat]||0)+p.amount;
    for(const m of Object.keys(st.need)){const raw=dceil(st.need[m]),extra=raw-st.need[m];if(extra>.000001)add(k,'stock',m,extra,{center:[0,0,0]});st.need[m]=raw;}
    st.mins=dceil(parts.filter(p=>p.stage===k).reduce((v,p)=>v+p.amount*(p.kind==='panel'?6:p.kind==='shell'?5:3),0)+8);
  }
  return{version:1,nodes,parts,loadAt:need.capacity?[w/2,0]:[0,0],wanted:{...need},label:labels(need,cover),stages};
}
export function compareDesigns(need,b,environment={}) {
  const options=[],covers=[b.cover||'bracken'];
  for(const m of ['reeds','boughs','debris'])if(b.knows?.[m]&&!covers.includes(m))covers.push(m);
  for(const w of [.85,1.1,1.35])for(const h of [.55,.8])for(const gauge of [1,1.5])for(const roof of [false,true])for(const cover of roof?covers:[covers[0]]){
    if((need.catchArea||need.dry)&&!roof)continue;
    const assembly=grammar(need,{...b,cover,knows:{...b.knows,reeds:cover==='reeds'}},w,h,gauge,roof),s={assembly,stage:assembly.stages.length,prog:0,saturation:environment.rain>1?.35:.1},p=assemblyProps(s);
    const shortfall=Object.keys(need).reduce((v,k)=>v+Math.max(0,need[k]- (p[k]||0))/Math.max(.01,need[k])*240,0);
    // His conservative estimate follows the materials carrying this design, not unrelated failures.
    const doubtful=assembly.parts.some(p=>(b.beliefs?.[p.mat]?.upper??1)<1&&(p.kind==='bar'||p.kind==='joint'));
    const predicted=doubtful?assemblyProps({...s,assembly:{...assembly,parts:assembly.parts.map(p=>({...p,condition:(p.kind==='bar'||p.kind==='joint')?(b.beliefs?.[p.mat]?.upper??1):1}))}}):p;
    const materials={};for(const st of assembly.stages)for(const m in st.need)materials[m]=(materials[m]||0)+st.need[m];
    const labour=assembly.stages.reduce((v,st)=>v+st.mins,0)+Object.entries(materials).reduce((v,[m,q])=>v+Math.max(0,q-(b.stock?.[m]||0))*(b.gatherMins?.[m]??5),0);
    const snowArea=assembly.parts.filter(p=>p.kind==='panel').reduce((v,p)=>v+panelGeometry(p).projected,0);
    const requiredKg=Math.max(18,need.capacity||0,need.storageKg||0)+.6*(environment.gust||0)*(environment.gust||0)*p.windArea/9.81+(environment.snowMm||0)*snowArea;
    const safety=Math.max(0,requiredKg-predicted.maxLoadKg)*3;
    const damp=(environment.rain||0)*Math.max(0,1-p.dry)*(need.bench?8:0),v=shortfall+safety+labour*.16+damp;
    options.push({assembly,score:v,labourMinutes:labour,materials,requiredKg,predictedKg:predicted.maxLoadKg,shortfall,protection:p.dry,cover:roof?cover:null});
  }
  return options.sort((a,b)=>a.score-b.score);
}
export function propose(need,b,environment={}) {
  const options=compareDesigns(need,b,environment),best=options[0];if(!best)return null;
  best.assembly.comparison={alternatives:options.length,choices:options.slice(0,3).map(({assembly,score,...q})=>({...q,score,label:assembly.label})),wanted:{...need}};
  return best.assembly;
}
// Preserve already-built objects and their charged material totals. No reconstruction or new resources.
export function legacyAssembly(s) {
  if(!ASSEMBLED.has(s.k))return null;const need=TARGETS[s.k],cover=s.stages.flatMap(st=>Object.keys(st.need)).find(k=>['bracken','boughs','reeds','debris'].includes(k))||'bracken',a=grammar(need,{skill:.7,cover,knows:{reeds:cover==='reeds'}},1.1,.7,1,!!(need.dry||need.catchArea));
  const mapping=s.k==='rainCollector'?{basin:0,supports:1,cover:1}:s.k==='foodStore'?{supports:0,surface:0,cover:1}:{supports:0,surface:1,rails:1};
  for(const p of a.parts){p.stage=mapping[a.stages[p.stage].name]??s.stages.length-1;p.condition=s.integrity??1;
    if(p.mat==='withies'&&!s.stages[p.stage].need.withies){const k=s.stages.findIndex(st=>st.need.withies);if(k>=0)p.stage=k;}}
  for(let k=0;k<s.stages.length;k++){
    for(const mat of Object.keys(s.stages[k].need)){
      const selected=a.parts.filter(p=>p.stage===k&&p.mat===mat),total=selected.reduce((v,p)=>v+p.amount,0),amount=s.stages[k].need[mat];
      if(total)for(const p of selected)p.amount*=amount/total;else a.parts.push({id:a.parts.length,stage:k,kind:'stock',mat,amount,center:[0,0,0],condition:s.integrity??1});
    }
    a.parts=a.parts.filter(p=>p.stage!==k||s.stages[k].need[p.mat]);
  }
  a.parts.forEach((p,i)=>p.id=i);delete a.stages;return a;
}
