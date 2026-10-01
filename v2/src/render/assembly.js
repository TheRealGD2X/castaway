// Pixel art projected from the very same installed parts used by the mechanics.
// Only material and geometry determine the drawing; object names do not select sprites.
import { sprite, canvas } from './pix.js';
import { OUT,mix } from './palette.js';
import {detailSprite} from './motion.js';
import { fitted, analyse } from '../build/assembly.js';

const cache=new Map(),ramp={poles:['#62432e','#946637','#bf965e','#ddbd85'],withies:['#65492c','#9c7542','#c4a374','#dfc496'],reeds:['#755a2d','#b59647','#dfc27c','#f1db9c'],bracken:['#714c28','#a48142','#d2ad61','#f0d191'],boughs:['#344733','#516742','#799156','#9da572'],debris:['#593e28','#87633a','#b18b55','#c5ad78'],mud:['#624133','#916245','#b8875e','#cea67a'],stones:['#4d5149','#76796a','#a2a28a','#c6bda2']};
export const assemblyMaterials = ramp;
const line=(P,a,b,c,width=1)=>{const grid=P.grid||1,n=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1]),1)*grid);for(let k=0;k<=n;k++)for(let t=0;t<width;t+=1/grid)(P.dot||P.set)(Math.round((a[0]+(b[0]-a[0])*k/n)*grid)/grid+t,Math.round((a[1]+(b[1]-a[1])*k/n)*grid)/grid,c);};
function quad(P,points,paint,f=1) {
  // Two triangles also cover tapered roof bays correctly.
  for(const ids of [[0,1,2],[0,2,3]]){
    const [a,b,c]=ids.map(k=>points[k]),det=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(det)<.1)continue;
    const uv=[[0,0],[1,0],[1,1],[0,1]];
    const grid=P.grid||1;for(let iy=Math.floor(Math.min(a[1],b[1],c[1])*grid);iy<=Math.ceil(Math.max(a[1],b[1],c[1])*grid);iy++)for(let ix=Math.floor(Math.min(a[0],b[0],c[0])*grid);ix<=Math.ceil(Math.max(a[0],b[0],c[0])*grid);ix++){const x=ix/grid,y=iy/grid;
      const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/det,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/det,t=1-u-v;
      if(u<0||v<0||t<0)continue;const s=u*uv[ids[0]][0]+v*uv[ids[1]][0]+t*uv[ids[2]][0],z=u*uv[ids[0]][1]+v*uv[ids[1]][1]+t*uv[ids[2]][1];if(s<=f)(P.dot||P.set)(x,y,paint(s,z,x,y));
    }
  }
}
export function assemblySprite(s) {
  const a=s.assembly,key=JSON.stringify([s.dir,!!s.open,s.stage,Math.floor((s.prog||0)*32),Math.floor((s.saturation||0)*16),Math.floor((s.waterL||0)*2),Math.floor((s.stock||0)/500),a.nodes,a.parts.map(p=>[p.kind,p.mat,p.amount,p.a,p.b,p.node,p.points,p.center,p.size,p.removed,Math.floor((p.condition??1)*16),Math.floor((p.sag||0)*24)])]);
  if(cache.has(key))return cache.get(key);
  const state=analyse(s),ox=64,oy=85,w=128,h=96,rotation=[[1,0],[0,1],[-1,0],[0,-1]][s.dir||0];
  const rotate=p=>[p[0]*rotation[0]-p[1]*rotation[1],p[0]*rotation[1]+p[1]*rotation[0],p[2]];
  const project=p=>{const [x,y,z]=rotate(p);return[ox+x*16+y*8,oy+y*6-z*18];};
  const points=p=>p.kind==='bar'?[a.nodes[p.a],a.nodes[p.b]]:p.points||[p.center||a.nodes[p.node]||[0,0,0]];
  const parts=a.parts.filter(p=>fitted(s,p)>0).slice().sort((p,q)=>{const depth=p=>points(p).reduce((v,x)=>v+rotate(x)[1]-x[2]*.04,0)/points(p).length;return depth(p)-depth(q);});
  const img=detailSprite(w,h,P=>{
    for(const p of parts){const f=fitted(s,p),life=p.condition??1,c=ramp[p.mat],pos=points(p);
      if(p.kind==='bar'){
        const start=pos[0],end=pos[1].map((v,k)=>start[k]+(v-start[k])*f),sag=p.sag||0,mid=start.map((v,k)=>(v+end[k])/2-(k===2?sag:0));
        const width=p.mat==='poles'?Math.max(2,Math.min(4,Math.round(p.amount*3))):1;
        line(P,project(start),project(mid),c[0],width+1);line(P,project(mid),project(end),c[0],width+1);
        const wood=mix(c[1],c[2],Math.max(0,Math.min(1,life)));line(P,project(start),project(mid),wood,width);line(P,project(mid),project(end),wood,width);
        if(width>1){line(P,project(start),project(mid),c[3]);line(P,project(mid),project(end),c[3]);}
      }else if(p.kind==='joint'){
        const [x,y]=project(a.nodes[p.node]);for(let k=0;k<Math.ceil(p.amount*5*f*life);k++)line(P,[x-1,y-2+k],[x+2,y-1+k],k%2?c[1]:c[3]);
      }else if(p.kind==='panel'){
        const q=state.panels.find(q=>q.p===p);if(s.open&&a.habitat&&q.z>.35&&((q.normal>.1)||q.ny*rotation[0]+q.nx*rotation[1]>.1))continue;const fell=q.support<.05,poly=p.points.map(v=>project(fell?[v[0],v[1],.03]:v));
        quad(P,poly,(u,v,x,y)=>{
          if(((Math.floor(x*3)*13+Math.floor(y*3)*7+p.id*19)%67)/67>life)return null;
          if(p.mat==='poles'){const row=Math.floor(v*Math.max(3,p.amount*3));return v*Math.max(3,p.amount*3)-row<.12?c[0]:c[((x+row*3)%11===0)?3:2];}
          if(p.mat==='withies')return ((Math.floor(u*18)+Math.floor(v*12))%2)?c[2]:c[1];
          const straw=Math.floor(u*83),course=Math.floor(v*7),strand=(u*83-straw);
          return c[strand<.18?1:strand>.82?3:((straw+course*3)%11<2?1:2)];
        },f);
        for(let k=0;k<4;k++)if(f>.99)line(P,poly[k],poly[(k+1)%4],k<2?c[3]:c[0]);
      }else if(p.kind==='shell'){
        const [x,y,z]=p.center,[bw,bd,bh]=p.size,rim=[[-bw/2,-bd/2],[bw/2,-bd/2],[bw/2,bd/2],[-bw/2,bd/2]].map(([u,v])=>[x+u,y+v,z+bh*f]);
        const bot=rim.map(v=>[v[0],v[1],z]),top=rim.map(project),base=bot.map(project);
        for(let k=0;k<4;k++)quad(P,[top[k],top[(k+1)%4],base[(k+1)%4],base[k]],()=>c[k%2?1:2]);
        const wet=(s.waterL||0)>0,fill=wet?'#4c9393':c[0];quad(P,top,()=>fill);
        for(let k=0;k<4;k++){line(P,top[k],top[(k+1)%4],c[k<2?3:1],2);}
        if(wet){const mid=project([x,y,z+bh*f]);line(P,[mid[0]-bw*4,mid[1]],[mid[0]+bw*4,mid[1]],'#9cc5b0');}
        if(life<.9){const n=project([x+bw*.2,y+bd/2,z]);line(P,n,[n[0]-2,n[1]-bh*18*f],c[0]);}
      }else if(p.kind==='stock'){
        const [x,y]=project(p.center);for(let n=0;n<Math.min(8,Math.ceil(p.amount*f));n++){const dx=n%4*3-4,dy=Math.floor(n/4)*2;line(P,[x+dx,y+dy],[x+dx+2,y+dy],c[n%2?1:2]);P.set(x+dx+1,y+dy-1,c[3]);}
      }
    }
    // Real food remains on the ground when its supporting surface fails.
    const surface=state.panels.find(p=>p.normal>.995&&p.z>.15&&p.support>.1);
    if(s.stock>0){const p=surface?surface.p.points.reduce((v,q)=>v.map((x,k)=>x+q[k]/4),[0,0,0]):[0,0,.03],[x,y]=project(p);for(let n=0;n<Math.min(4,Math.ceil(s.stock/1000));n++){line(P,[x-5+n*3,y-2],[x-4+n*3,y-2],'#b99162',2);P.set(x-5+n*3,y-3,'#d5bb8b');}}
  },{out:OUT});
  const sp={img,ox,oy,w,h};cache.set(key,sp);if(cache.size>512)cache.delete(cache.keys().next().value);return sp;
}
export function snowOnAssembly(sp,s,snow) {
  const depth=Math.min(3,Math.floor(snow/2));if(!depth)return sp;
  // The upper silhouette receives a thin dusting. Drawings never change the part model.
  const cv=canvas(sp.img.width,sp.img.height),g=cv.getContext('2d');g.drawImage(sp.img,0,0);const im=g.getImageData(0,0,cv.width,cv.height),d=im.data;
  const scale=sp.img.width/(sp.w||sp.img.width);
  for(let x=1;x<cv.width-1;x++)for(let y=1;y<cv.height;y++)if(d[(y*cv.width+x)*4+3]){for(let n=0;n<depth*scale;n++){const i=((y+n)*cv.width+x)*4;if(d[i+3]){d[i]=232-n/scale*10;d[i+1]=237-n/scale*6;d[i+2]=218-n/scale*3;}}break;}
  g.putImageData(im,0,0);return{...sp,img:cv};
}
