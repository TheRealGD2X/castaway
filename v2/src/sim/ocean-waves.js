// Directional wave-action balance. Eight directions, three angular frequencies.
// Action (J s) propagates with group velocity, then wind input, whitecapping,
// bottom friction and depth-limited breaking exchange explicitly logged energy.
import { dsin,dcos,dexp,TAU,clamp } from '../core/dmath.js';
import { hash3 } from '../core/rng.js';
import { RHO,G,ledger,layerVolume } from './ocean-grid.js';
export const PERIODS=[6,10,16],DIRECTIONS=8,BINS=24;
export const OMEGA=PERIODS.map(t=>TAU/t),DIRS=Array.from({length:8},(_,k)=>{const x=dcos(k*TAU/8),y=dsin(k*TAU/8),length=Math.sqrt(x*x+y*y);return[x/length,y/length];});
const caches=new WeakMap();
// Godunov upwind eikonal update: |grad travel| = 1 / phase speed.
// The quadratic reproduces a planar phase front over a uniform seabed.
function arrival(tx,ty,dx,dy,cp,px,py){if(!px)return ty+dy/cp;if(!py)return tx+dx/cp;const a=1/(dx*dx),b=1/(dy*dy),difference=tx-ty,discriminant=(a+b)/(cp*cp)-a*b*difference*difference;if(discriminant<0)return Math.min(tx+dx/cp,ty+dy/cp);const next=(a*tx+b*ty+Math.sqrt(discriminant))/(a+b);return next+1e-12>=Math.max(tx,ty)?next:Math.min(tx+dx/cp,ty+dy/cp);}
export function waveAdd(g,key,amount){g.waveComp??={};const c=g.waveComp,L=g.waveLedger,y=amount-(c[key]||0),n=(L[key]||0)+y;c[key]=(n-(L[key]||0))-y;L[key]=n;}
export function dispersion(period,depth){
 const omega=TAU/period,d=Math.max(.01,depth);let k=omega*omega/G+omega/Math.sqrt(G*d);
 for(let j=0;j<9;j++){const kh=k*d,e=kh>18?0:dexp(-2*kh),t=(1-e)/(1+e),derivative=G*(t+k*d*(1-t*t));k=Math.max(1e-8,k-(G*k*t-omega*omega)/derivative);}
 const kh=k*d,e=kh>18?0:dexp(-2*kh),ratio=kh>18?0:4*kh*e/(1-e*e),cp=omega/k,cg=.5*cp*(1+ratio);return{k,cp,cg,omega};
}
export function wavesInit(g){g.action=new Float64Array(g.n*BINS);g.rayTravel=new Float64Array(g.n*BINS);g.phaseX=new Float64Array(g.n*BINS);g.phaseY=new Float64Array(g.n*BINS);g.waveDepth=Float64Array.from(g.volume,(V,i)=>V/Math.max(1,g.area[i]));g.wavePressure=new Float64Array(g.n);g.foam=new Float64Array(g.n);g.breaking=new Float64Array(g.n);g.waveLedger={windJ:0,boundaryJ:0,nestJ:0,bottomJ:0,whitecapJ:0,breakingJ:0,currentJ:0,initialJ:0};}
export function waveEnergy(g){let E=0;for(let p=0;p<3;p++)for(let k=0;k<8;k++)for(let i=0;i<g.n;i++)E+=g.action[(p*8+k)*g.n+i]*OMEGA[p];return E;}
export function waveHeight(g,i){let E=0;for(let b=0;b<BINS;b++)E+=g.action[b*g.n+i]*OMEGA[Math.floor(b/8)];return 4*Math.sqrt(Math.max(0,E)/Math.max(1,g.area[i])/RHO/G);}
export function waveCache(g){let c=caches.get(g);if(!c){c={k:new Float64Array(g.n*3),cp:new Float64Array(g.n*3),cg:new Float64Array(g.n*3),travel:g.rayTravel,gx:g.phaseX,gy:g.phaseY,version:-1};caches.set(g,c);}if(c.version!==g.waveVersion){for(let i=0;i<g.n;i++)for(let p=0;p<3;p++){const d=g.waveDepth[i],q=dispersion(PERIODS[p],d),at=p*g.n+i;c.k[at]=q.k;c.cp[at]=q.cp;c.cg[at]=q.cg;}c.version=g.waveVersion;}return c;}
export function wavesStep(g,dt,boundary,wind,seed=0){
 for(let i=0;i<g.n;i++)g.waveDepth[i]=g.volume[i]/Math.max(1,g.area[i]);g.waveVersion=(g.waveVersion||0)+1;const c=waveCache(g),n=g.n;g.breaking.fill(0);const dx=g.dx,dy=g.dy,parents=new Map();
 // A falling tide can expose a cell still holding wave action. Its residual
 // energy dissipates on the seabed; it must not disappear from the ledger.
 for(let i=0;i<n;i++)if(g.volume[i]<=g.area[i]*.001){let loss=0;for(let b=0;b<BINS;b++){const at=b*n+i;loss+=g.action[at]*OMEGA[Math.floor(b/8)];g.action[at]=0;}waveAdd(g,'breakingJ',(loss));waveAdd(g,'bedJ',loss);g.bedWaveHeat=(g.bedWaveHeat||0)+loss;g.breaking[i]=loss/Math.max(1,g.area[i]*dt);}
 for(let i=0;i<n;i++){const x=i%g.nx,y=Math.floor(i/g.nx);for(const [axis,sign] of [...(x===0?[[0,-1]]:[]),...(x===g.nx-1?[[0,1]]:[]),...(y===0?[[1,-1]]:[]),...(y===g.ny-1?[[1,1]]:[])]){const bc=boundary(i,axis,sign);if(bc?.grid&&!parents.has(bc.grid))parents.set(bc.grid,{old:Float64Array.from(bc.grid.action),delta:new Float64Array(bc.grid.action.length)});}}
 for(let p=0;p<3;p++)for(let d=0;d<8;d++){
  const b=p*8+d,offset=b*n,[rx,ry]=DIRS[d],sx=rx>=0?1:-1,sy=ry>=0?1:-1,old=new Float64Array(g.action.subarray(offset,offset+n)),bx=new Float64Array(n),by=new Float64Array(n);
  for(let i=0;i<n;i++){const cg=c.cg[p*n+i],speed=Math.max(0,cg+g.u[i]*rx+g.v[i]*ry),wet=g.volume[i]>g.area[i]*.001;bx[i]=wet?Math.abs(rx)*speed:0;by[i]=wet?Math.abs(ry)*speed:0;}
  for(let yy=0;yy<g.ny;yy++)for(let xx=0;xx<g.nx;xx++){
   const x=sx>0?xx:g.nx-1-xx,y=sy>0?yy:g.ny-1-yy,i=y*g.nx+x,at=offset+i;if(!g.area[i]||g.volume[i]<=g.area[i]*.001){g.action[at]=0;continue;}
   const ix=x-sx,iy=y-sy,ox=x+sx,oy=y+sy,inX=ix<0||ix>=g.nx,inY=iy<0||iy>=g.ny,outX=ox<0||ox>=g.nx,outY=oy<0||oy>=g.ny;
   const upX=inX?boundary(i,0,-sx):null,upY=inY?boundary(i,1,-sy):null;
   const ax=inX?(g.closed?0:bx[i]):Math.min(bx[i],bx[i-sx]),ay=inY?(g.closed?0:by[i]):Math.min(by[i],by[i-sy*g.nx]);
   const ex=outX?(g.closed?0:bx[i]):Math.min(bx[i],bx[i+sx]),ey=outY?(g.closed?0:by[i]):Math.min(by[i],by[i+sy*g.nx]);
   const C=parent=>parent?.grid?parents.get(parent.grid).old[b*parent.grid.n+parent.index]/Math.max(1,parent.grid.area[parent.index]):parent?.action?.[b]||0;
   const X=inX?C(upX):g.action[offset+i-sx]/Math.max(1,g.area[i-sx]),Y=inY?C(upY):g.action[offset+i-sy*g.nx]/Math.max(1,g.area[i-sy*g.nx]);
   g.action[at]=(old[i]+dt*g.dy*ax*X+dt*g.dx*ay*Y)/(1+dt*(g.dy*ex+g.dx*ey)/g.area[i]);
   for(const [isIn,rate,bc,width] of [[inX,ax,upX,g.dy],[inY,ay,upY,g.dx]])if(isIn&&rate){const action=dt*width*rate*C(bc);waveAdd(g,'boundaryJ',(action*OMEGA[p]));if(bc?.grid){parents.get(bc.grid).delta[b*bc.grid.n+bc.index]-=action;waveAdd(bc.grid,'nestJ',-(action*OMEGA[p]));}}
   for(const [isOut,rate,axis,sign,width] of [[outX,ex,0,sx,g.dy],[outY,ey,1,sy,g.dx]])if(isOut&&rate){const amount=dt*width*rate*g.action[at]/g.area[i],bc=boundary(i,axis,sign);waveAdd(g,'boundaryJ',-(amount*OMEGA[p]));if(bc?.grid){parents.get(bc.grid).delta[b*bc.grid.n+bc.index]+=amount;waveAdd(bc.grid,'nestJ',(amount*OMEGA[p]));}}
   // Upwind eikonal integration: s . grad(travel)=1/c_phase. Boundary
   // phases use the same absolute coordinates, frequencies and seeded phases.
   const parentPhase=(bc,axis,sign)=>{const parent=bc?.grid;if(!parent)return null;const pc=waveCache(parent),at=b*parent.n+bc.index,X=bc.parentX+ (axis===0?sign*dx:0),Y=bc.parentY+(axis===1?sign*dy:0);return pc.travel[at]+(pc.gx[at]*(X-(bc.index%parent.nx+.5)*parent.dx)+pc.gy[at]*(Y-(Math.floor(bc.index/parent.nx)+.5)*parent.dy))/OMEGA[p];};
   const phaseX=inX?(parentPhase(upX,0,-sx)??((x-sx+.5)*dx*rx+(y+.5)*dy*ry)/c.cp[p*n+i]):c.travel[offset+i-sx],phaseY=inY?(parentPhase(upY,1,-sy)??((x+.5)*dx*rx+(y-sy+.5)*dy*ry)/c.cp[p*n+i]):c.travel[offset+i-sy*g.nx];
   const px=inX||bx[i-sx]>0?Math.abs(rx)/dx:0,py=inY||by[i-sy*g.nx]>0?Math.abs(ry)/dy:0;c.travel[at]=px+py>0?arrival(phaseX,phaseY,dx,dy,c.cp[p*n+i],px,py):((x+.5)*dx*rx+(y+.5)*dy*ry)/c.cp[p*n+i];
  }
 }
 for(const [parent,state] of parents){for(let at=0;at<parent.action.length;at++)parent.action[at]+=state.delta[at];parent.nestVersion=(parent.nestVersion||0)+1;}
 // Refraction moves action between neighbouring direction bins. It is a
 // first-order finite angular discretisation, limited to one sector per step.
 const changes=new Float64Array(n*BINS);
 for(let i=0;i<n;i++){if(g.volume[i]<=g.area[i]*.001)continue;const x=i%g.nx,y=Math.floor(i/g.nx),l=x?i-1:i,r=x<g.nx-1?i+1:i,t=y?i-g.nx:i,bt=y<g.ny-1?i+g.nx:i;
  for(let p=0;p<3;p++){const gradientX=(c.cp[p*n+r]-c.cp[p*n+l])/(dx*(r===l?1:2)),gradientY=(c.cp[p*n+bt]-c.cp[p*n+t])/(dy*(bt===t?1:2));for(let d=0;d<8;d++){const [rx,ry]=DIRS[d],turn=(ry*gradientX-rx*gradientY),at=(p*8+d)*n+i,q=g.action[at]*(1-dexp(-Math.abs(turn)*dt/(TAU/8))),to=(p*8+(d+(turn>=0?1:7))%8)*n+i;changes[at]-=q;changes[to]+=q;}}
 }
 for(let at=0;at<changes.length;at++)g.action[at]+=changes[at];
 for(let i=0;i<n;i++){
  if(!g.area[i]||g.volume[i]<=g.area[i]*.001)continue;const w=wind(i),speed=Math.sqrt(w.u*w.u+w.v*w.v),depth=g.volume[i]/g.area[i];
  // Wind stress power with a 5% wave-generation efficiency; the remaining
  // atmospheric mechanical work is unresolved and explicitly outside the model.
  const input=.05*.0013*1.2*speed*speed*speed*g.area[i]*dt;let normal=0;const weights=[];
  for(let p=0;p<3;p++)for(let d=0;d<8;d++){const [rx,ry]=DIRS[d],align=Math.max(0,(w.u*rx+w.v*ry)/Math.max(.001,speed)),age=c.cp[p*n+i]/Math.max(.5,speed),weight=align*align*align*align/(1+age*age*age*age);weights.push(weight);normal+=weight;}
  if(normal>0){for(let b=0;b<BINS;b++)g.action[b*n+i]+=input*weights[b]/normal/OMEGA[Math.floor(b/8)];waveAdd(g,'windJ',(input));}
  const H=waveHeight(g,i),limit=.78*depth,breakFraction=H>limit?1-limit*limit/(H*H):0;let lostBreak=0,lostOther=0;
  for(let b=0;b<BINS;b++){const at=b*n+i,p=Math.floor(b/8),k=c.k[p*n+i],kd=k*depth,e=kd>18?0:dexp(-2*kd),orbital=kd>18?0:4*e/((1-e)*(1-e)),bottom=1-dexp(-.0008*k*k*orbital*dt),white=1-dexp(-.00002*OMEGA[p]*k*k*H*H*dt);
   const a=g.action[at],bottomA=a*bottom;g.action[at]-=bottomA;const whiteA=g.action[at]*white;g.action[at]-=whiteA;const breakA=g.action[at]*breakFraction;g.action[at]-=breakA;const Eb=bottomA*OMEGA[p],Ew=whiteA*OMEGA[p],Er=breakA*OMEGA[p];waveAdd(g,'bottomJ',(Eb));waveAdd(g,'whitecapJ',(Ew));waveAdd(g,'breakingJ',(Er));lostBreak+=Er;lostOther+=Eb+Ew;
  }
  g.breaking[i]=lostBreak/(g.area[i]*dt);const entrained=(lostBreak+lostOther*.2)*5e-8;g.bubbles[i]+=entrained;ledger(g,'air:bubbles',entrained);
  g.heat[i]+=lostBreak+lostOther;ledger(g,'wave:heat',lostBreak+lostOther);
 }
 // Wave radiation pressure feeds the same resolved circulation. The tensor
 // is reduced to an isotropic shallow-water approximation, not full surf CFD.
 for(let i=0;i<n;i++){const H=waveHeight(g,i);g.wavePressure[i]=RHO*G*H*H/16;}
 // Finite radiation-stress work: the impulse cannot spend more wave energy
 // than this cell contains. Mechanical work is debited from the spectrum;
 // negative work transfers mean-flow kinetic energy back to the waves.
 for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){const i=y*g.nx+x,depth=g.volume[i]/Math.max(1,g.area[i]);if(depth<.05)continue;const l=x?i-1:i,r=x+1<g.nx?i+1:i,t=y?i-g.nx:i,bt=y+1<g.ny?i+g.nx:i,du=-dt*(g.wavePressure[r]-g.wavePressure[l])/(2*dx*RHO*depth),dv=-dt*(g.wavePressure[bt]-g.wavePressure[t])/(2*dy*RHO*depth),mass=RHO*g.volume[i],E=g.wavePressure[i]*g.area[i],a=.5*mass*(du*du+dv*dv),b=mass*(g.u[i]*du+g.v[i]*dv);if(!(E>0)||a===0)continue;let fraction=1;if(a+b>E*.2)fraction=(-b+Math.sqrt(b*b+4*a*E*.2))/(2*a);const work=a*fraction*fraction+b*fraction;g.u[i]+=du*fraction;g.v[i]+=dv*fraction;if(g.faceU){const ux=y*(g.nx+1)+x,vy=y*g.nx+x;g.faceU[ux]+=du*fraction*(x? .5:1);g.faceU[ux+1]+=du*fraction*(x+1<g.nx?.5:1);g.faceV[vy]+=dv*fraction*(y?.5:1);g.faceV[vy+g.nx]+=dv*fraction*(y+1<g.ny?.5:1);}const scale=1-work/E;for(let bin=0;bin<BINS;bin++)g.action[bin*n+i]*=scale;waveAdd(g,'currentJ',(work));}
 // Phase gradients for the renderer are derived from the saved propagation
 // solution; the renderer does not pick a wind direction or invent wave speed.
 phaseGradients(g,c);
}
export function bubblesStep(g,dt){for(let i=0;i<g.n;i++){const depth=g.volume[i]/Math.max(1,g.area[i]);for(let l=1;l<3;l++){const q=l*g.n+i,rise=g.bubbles[q]*(1-dexp(-.1*dt/Math.max(.01,depth*g.fractions[l])));g.bubbles[q]-=rise;g.bubbles[i]+=rise;}const burst=g.bubbles[i]*dt/(90+dt);g.bubbles[i]-=burst;ledger(g,'burst:bubbles',-burst);g.foam[i]=clamp(g.bubbles[i]/Math.max(1e-12,g.area[i]*.005),0,1);}}
export function phaseGradients(g,c=waveCache(g)){for(let b=0;b<BINS;b++)for(let i=0;i<g.n;i++){const at=b*g.n+i,p=Math.floor(b/8),[rx,ry]=DIRS[b%8],x=i%g.nx,y=Math.floor(i/g.nx),l=x&&g.waveDepth[i-1]>.001?i-1:i,r=x+1<g.nx&&g.waveDepth[i+1]>.001?i+1:i,t=y&&g.waveDepth[i-g.nx]>.001?i-g.nx:i,bt=y+1<g.ny&&g.waveDepth[i+g.nx]>.001?i+g.nx:i;c.gx[at]=r!==l?OMEGA[p]*(c.travel[b*g.n+r]-c.travel[b*g.n+l])/((r-l)*g.dx):c.k[p*g.n+i]*rx;c.gy[at]=bt!==t?OMEGA[p]*(c.travel[b*g.n+bt]-c.travel[b*g.n+t])/((bt-t)/g.nx*g.dy):c.k[p*g.n+i]*ry;}return c;}
export function phaseAt(g,b,i,x,y,seconds,seed=0){const c=waveCache(g),offset=b*g.n+i,p=Math.floor(b/8),cx=(i%g.nx+.5)*g.dx,cy=(Math.floor(i/g.nx)+.5)*g.dy;return OMEGA[p]*(c.travel[offset]-seconds)+c.gx[offset]*(x-cx)+c.gy[offset]*(y-cy)+hash3(b,907,seed)*TAU;}
export function stokesDrift(g,i){const c=waveCache(g);if(!c.drift){c.drift=Array.from({length:g.n},()=>({u:0,v:0}));c.driftReady=new Uint8Array(g.n);}if(c.driftWave!==g.waveVersion||c.driftNest!==g.nestVersion){c.driftWave=g.waveVersion;c.driftNest=g.nestVersion;c.driftReady.fill(0);}if(c.driftReady[i])return c.drift[i];let u=0,v=0;for(let b=0;b<BINS;b++){const p=Math.floor(b/8),E=g.action[b*g.n+i]*OMEGA[p]/Math.max(1,g.area[i]),velocity=2*OMEGA[p]*c.k[p*g.n+i]*E/(RHO*G),[x,y]=DIRS[b%8];u+=x*velocity;v+=y*velocity;}const q=c.drift[i];q.u=u;q.v=v;c.driftReady[i]=1;return q;}
