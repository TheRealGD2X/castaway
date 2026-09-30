// Read-only linear wave reconstruction from saved action, frequencies and phase.
// Sample the visible metres, rather than exposing the finite-volume grid in art.
import { coastal } from '../sim/ocean.js';
import { OMEGA,waveCache } from '../sim/ocean-waves.js';
import { RHO,G } from '../sim/ocean-grid.js';
import { hash3 } from '../core/rng.js';
const TAU=Math.PI*2,LUT=Float32Array.from({length:8192},(_,i)=>Math.sin(i*TAU/8192)),sin=x=>LUT[Math.floor(x*8192/TAU)&8191];
const fields=new WeakMap(),modes=new WeakMap();

// Coordinates in each grid are those used by the nested wave boundary phases.
export function oceanPoint(W,x,y,out={}){
 if(x>=0&&y>=0&&x<W.MW*2&&y<W.MH*2){out.g=coastal(W);out.x=x;out.y=y;}
 else {out.x=65000-W.MW+x;out.y=65000-W.MH+y;out.g=W.ocean.grids[1];
  if(out.x<0||out.y<0||out.x>=120000||out.y>=120000){out.x+=480000;out.y+=360000;out.g=W.ocean.grids[0];}
 }return out;
}
function amplitudes(g,spacing){
 let a=modes.get(g);if(a&&a.version===g.waveVersion&&a.nest===g.nestVersion&&a.spacing===spacing)return a.values;
 const c=waveCache(g),values=new Float64Array(g.n*24),limit=TAU/(2*spacing);
 for(let b=0;b<24;b++)for(let i=0;i<g.n;i++){
  const p=Math.floor(b/8),at=b*g.n+i,k=c.k[p*g.n+i],phaseK=Math.hypot(c.gx[at],c.gy[at]);
  if(k<=limit&&phaseK<=limit&&g.area[i]>0&&g.volume[i]>g.area[i]*.001)values[at]=Math.sqrt(Math.max(0,2*g.action[at]*OMEGA[p]/g.area[i]/RHO/G));
 }modes.set(g,{version:g.waveVersion,nest:g.nestVersion,spacing,values});return values;
}
export function oceanSurface(W,seconds,bounds){
 let f=fields.get(W);const version=W.ocean.grids.map(g=>`${g.waveVersion}:${g.nestVersion}`).join('/');
 // Actors share the water renderer's current field without reconstructing it.
 if(!bounds&&f&&f.seconds===seconds&&f.version===version)return f;
 const spacing=bounds?Math.min(4,Math.max(1,Math.ceil(Math.max(bounds.width,bounds.height)/128))):4;
 const originX=bounds?Math.floor(bounds.x/spacing)*spacing:-64,originY=bounds?Math.floor(bounds.y/spacing)*spacing:-64;
 const nx=bounds?Math.ceil((bounds.x+bounds.width-originX)/spacing)+2:W.MW/2+33;
 const ny=bounds?Math.ceil((bounds.y+bounds.height-originY)/spacing)+2:W.MH/2+33;
 if(!f||f.nx!==nx||f.ny!==ny)f={nx,ny,height:new Float32Array(nx*ny),normalX:new Float32Array(nx*ny),normalY:new Float32Array(nx*ny)};
 else if(f.seconds===seconds&&f.version===version&&f.originX===originX&&f.originY===originY&&f.spacing===spacing)return f;
 Object.assign(f,{seconds,version,spacing,originX,originY});fields.set(W,f);
 const temporal=OMEGA.map(w=>-w*seconds),phase=Array.from({length:24},(_,b)=>hash3(b,907,W.seed)*TAU),point={};
 const spectra=W.ocean.grids.map(g=>({g,c:waveCache(g),A:amplitudes(g,spacing)}));
 for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){
  oceanPoint(W,x*spacing+originX,y*spacing+originY,point);const g=point.g,X=point.x,Y=point.y,{c,A}=spectra[W.ocean.grids.indexOf(g)];
  const gx=X/g.dx-.5,gy=Y/g.dy-.5,x0=Math.max(0,Math.min(g.nx-2,Math.floor(gx))),y0=Math.max(0,Math.min(g.ny-2,Math.floor(gy))),fx=Math.max(0,Math.min(1,gx-x0)),fy=Math.max(0,Math.min(1,gy-y0));
  const ids=[y0*g.nx+x0,y0*g.nx+x0+1,(y0+1)*g.nx+x0,(y0+1)*g.nx+x0+1],weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy];let H=0,SX=0,SY=0;
  for(let b=0;b<24;b++){
   let amplitude=0,travel=0,dx=0,dy=0,wet=0;const omega=OMEGA[Math.floor(b/8)];
   for(let q=0;q<4;q++){
    const i=ids[q],weight=weights[q],at=b*g.n+i;amplitude+=A[at]*weight;
    if(g.area[i]>0&&g.volume[i]>g.area[i]*.001){travel+=(c.travel[at]+(c.gx[at]*(X-(i%g.nx+.5)*g.dx)+c.gy[at]*(Y-(Math.floor(i/g.nx)+.5)*g.dy))/omega)*weight;dx+=c.gx[at]*weight;dy+=c.gy[at]*weight;wet+=weight;}
   }
   if(amplitude===0||wet===0)continue;travel/=wet;dx/=wet;dy/=wet;
   const angle=omega*travel+temporal[Math.floor(b/8)]+phase[b],sine=sin(angle),cosine=sin(angle+Math.PI/2);H+=amplitude*sine;SX+=amplitude*dx*cosine;SY+=amplitude*dy*cosine;
  }const i=y*nx+x;f.height[i]=H;f.normalX[i]=SX;f.normalY[i]=SY;
 }return f;
}
export function surfaceAt(f,x,y,out){
 const gx=Math.max(0,Math.min(f.nx-1.000001,(x-f.originX)/f.spacing)),gy=Math.max(0,Math.min(f.ny-1.000001,(y-f.originY)/f.spacing)),ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy,i=iy*f.nx+ix;
 for(const [key,target] of [['height','height'],['normalX','nx'],['normalY','ny']]){const a=f[key];out[target]=a[i]*(1-fx)*(1-fy)+a[i+1]*fx*(1-fy)+a[i+f.nx]*(1-fx)*fy+a[i+f.nx+1]*fx*fy;}return out;
}
