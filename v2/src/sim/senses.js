// Perception is an observation of a source, not permission to inspect its state.
import { clamp, dexp, dsin, dcos, TAU } from '../core/dmath.js';
import { analyse } from '../build/assembly.js';
import { localWeather, transportOpen } from './atmosphere.js';
const wallCache=new WeakMap();
function walls(W){let c=wallCache.get(W);
  if(c&&c.sites.length===W.structs.length&&c.sites.every((q,i)=>q.s===W.structs[i]&&q.props===q.s.props&&q.stage===q.s.stage&&q.prog===q.s.prog)){c.t=W.t;return c.list;}const list=[];
  for(const s of W.structs||[]){if(!s.assembly)continue;const r=[[1,0],[0,1],[-1,0],[0,-1]][s.dir||0];
    for(const g of analyse(s).panels){if(g.f<.2||g.normal>.2||g.z<.35)continue;const p=g.p.points;let best=0,ends=null;
      for(let i=0;i<p.length;i++)for(let j=i+1;j<p.length;j++){const d=(p[i][0]-p[j][0])*(p[i][0]-p[j][0])+(p[i][1]-p[j][1])*(p[i][1]-p[j][1]);if(d>best){best=d;ends=[p[i],p[j]];}}
      if(ends)list.push({ends:ends.map(q=>[s.x+(q[0]*r[0]-q[1]*r[1])/2,s.y+(q[0]*r[1]+q[1]*r[0])/2]),f:g.f});}
  }wallCache.set(W,{t:W.t,list,sites:(W.structs||[]).map(s=>({s,props:s.props,stage:s.stage,prog:s.prog}))});return list;
}
export function transmission(W,a,b,hearing=false){let gain=1;const dx=b.x-a.x,dy=b.y-a.y,d=Math.sqrt(dx*dx+dy*dy),steps=Math.max(1,Math.floor(d*2));let last=-1;
  for(let k=1;k<steps;k++){const x=a.x+dx*k/steps,y=a.y+dy*k/steps,i=Math.floor(y)*W.MW+Math.floor(x);if(i===last)continue;last=i;
    if(W.treeAt?.[i]){let leaf=0;for(const e of W.grid?.[i]||[])leaf+=e.leafKg||0;gain*=hearing?.85:1/(1+leaf*.15);if(gain<.05)return gain;}}
  for(const w of walls(W)){const [p,q]=w.ends,ex=q[0]-p[0],ey=q[1]-p[1],den=dx*ey-dy*ex;if(Math.abs(den)<1e-9)continue;const px=p[0]-a.x,py=p[1]-a.y,t=(px*ey-py*ex)/den,u=(px*dy-py*dx)/den;if(t>.001&&t<.999&&u>=0&&u<=1)gain*=hearing?1-w.f*.8:1-w.f*.995;}
  return gain;
}
export const visible=(W,a,b)=>transmission(W,a,b)>.12;
export function memoryConfidence(m,t){const mobile=m.k==='dog'||m.k==='warren',resource=m.fruit!=null||m.kg!=null;return dexp(-Math.max(0,t-(m.t||0))/(mobile?120:resource?2880:43200));}
export function odourStep(W){W.odour||={stock:Array(24).fill(0),emitted:0,exported:0,decayed:0};const o=W.odour,nx=6,ny=4,dx=W.MW*2/nx,dy=W.MH*2/ny,cellArea=dx*dy,u=new Float64Array(24),v=new Float64Array(24);
  for(const a of W.animals)if(a.sp==='rabbit'&&!a.dead&&!a.under){const i=Math.floor(a.y/W.MH*ny)*nx+Math.floor(a.x/W.MW*nx);if(i>=0&&i<24){const kg=1e-10;o.stock[i]+=kg/cellArea;o.emitted+=kg;}}
  // Near-ground scent uses the rough-surface logarithmic profile: at 0.5 m,
  // with 0.1 m roughness, ln(0.5/0.1)/ln(10/0.1) is approximately 0.35.
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){const i=y*nx+x,w=localWeather(W,(x+.5)*W.MW/nx,(y+.5)*W.MH/ny);u[i]=(w.u||0)*.35;v[i]=(w.v||0)*.35;}
  const f=transportOpen([o.stock],u,v,nx,ny,dx,dy,60,[0])[0];o.exported+=f.exported*cellArea;
  for(let i=0;i<24;i++){const removed=o.stock[i]*(1-dexp(-1/180));o.stock[i]-=removed;o.decayed+=removed*cellArea;}
}
export function scentTarget(W,a){if(!W.odour)return null;const nx=6,ny=4,cx=Math.floor(a.x/W.MW*nx),cy=Math.floor(a.y/W.MH*ny);let best=1e-13,target=null;
  for(let y=Math.max(0,cy-1);y<=Math.min(ny-1,cy+1);y++)for(let x=Math.max(0,cx-1);x<=Math.min(nx-1,cx+1);x++){const i=y*nx+x,q=W.odour.stock[i];if(q>best){best=q;target={x:(x+.5)*W.MW/nx,y:(y+.5)*W.MH/ny};}}
  return target;
}
export function sensoryStep(W,M){M.senses||={heard:[],lastInvestigated:-1000};const heard=M.senses.heard;for(const a of W.animals){if(a.call?.t!==W.t)continue;const d2=4*((a.x-M.x)*(a.x-M.x)+(a.y-M.y)*(a.y-M.y)),energy=a.call.energyJ/(4*3.141592653589793*Math.max(1,d2))*transmission(W,M,a,true),mask=1e-7*(1+W.wx.wind*W.wx.wind*.1+W.wx.rain);
    if(energy<mask)continue;let oct=0,best=-1;for(let k=0;k<8;k++){const dot=(a.x-M.x)*dcos(k*TAU/8)+(a.y-M.y)*dsin(k*TAU/8);if(dot>best){best=dot;oct=k;}}
    // A bearing with ±22.5° uncertainty; no source coordinates or identity.
    heard.push({t:W.t,kind:a.sp==='gull'?'bird':'dog',bearing:oct,confidence:clamp(energy/(energy+mask),0,1)});
  }M.senses.heard=heard.filter(q=>W.t-q.t<60).slice(-8);
  M.perceptionTime=W.t; // confidence is derived on use; no clockwork rewrite of every old memory
}
