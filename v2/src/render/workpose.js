// Presentation reads the physical task and installed geometry. It never advances work.
import {fitted,panelGeometry} from '../build/assembly.js';
import {toolProps} from '../sim/tools.js';
const craftTime={cord:35,basket:70,line:45,axe:70,wrap:100,greenPot:55};
export function workPose(W,M,position=M){
  const a=M?.act;if(!W||!M)return{};
  if(M.pose==='walk'){
    if(M.inv.stones>0)return{tool:'stones',two:true,loadKg:M.inv.stones*2,carry:true};
    if(M.inv.poles>0)return{tool:'pole',two:true,loadKg:M.inv.poles*1.5,carry:true};
    if(M.inv.basket&&((M.inv.food||0)+(M.inv.raw||0)>400))return{tool:'basket',two:true,loadKg:((M.inv.food||0)+(M.inv.raw||0))/1800+.8,carry:true};
    return{};
  }
  if(!a||a.st?.phase==='go')return{};
  const s=W.structs.find(s=>s.id===a.t?.sid);
  let part=null,local=null;
  if(s?.assembly&&(a.a.startsWith('build_')||a.a==='repairPart')){
    const parts=s.assembly.parts.filter(p=>p.stage===s.stage),rank=Math.min(parts.length-1,Math.floor((s.prog||0)*parts.length));
    part=a.a==='repairPart'?s.assembly.parts.find(p=>p.id===a.t.pid):parts[rank];
    if(part?.kind==='bar')local=s.assembly.nodes[part.a].map((v,k)=>(v+s.assembly.nodes[part.b][k])/2);
    else if(part?.kind==='panel')local=part.points.reduce((v,p)=>v.map((n,k)=>n+p[k]/4),[0,0,0]);
    else if(part)local=part.center||s.assembly.nodes[part.node]||[0,0,0];
  }else if(['weave','whittle','potter'].includes(M.pose)){
    const bench=W.structs.find(q=>q.assembly&&(q.props?.bench||0)>.2&&Math.abs(q.x-M.x)<2&&Math.abs(q.y-M.y)<2);
    if(bench){const surface=bench.assembly.parts.find(p=>p.kind==='panel'&&fitted(bench,p)>0&&panelGeometry(p).normal>.995&&panelGeometry(p).z>.15);
      if(surface){const q=surface.points.reduce((v,p)=>v.map((n,k)=>n+p[k]/4),[0,0,0]);return contact(bench,q,{stance:'stand',workpiece:piece(M),tool:M.pose==='whittle'?'flake':M.pose==='weave'?'cord':null});}}
    return{workpiece:piece(M)};
  }
  if(local&&part){const weave=part.kind==='joint'||part.mat==='withies',cover=['reeds','bracken','boughs','debris'].includes(part.mat);
    return contact(s,local,{stance:local[2]<.55?'kneel':'stand',motion:weave?'saw':part.mat==='mud'?'stir':'lift',two:true,
      tool:weave?'cord':cover?'bundle':part.kind==='bar'?'pole':part.mat==='mud'?'clay':null,loadKg:Math.min(6,part.amount*(part.mat==='poles'?1.5:.3))});}
  if(s?.earthwork&&M.pose==='build')return{stance:'kneel',work:[9,-2],motion:'scoop',tool:null,two:true};
  if(a.a==='lineFish')return{tool:'line',two:true,lineEnd:[(a.t.x-position.x)*16*(position.face||M.face||1),(a.t.y-position.y)*16],motion:'rest'};
  if((a.a==='get_poles'||a.a==='get_withies')&&M.inv.axe)return{tool:'axe',motion:'strike',stance:'stand',work:[8,-8],toolLength:toolProps(M.tools?.axe).length||.42};
  return{};
  function contact(site,q,extra){const r=[[1,0],[0,1],[-1,0],[0,-1]][site.dir||0],x=q[0]*r[0]-q[1]*r[1],y=q[0]*r[1]+q[1]*r[0];
    const dx=(site.x-position.x)*16+x*16+y*8,dy=(site.y-position.y)*16+y*6-q[2]*18;
    return{...extra,work:[Math.max(-10,Math.min(14,dx*(position.face||M.face||1))),Math.max(-29,Math.min(-1,dy))],lean:undefined};}
}
function piece(M){const entry=Object.entries(M.workpieces||{}).find(([,p])=>p.paid);return entry?{kind:entry[0],progress:Math.min(1,entry[1].progress/(craftTime[entry[0]]||70))}:null;}
