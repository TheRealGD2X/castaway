// Shared mechanics for assembled objects. Metres, kilograms and newtons; no object-name abilities.
import { clamp, dexp } from '../core/dmath.js';

export const MAT = {
  poles:   {kg:1.5,density:650,young:6e9,bend:24e6,tension:12e6,joint:3000,seal:0,leak:5,recover:.85},
  withies: {kg:.18,density:600,young:8e8,bend:12e6,tension:4e6,seal:.04,leak:8,recover:.55},
  reeds:   {kg:.25,density:350,young:2e8,bend:3e6,tension:1e6,seal:1.5,leak:4,recover:.5},
  bracken: {kg:.3,density:150,young:1e6,bend:1e5,tension:1e4,seal:1.8,leak:4,recover:.45},
  boughs:  {kg:.4,density:250,young:1e7,bend:3e5,tension:1e5,seal:1.6,leak:4,recover:.5},
  debris:  {kg:.35,density:100,young:1e5,bend:1e4,tension:1e3,seal:1,leak:4,recover:.3},
  mud:     {kg:1,density:1800,young:1e8,bend:8e4,tension:2e4,seal:6,leak:.002,recover:.45},
  stones:  {kg:2,density:2400,young:2e10,bend:5e6,tension:1e6,seal:0,leak:4,recover:.95},
};
const PI=3.141592653589793,dist=(a,b)=>Math.sqrt((a[0]-b[0])*(a[0]-b[0])+(a[1]-b[1])*(a[1]-b[1])+(a[2]-b[2])*(a[2]-b[2]));
export function fitted(s,p) {
  if(p.removed)return 0;
  if(s.stage>p.stage)return 1;if(s.stage<p.stage)return 0;
  const peers=s.assembly.parts.filter(q=>q.stage===p.stage),rank=peers.indexOf(p);
  return clamp((s.prog||0)*peers.length-rank,0,1);
}
export function installed(s,stage) {
  const out={};for(const p of s.assembly.parts)if(stage==null||p.stage===stage)out[p.mat]=(out[p.mat]||0)+p.amount*fitted(s,p);return out;
}
function footprint(points) {
  const sorted=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const lo=[],hi=[];for(const p of sorted){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(let n=sorted.length-1;n>=0;n--){const p=sorted[n];while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}lo.pop();hi.pop();return lo.concat(hi);
}
function inside(poly,x,y) {if(poly.length<3)return false;for(let n=0;n<poly.length;n++){const a=poly[n],b=poly[(n+1)%poly.length];if((b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])<-.000001)return false;}return true;}
export function panelGeometry(p) {
  const [a,b,,d]=p.points,u=b.map((v,k)=>v-a[k]),v=d.map((v,k)=>v-a[k]);
  const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
  const norm=Math.sqrt(cross[0]*cross[0]+cross[1]*cross[1]+cross[2]*cross[2]);
  const c=p.points[2],tri=(b,c)=>{const u=b.map((v,k)=>v-a[k]),v=c.map((v,k)=>v-a[k]),q=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];return Math.sqrt(q[0]*q[0]+q[1]*q[1]+q[2]*q[2])/2;};
  const area=tri(b,c)+tri(c,d);
  return{area,projected:projectedOverlap(p.points,p.points),normal:norm?Math.abs(cross[2])/norm:0,nx:norm?cross[0]/norm:0,ny:norm?cross[1]/norm:0,z:p.points.reduce((v,a)=>v+a[2],0)/4};
}
// Intersection in the ground plane: a roof beside a shelf offers no protection.
export function projectedOverlap(a,b) {
  let poly=footprint(a),clip=footprint(b);
  for(let k=0;k<clip.length&&poly.length;k++){
    const u=clip[k],v=clip[(k+1)%clip.length],side=p=>(v[0]-u[0])*(p[1]-u[1])-(v[1]-u[1])*(p[0]-u[0]),out=[];
    for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length],x=side(p),y=side(q);
      if(x>=0)out.push(p);if((x>=0)!==(y>=0)){const t=x/(x-y);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
    poly=out;
  }
  let area=0;for(let k=0;k<poly.length;k++){const p=poly[k],q=poly[(k+1)%poly.length];area+=p[0]*q[1]-p[1]*q[0];}return Math.abs(area)/2;
}
export function analyse(s) {
  const a=s.assembly,n=a.nodes.length,reach=new Float64Array(n),bond=new Float64Array(n),bars=[],panels=[],shells=[],anchors=[];
  let mass=0,groundMass=0,mx=0,my=0,windArea=0,hanging=0,surface=0,cover=0,waterCapacity=0,catchArea=0,leak=0,jointCapacity=0;
  const wet=s.saturation||0;bond.fill(0);
  for(let k=0;k<n;k++)if(a.nodes[k][2]<=.001)reach[k]=1e9;
  for(const p of a.parts){
    const f=fitted(s,p),life=p.condition??1,m=MAT[p.mat],active=f*life;
    if(f<=0)continue;const kg=p.amount*m.kg*f;
    const pos=p.kind==='bar'?a.nodes[p.a].map((v,k)=>(v+a.nodes[p.b][k])/2):p.center||p.points?.[0]||a.nodes[p.node]||[0,0,0];mass+=kg;mx+=pos[0]*kg;my+=pos[1]*kg;if((p.kind==='stock'||p.kind==='shell')&&pos[2]<.06)groundMass+=kg;
    if(p.kind==='joint'){const cap=p.amount*(m.joint||500)*active*(1-wet*.45)*(p.quality??.85);bond[p.node]+=cap;jointCapacity+=cap;}
    if(p.kind==='bar'){
      const u=a.nodes[p.a],v=a.nodes[p.b],length=Math.max(.05,dist(u,v)),volume=p.amount*m.kg/m.density,r=Math.sqrt(volume/(PI*length));
      const r2=r*r,r3=r2*r,r4=r2*r2,vertical=Math.abs(v[2]-u[2])/length>.7;
      const nominal=vertical?Math.min(m.bend*PI*r2,m.young*PI*r4/4*PI*PI/(length*length)):m.bend*PI*r3/4*4/length;
      bars.push({p,u,v,length,r,nominal,cap:nominal*active*(1-wet*.25)});windArea+=length*r*2*active;
      if(active>0){if(u[2]<=.001)anchors.push(u);if(v[2]<=.001)anchors.push(v);}
    }
    if(p.kind==='panel'){
      const geo=panelGeometry(p),seal=(1-dexp(-p.amount*m.kg/Math.max(.02,geo.area)*m.seal*life))*f;
      panels.push({p,...geo,seal,f:active});windArea+=geo.area*active*(1-geo.normal*.65);
    }
    if(p.kind==='shell'){
      const [w,d,h]=p.size,area=w*d+2*h*(w+d),thick=p.amount*m.kg/m.density/Math.max(.01,area);
      const capacity=Math.max(0,w-thick*2)*Math.max(0,d-thick*2)*Math.max(0,h-thick)*1000*f;
      shells.push({p,w,d,h,capacity,f:active});waterCapacity+=capacity;
      leak+=m.leak*Math.max(.1,area)*(.01/Math.max(.004,thick))+(1-life)*capacity*.2;
      if(p.center[2]<=.05)for(const dx of [-w/2,w/2])for(const dy of [-d/2,d/2])anchors.push([p.center[0]+dx,p.center[1]+dy,0]);
    }
  }
  for(let pass=0;pass<n;pass++)for(const b of bars){const bearing=b.p.amount*MAT[b.p.mat].kg*9.81*.3,transfer=fitted(s,b.p)<.999999?0:Math.min(b.cap,(b.u[2]<=.001)?1e9:bond[b.p.a]+bearing,(b.v[2]<=.001)?1e9:bond[b.p.b]+bearing);reach[b.p.a]=Math.max(reach[b.p.a],Math.min(reach[b.p.b],transfer));reach[b.p.b]=Math.max(reach[b.p.b],Math.min(reach[b.p.a],transfer));}
  for(const q of panels){q.support=q.z<.06?1:clamp((q.p.nodes?.reduce((v,k)=>Math.min(v,reach[k]),1e9)||0)/20,0,1);q.f*=q.support;q.seal*=q.support;}
  const supports=bars.filter(b=>(b.u[2]<=.001)!==(b.v[2]<=.001)),supportCapacity=supports.reduce((v,b)=>v+Math.min(b.cap,reach[b.u[2]<=.001?b.p.b:b.p.a]),0);
  const frameCapacity=Math.min(supportCapacity,jointCapacity+(mass-groundMass)*9.81*.3);
  const foodKg=s.foodBatches?s.foodBatches.reduce((v,b)=>v+b.dryKg+b.waterKg+(b.shellKg||0),0):(s.stock||0)/1800;
  const carried=foodKg+(s.waterL||0)+(s.contactLoad||0)+(s.climate?.boundWaterKg||0)+(s.climate?.condensateKg||0),total=mass+carried;
  const cx=total?(mx+(s.assembly.loadAt?.[0]||0)*carried)/total:0,cy=total?(my+(s.assembly.loadAt?.[1]||0)*carried)/total:0;
  const stable=inside(footprint(anchors),cx,cy)?1:0;
  let surfaceCapacity=0;
  for(const q of panels){
    if(q.z<.15||q.normal<.995)continue;
    const backing=q.p.nodes?.reduce((v,k)=>Math.min(v,reach[k]),1e9)||0;
    const m=MAT[q.p.mat],span=Math.max(.2,dist(q.p.points[0],q.p.points[1])),volume=q.p.amount*m.kg/m.density;
    const cap=q.p.mat==='poles'?m.bend*volume*Math.sqrt(volume/Math.max(.01,q.area))*2/(span*span):m.tension*volume*.05/span;
    const supported=Math.min(backing*4,cap*q.f);surfaceCapacity=Math.max(surfaceCapacity,supported);surface=Math.max(surface,q.projected*q.f*stable*clamp(supported/150,0,1));
    for(const roof of panels)if(roof.z>q.z+.18&&roof.normal>.45)cover=Math.max(cover,roof.seal*Math.min(1,projectedOverlap(roof.p.points,q.p.points)/Math.max(.01,q.projected)));
  }
  for(const b of bars)if(Math.abs(b.u[2]-b.v[2])<.12&&Math.min(b.u[2],b.v[2])>.35&&reach[b.p.a]>25&&reach[b.p.b]>25)hanging+=b.length*fitted(s,b.p)*(b.p.condition??1)*stable;
  for(const shell of shells){
    const [sx,sy,sz]=shell.p.center,mouth=[[sx-shell.w/2,sy-shell.d/2,sz],[sx+shell.w/2,sy-shell.d/2,sz],[sx+shell.w/2,sy+shell.d/2,sz],[sx-shell.w/2,sy+shell.d/2,sz]];
    let openArea=shell.w*shell.d;
    for(const q of panels){const low=q.p.points.filter(p=>p[2]===Math.min(...q.p.points.map(p=>p[2]))),x=low.reduce((v,p)=>v+p[0],0)/low.length,y=low.reduce((v,p)=>v+p[1],0)/low.length;
      if(q.z>sz+shell.h){openArea-=projectedOverlap(q.p.points,mouth)*q.seal;
        if(Math.abs(x-sx)<shell.w/2&&Math.abs(y-sy)<shell.d/2)catchArea+=q.projected*q.seal*stable;}}
    catchArea+=Math.max(0,openArea)*shell.f;
  }
  const capacityN=Math.min(frameCapacity,surfaceCapacity||frameCapacity),maxLoadKg=Math.max(0,capacityN/9.81-(mass-groundMass))*stable;
  const props={mass,stable,maxLoadKg,windArea,capacity:waterCapacity,catchArea,leakL:leak,
    bench:clamp(surface/.5,0,1)*clamp(maxLoadKg/12,0,1),store:clamp(surface/.4,0,1)*clamp(maxLoadKg/5,0,1),storageKg:Math.min(maxLoadKg,surface*30),dry:cover,
    drying:clamp(hanging/2.5,0,1)*clamp(maxLoadKg/3,0,1),hangingMetres:hanging};
  if(a.floor){
    const floorArea=projectedOverlap(a.floor,a.floor),span=Math.sqrt(floorArea),dirs=[[1,0],[0,1],[-1,0],[0,-1]];
    let rain=0,bed=0,bedR=0,fire=1;const wind=[0,0,0,0];
    for(const q of panels){
      if(q.z>.35&&q.normal>.1){rain+=projectedOverlap(q.p.points,a.floor)*q.seal;}
      if(q.normal>.99&&q.z<.35){
        const bulk={bracken:18,boughs:26,debris:15,reeds:20}[q.p.mat];
        if(bulk){const thickness=q.p.amount*MAT[q.p.mat].kg/Math.max(.01,q.area)/bulk;
          const resistance=thickness/(.045+wet*.25)*q.f;bedR=Math.max(bedR,resistance);bed=Math.max(bed,clamp(1-dexp(-resistance*2.5),0,.95));}
      }
      if(Math.abs(q.nx)>.001){const pos=q.p.points[0],hit=pos[0]-(q.ny*(0-pos[1])+q.normal*(.3-pos[2]))/q.nx;
        if(hit>0&&inside(footprint(q.p.points.map(v=>[v[1],v[2]])),0,.3))fire*=1-q.seal;}
      if(q.z>.3)for(let k=0;k<4;k++)wind[k]+=Math.max(0,-(q.nx*dirs[k][0]+q.ny*dirs[k][1]))*q.area*q.seal/Math.max(.1,span*(a.ceiling||1.2));
    }
    Object.assign(props,{bed,bedR});
    if(a.habitat){const seal=clamp(rain/Math.max(.01,floorArea),0,1),shield=wind.map(v=>clamp(v,0,.98));
      const enclosure=shield.reduce((v,q)=>v+q,0)/4;
      Object.assign(props,{rain:seal,wind:Math.max(...shield),windByDir:shield,side:0,fire,workspace:seal*enclosure,indoorFire:seal*enclosure});}
  }
  return{props,bars,panels,shells,loadN:(total-groundMass-(shells.some(q=>q.p.center[2]<.06)?s.waterL||0:0))*9.81,frameCapacity,cx,cy};
}
export const assemblyProps=s=>analyse(s).props;
export function assemblyWork(s,share) {
  const stage=s.stages[s.stage];if(!stage)return true;const had=installed(s,s.stage);
  if(Object.keys(stage.need).some(m=>(s.onsite[m]||0)+(had[m]||0)<stage.need[m]-.000001))return false;
  s.prog=Math.min(1,s.prog+share);const now=installed(s,s.stage);
  for(const m in now){const used=now[m]-(had[m]||0);s.onsite[m]=Math.max(0,(s.onsite[m]||0)-used);s.have[m]=(s.have[m]||0)+used;}
  if(s.prog>=1){s.stage++;s.prog=0;return true;}return false;
}
export function assemblyStep(W,s,dt=10) {
  const x=W.wx;s.saturation=clamp((s.saturation||0)+x.rain*dt*.0002-(.00008+Math.max(0,x.temp)*.000008+(x.sun||0)*.0000001)*dt,0,1);
  const state=analyse(s),wind=.6*x.gust*x.gust*state.props.windArea,snow=(W.surface?.snow||0)*state.panels.reduce((n,p)=>n+p.projected*p.f,0)*9.81;
  let lowest=1;
  for(const p of s.assembly.parts){
    const f=fitted(s,p);if(!f)continue;p.condition??=1;if(p.kind==='stock')continue;
    const bar=state.bars.find(b=>b.p===p),nominal=bar?.nominal|| (p.kind==='joint'?p.amount*(MAT[p.mat].joint||500)*(p.quality??.85):p.kind==='shell'?600:400);
    const force=(state.loadN+wind+snow)/Math.max(1,p.kind==='joint'?s.assembly.parts.filter(p=>p.kind==='joint').length:state.bars.length);
    const strength=nominal*p.condition*(1-s.saturation*.35);
    p.stress=force/Math.max(.1,strength);p.condition=clamp(p.condition-Math.max(0,p.stress-1)*dt*.0005,0,1);
    p.sag=bar?Math.min(.25,force*bar.length*bar.length*bar.length/(48*MAT[p.mat].young*3.14159*bar.r*bar.r*bar.r*bar.r/4+.001))+(1-p.condition)*.12:0;
    lowest=Math.min(lowest,p.condition);
    const M=W.man;if(M?.B.alive&&Math.abs(M.x-s.x)<6&&Math.abs(M.y-s.y)<6){
      M.constructionMemory||={};const key=s.id+':'+p.id,q=M.constructionMemory[key]||(M.constructionMemory[key]={condition:p.condition});
      M.materialBeliefs||={};const belief=M.materialBeliefs[p.mat]||(M.materialBeliefs[p.mat]={upper:1,lower:0,observations:0});
      if(q.condition-p.condition>.00001){belief.upper=Math.min(belief.upper,clamp(force/Math.max(.1,nominal),.25,1));belief.observations++;}
      else if(force>0)belief.lower=Math.max(belief.lower,Math.min(belief.upper,force/Math.max(.1,nominal)));
      // Retain the largest load he personally saw this component carry, rather than
      // counting the same successful load every ten minutes as a new experiment.
      q.carriedN=Math.max(q.carriedN||0,force);q.strained=!!(q.strained||p.stress>1);
      q.condition=p.condition;
    }
  }
  s.integrity=lowest;s.props=assemblyProps(s);
}
export function reclaimPart(s,id) {
  const p=s.assembly.parts.find(p=>p.id===id);if(!p||p.removed)return null;
  const fittedAmount=p.amount*fitted(s,p),recover=fittedAmount*(p.condition??1)*MAT[p.mat].recover;
  s.reclaimed||={};s.discarded||={};s.reclaimed[p.mat]=(s.reclaimed[p.mat]||0)+recover;s.discarded[p.mat]=(s.discarded[p.mat]||0)+fittedAmount-recover;
  p.removed=true;p.condition=0;s.props=assemblyProps(s);return{mat:p.mat,amount:recover};
}
export function startRepair(s,id,inventory) {
  const p=s.assembly.parts.find(p=>p.id===id);if(!p||s.stage<=p.stage&&fitted(s,p)<1)return null;
  s.repairs||={};if(s.repairs[id])return s.repairs[id];
  const amount=-Math.floor(-p.amount);if((inventory[p.mat]||0)<amount)return null;
  inventory[p.mat]-=amount;s.repairs[id]={mat:p.mat,amount,progress:0};return s.repairs[id];
}
export function finishRepair(s,id,inventory) {
  const p=s.assembly.parts.find(p=>p.id===id),piece=s.repairs?.[id];if(!p||!piece||piece.progress<12+p.amount*6)return false;
  const recovered=reclaimPart(s,id);inventory[p.mat]=(inventory[p.mat]||0)+(recovered?.amount||0);
  s.have[p.mat]=(s.have[p.mat]||0)+p.amount;s.onsite[p.mat]=(s.onsite[p.mat]||0)+piece.amount-p.amount;
  p.removed=false;p.condition=1;p.sag=0;p.stress=0;delete s.repairs[id];s.integrity=Math.min(...s.assembly.parts.filter(p=>fitted(s,p)>0).map(p=>p.condition??1),1);s.props=assemblyProps(s);return true;
}
