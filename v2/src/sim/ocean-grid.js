// Boussinesq finite-volume ocean. Stored tracers are extensive quantities;
// internal faces debit and credit the same parcel. Three vertical layers share
// a depth-integrated momentum solver. Units: m, s, m3, kg, J, reference rho=1025.
import { clamp, dexp,dcbrt } from '../core/dmath.js';
export const RHO=1025,CP=3990,G=9.81,F=1.22e-4,LAYERS=3;
export const TRACERS=['salt','heat','nutrient','oxygen','carbon','phyto','zoo','juvenile','adult','detritus','sediment','germs','bubbles'];
export const sums=a=>a.reduce((s,v)=>s+v,0);
const scratch=new WeakMap();
export function ledger(g,k,v){const l=g.ledger,c=g.compensation,y=v-(c[k]||0),n=(l[k]||0)+y;c[k]=(n-(l[k]||0))-y;l[k]=n;}
export function layerVolume(g,i,l){return g.volume[i]*g.fractions[l];}
export const temperature=(g,i,l=0)=>g.heat[l*g.n+i]/Math.max(1e-12,RHO*CP*layerVolume(g,i,l));
export const salinity=(g,i,l=0)=>1000*g.salt[l*g.n+i]/Math.max(1e-12,RHO*layerVolume(g,i,l));
// Linear equation of state, not TEOS-10: buoyancy and reduced gravity only.
export const density=(g,i,l=0)=>RHO+.78*(salinity(g,i,l)-35)-.2*(temperature(g,i,l)-10);
export function newGrid(nx,ny,dx,dy,bed,area,seaT=12,fractions=[.2,.3,.5]){
 const n=nx*ny,g={nx,ny,dx,dy,n,fractions,bed:Float64Array.from(bed),area:Float64Array.from(area||Array(n).fill(dx*dy)),volume:new Float64Array(n),eta:new Float64Array(n),u:new Float64Array(n),v:new Float64Array(n),ledger:{},compensation:{},closed:false};
 for(const k of TRACERS)g[k]=new Float64Array(n*LAYERS);
 for(let i=0;i<n;i++){const d=Math.max(0,-bed[i]);g.volume[i]=d*g.area[i];g.eta[i]=bed[i]+d;for(let l=0;l<LAYERS;l++){const q=l*n+i,V=layerVolume(g,i,l);g.salt[q]=V*RHO*.035;g.heat[q]=V*RHO*CP*(seaT-l*1.5);g.nutrient[q]=V*.00008;g.oxygen[q]=V*.008;g.carbon[q]=V*.025;g.phyto[q]=l===0?V*.003:0;g.zoo[q]=l===0?V*.0005:0;g.juvenile[q]=l===0?V*.00003:0;g.adult[q]=l===0?V*.00008:0;g.detritus[q]=V*.0001;}}
 g.initial=totals(g);return g;
}
export function totals(g){const o={water:sums(g.volume)};for(const k of TRACERS)o[k]=sums(g[k]);return o;}
export function gridSave(g){const o={...g};for(const k of ['bed','area','volume','eta','u','v',...TRACERS,'action','kelp','solid','foam','breaking','rayTravel','wavePressure','waveDepth','faceU','faceV','phaseX','phaseY'])if(g[k])o[k]=Array.from(g[k]);return o;}
export function gridLoad(o){const g={...o,ledger:{...o.ledger},compensation:{...o.compensation},fractions:[...o.fractions]};for(const k of ['bed','area','volume','eta','u','v',...TRACERS,'action','kelp','solid','foam','breaking','rayTravel','wavePressure','waveDepth','faceU','faceV','phaseX','phaseY'])if(o[k])g[k]=Float64Array.from(o[k]);return g;}
export function concentration(g,i,k,l){return g[k][l*g.n+i]/Math.max(1e-12,layerVolume(g,i,l));}
function overlap(a,l,b,m){let alo=0,blo=0;for(let j=0;j<l;j++)alo+=a.fractions[j];for(let j=0;j<m;j++)blo+=b.fractions[j];return Math.max(0,Math.min(alo+a.fractions[l],blo+b.fractions[m])-Math.max(alo,blo));}
function boundaryConcentration(b,g,k,l){if(!b.grid)return b[k]?.[l]||0;let c=0;for(let m=0;m<LAYERS;m++)c+=overlap(g,l,b.grid,m)*concentration(b.grid,b.index,k,m);return c/g.fractions[l];}
export function parcel(g,i,k,l,amount){g[k][l*g.n+i]+=amount;}
export function addWater(g,i,V,T=10,S=0,tag='fresh'){
 if(!(V>0)||!g.area[i])return;g.volume[i]+=V;g.eta[i]=g.bed[i]+g.volume[i]/g.area[i];ledger(g,tag+':water',V);const q=i;g.salt[q]+=V*RHO*S/1000;g.heat[q]+=V*RHO*CP*T;ledger(g,tag+':salt',V*RHO*S/1000);ledger(g,tag+':heat',V*RHO*CP*T);
 // Redistribution of layer water requires matching extensive parcels. Move
 // the added water's heat and salt to each layer; other tracer masses stay put.
 for(let l=1;l<LAYERS;l++){const salt=V*RHO*S/1000*g.fractions[l],heat=V*RHO*CP*T*g.fractions[l];g.salt[q]-=salt;g.salt[l*g.n+i]+=salt;g.heat[q]-=heat;g.heat[l*g.n+i]+=heat;}
}
function work(g){let s=scratch.get(g);if(!s){s={faces:[],diag:new Float64Array(g.n),rhs:new Float64Array(g.n),r:new Float64Array(g.n),p:new Float64Array(g.n),z:new Float64Array(g.n),ap:new Float64Array(g.n),out:new Float64Array(g.n),delta:new Float64Array(g.n),du:new Float64Array(g.n),dv:new Float64Array(g.n),weights:new Float64Array(g.n)};scratch.set(g,s);}return s;}
// Semi-implicit free surface. Backward Euler avoids acoustic CFL substeps;
// preconditioned conjugate gradients solve the symmetric pressure matrix.
// Open boundaries supply actual parcels from a parent grid or external ocean.
export function circulation(g,dt,boundary,wind,options={}){
 const s=work(g),{diag,rhs,r,p,z,ap,out,delta,du,dv,weights}=s,n=g.n,faces=s.faces;faces.length=0;out.fill(0);delta.fill(0);du.fill(0);dv.fill(0);weights.fill(0);const weightsV=new Float64Array(n);
 // Prognostic C-grid velocities persist on the actual transport faces.
 // Reconstructing and then averaging cell velocities at each step introduces
 // spurious energy over uneven bathymetry, especially at open boundaries.
 if(!g.faceU){g.faceU=new Float64Array((g.nx+1)*g.ny);g.faceV=new Float64Array(g.nx*(g.ny+1));for(let y=0;y<g.ny;y++)for(let x=0;x<=g.nx;x++)g.faceU[y*(g.nx+1)+x]=x===0?g.u[y*g.nx]:x===g.nx?g.u[y*g.nx+x-1]:(g.u[y*g.nx+x-1]+g.u[y*g.nx+x])/2;for(let y=0;y<=g.ny;y++)for(let x=0;x<g.nx;x++)g.faceV[y*g.nx+x]=y===0?g.v[x]:y===g.ny?g.v[(y-1)*g.nx+x]:(g.v[(y-1)*g.nx+x]+g.v[y*g.nx+x])/2;}
 const massU=new Float64Array(g.faceU.length),massV=new Float64Array(g.faceV.length);
 const face=(i,j,axis,sign=1)=>{
  if(!g.area[i]||(j>=0&&!g.area[j]))return;const b=j<0?boundary(i,axis,sign):null;if(j<0&&(g.closed||!b))return;
  const ei=g.eta[i],ej=j>=0?g.eta[j]:b.eta,bj=j>=0?g.bed[j]:g.bed[i],bottom=Math.max(g.bed[i],bj),depth=Math.max(0,Math.max(ei,ej)-bottom);if(depth<.001)return;
  const length=axis===0?g.dy:g.dx,distance=axis===0?g.dx:g.dy,x=i%g.nx,y=Math.floor(i/g.nx),slot=axis===0?y*(g.nx+1)+x+(j>=0||sign>0?1:0):(y+(j>=0||sign>0?1:0))*g.nx+x;
  const wi=wind(i),wj=j>=0?wind(j):wi,w={u:(wi.u+wj.u)/2,v:(wi.v+wj.v)/2},velocity=axis===0?g.faceU:g.faceV,mass=axis===0?massU:massV,speed=Math.sqrt(w.u*w.u+w.v*w.v),stress=.0013*1.2*speed/RHO/Math.max(.1,depth),drag=1/(1+dt*.0025*Math.abs(velocity[slot])/Math.max(.1,depth));
  velocity[slot]=(velocity[slot]+dt*stress*(axis===0?w.u:w.v))*drag;mass[slot]=depth*g.dx*g.dy;
  const pressure=dt*((wi.pressure||101325)-(j>=0?wj.pressure||101325:b.pressure||101325))/RHO/distance;
  const buoy=j>=0&&g.volume[i]>.001&&g.volume[j]>.001?dt*G*depth*(density(g,i)-density(g,j))/(2*RHO*distance):0;
  const c=G*depth*length/distance*dt*dt;faces.push({i,j,axis,sign,b,q:0,c,length,depth,distance,slot,pressure,buoy});
 };
 for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){const i=y*g.nx+x;if(x+1<g.nx)face(i,i+1,0);else face(i,-1,0,1);if(y+1<g.ny)face(i,i+g.nx,1);else face(i,-1,1,1);if(x===0)face(i,-1,0,-1);if(y===0)face(i,-1,1,-1);}
 // Pair rotations conserve the discrete kinetic energy exactly. Each interior
 // face overlaps four perpendicular dual cells; common-volume weights reduce
 // to f dt / 4 over a flat bed. Fixed-order splitting is first order in time.
 for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++)for(const U of [y*(g.nx+1)+x,y*(g.nx+1)+x+1])for(const V of [y*g.nx+x,(y+1)*g.nx+x]){const mu=massU[U],mv=massV[V];if(!mu||!mv)continue;const rootU=Math.sqrt(mu),rootV=Math.sqrt(mv),z=F*dt*.125*Math.min(mu,mv)/(rootU*rootV),co=(1-z*z)/(1+z*z),si=2*z/(1+z*z),u=g.faceU[U]*rootU,v=g.faceV[V]*rootV;g.faceU[U]=(co*u+si*v)/rootU;g.faceV[V]=(co*v-si*u)/rootV;}
 for(const f of faces)f.q=((f.axis===0?g.faceU[f.slot]:g.faceV[f.slot])*f.sign+f.pressure+f.buoy)*f.depth*f.length*dt;
 for(let i=0;i<n;i++){diag[i]=Math.max(1,g.area[i]);rhs[i]=diag[i]*g.eta[i];}
 for(const f of faces){diag[f.i]+=f.c;rhs[f.i]-=f.q;if(f.j>=0){diag[f.j]+=f.c;rhs[f.j]+=f.q;}else rhs[f.i]+=f.c*f.b.eta;}
 const multiply=(x,y)=>{for(let i=0;i<n;i++)y[i]=diag[i]*x[i];for(const f of faces)if(f.j>=0){y[f.i]-=f.c*x[f.j];y[f.j]-=f.c*x[f.i];}};
 multiply(g.eta,ap);let rz=0;for(let i=0;i<n;i++){r[i]=rhs[i]-ap[i];z[i]=r[i]/diag[i];p[i]=z[i];rz+=r[i]*z[i];}
 const eps=options.tolerance??1e-9,tolerance=eps*eps*Math.max(1,sums(g.area));let iterations=0;
 for(;iterations<(options.iterations??80)&&rz>tolerance;iterations++){
  multiply(p,ap);let pap=0;for(let i=0;i<n;i++)pap+=p[i]*ap[i];if(!(pap>0))break;const alpha=rz/pap;let next=0;
  for(let i=0;i<n;i++){g.eta[i]+=alpha*p[i];r[i]-=alpha*ap[i];z[i]=r[i]/diag[i];next+=r[i]*z[i];}const beta=next/rz;for(let i=0;i<n;i++)p[i]=z[i]+beta*p[i];rz=next;
 }
 g.solver={iterations,residual:Math.sqrt(rz/Math.max(1,sums(g.area)))};
 for(const f of faces){f.q+=f.c*(g.eta[f.i]-(f.j>=0?g.eta[f.j]:f.b.eta));if(f.q>0)out[f.i]+=f.q;else if(f.j>=0)out[f.j]-=f.q;}
 // Limit only a negative NET balance. Through-flow can replenish a donor
 // many times within an implicit step; limiting it to old storage is wrong.
 for(let pass=0;pass<n*2;pass++){delta.fill(0);out.fill(0);for(const f of faces){delta[f.i]-=f.q;if(f.j>=0)delta[f.j]+=f.q;if(f.q>0)out[f.i]+=f.q;else if(f.j>=0)out[f.j]-=f.q;}let limited=false;for(const f of faces){const donor=f.q>=0?f.i:f.j;if(donor>=0&&g.volume[donor]+delta[donor]<-1e-8){f.q*=Math.max(0,(g.volume[donor]+delta[donor]+out[donor])/out[donor]);limited=true;}}if(!limited)break;}
 delta.fill(0);out.fill(0);const incoming=Array.from({length:n},()=>[]),parents=new Set();
 for(const f of faces){const q=f.q;delta[f.i]-=q;if(f.j>=0)delta[f.j]+=q;else if(f.b.grid)parents.add(f.b.grid);if(q>0){out[f.i]+=q;if(f.j>=0)incoming[f.j].push([f.i,q,null]);}else{if(f.j>=0)out[f.j]-=q;incoming[f.i].push([f.j,-q,f.b]);}
  const velocity=q/(dt*f.length*f.depth),value=velocity*f.sign;(f.axis===0?g.faceU:g.faceV)[f.slot]=value;if(f.axis===0){du[f.i]+=value;weights[f.i]++;if(f.j>=0){du[f.j]+=velocity;weights[f.j]++;}}else{dv[f.i]+=value;weightsV[f.i]++;if(f.j>=0){dv[f.j]+=velocity;weightsV[f.j]++;}}
 }
 // Backward-Euler donor-cell tracer transport on the same volume fluxes.
 // Positive M-matrix, solved by deterministic banded LU. Applying the
 // solved FACE transfers preserves the budget, including nested parcels.
 const count=TRACERS.length*LAYERS,C=new Float64Array(n*count),source=new Float64Array(n*count),inverse=new Float64Array(n),row=new Float64Array(count),columns=Array.from({length:count},(_,k)=>({key:TRACERS[k%TRACERS.length],layer:Math.floor(k/TRACERS.length)}));
 for(let i=0;i<n;i++){inverse[i]=1/Math.max(1e-12,g.volume[i]+delta[i]+out[i]);for(let k=0;k<count;k++){const {key,layer}=columns[k],q=i*count+k;C[q]=g[key][layer*n+i]/Math.max(1e-12,g.volume[i]*g.fractions[layer]);source[q]=g[key][layer*n+i]/g.fractions[layer];for(const [j,Q,b] of incoming[i])if(j<0)source[q]+=Q*boundaryConcentration(b,g,key,layer);source[q]*=inverse[i];}}
 // All tracer/layer right-hand sides share ONE transport matrix. Solve them
 // together, avoiding repeated neighbour traversal and property/string work.
 // The nearest-neighbour matrix has bandwidth nx. Deterministic banded
 // LU solves all tracer right-hand sides directly, without an iteration cap
 // that could fail in a thin wet cell with large ten-minute through-flow.
 const band=g.nx,width=2*band+1,matrix=new Float64Array(n*width);
 for(let i=0;i<n;i++){matrix[i*width+band]=1;for(const [j,Q] of incoming[i])if(j>=0)matrix[i*width+band+j-i]-=Q*inverse[i];}
 for(let i=0;i<n;i++){const base=i*width,pivot=matrix[base+band],end=Math.min(n-1,i+band);for(let j=i+1;j<=end;j++){const at=j*width+band+i-j;if(!matrix[at])continue;const factor=matrix[at]/pivot;matrix[at]=factor;for(let k=i+1;k<=end;k++)matrix[j*width+band+k-j]-=factor*matrix[base+band+k-i];}}
 for(let i=0;i<n;i++){const at=i*count,base=i*width;for(let k=0;k<count;k++)C[at+k]=source[at+k];for(let j=Math.max(0,i-band);j<i;j++){const factor=matrix[base+band+j-i];if(!factor)continue;const up=j*count;for(let k=0;k<count;k++)C[at+k]-=factor*C[up+k];}}
 for(let i=n-1;i>=0;i--){const at=i*count,base=i*width;for(let j=i+1;j<=Math.min(n-1,i+band);j++){const factor=matrix[base+band+j-i];if(!factor)continue;const up=j*count;for(let k=0;k<count;k++)C[at+k]-=factor*C[up+k];}const pivot=matrix[base+band];for(let k=0;k<count;k++)C[at+k]/=pivot;}
 g.solver.transportIterations=1;
 for(const f of faces){f.amounts=new Float64Array(count);for(let k=0;k<count;k++){const {key,layer}=columns[k],donor=f.q>=0?f.i:f.j,c=donor>=0?C[donor*count+k]:boundaryConcentration(f.b,g,key,layer);f.amounts[k]=f.q*g.fractions[layer]*c;}}
 // Nested vertical coordinates overlap by fractional depth. A parcel changes
 // coordinate system without inventing a salty/hot surface layer in its parent.
 for(const f of faces)if(f.b?.grid){f.parentAmounts=new Float64Array(count);for(let l=0;l<LAYERS;l++)for(let k=0;k<TRACERS.length;k++){let amount;if(f.q<0)amount=f.q*f.b.grid.fractions[l]*concentration(f.b.grid,f.b.index,TRACERS[k],l);else{amount=0;for(let m=0;m<LAYERS;m++)amount+=f.amounts[m*TRACERS.length+k]*overlap(f.b.grid,l,g,m)/g.fractions[m];}f.parentAmounts[l*TRACERS.length+k]=amount;}}
 for(const f of faces){if(f.j<0){ledger(g,'boundary:water',-f.q);if(f.b.grid){f.b.grid.volume[f.b.index]+=f.q;ledger(f.b.grid,'nest:water',f.q);}}for(let k=0;k<count;k++){const {key,layer}=columns[k],amount=f.amounts[k];g[key][layer*n+f.i]-=amount;if(f.j>=0)g[key][layer*n+f.j]+=amount;else{ledger(g,'boundary:'+key,-amount);if(f.b.grid){const mapped=f.parentAmounts[k];f.b.grid[key][layer*f.b.grid.n+f.b.index]+=mapped;ledger(f.b.grid,'nest:'+key,mapped);}}}}
 for(let i=0;i<n;i++){g.volume[i]+=delta[i];if(g.volume[i]<0&&g.volume[i]>-1e-8)g.volume[i]=0;g.eta[i]=g.bed[i]+g.volume[i]/Math.max(1,g.area[i]);g.u[i]=weights[i]?du[i]/weights[i]:0;g.v[i]=weightsV[i]?dv[i]/weightsV[i]:0;}
 // Parent heights update only after all boundary concentrations were sampled.
 for(const parent of parents)for(let i=0;i<parent.n;i++)parent.eta[i]=parent.bed[i]+parent.volume[i]/Math.max(1,parent.area[i]);
 return faces;
}
// Pairwise implicit diffusion is positive and conserves each extensive field.
export function mixLayers(g,dt,wind){for(let i=0;i<g.n;i++){if(g.volume[i]<=0)continue;for(let l=0;l<2;l++){const a=l*g.n+i,b=a+g.n,V=layerVolume(g,i,l),U=layerVolume(g,i,l+1),unstable=Math.max(0,density(g,i,l)-density(g,i,l+1)),w=wind(i),speed=Math.sqrt(w.u*w.u+w.v*w.v),K=.00001+.000003*speed*speed+unstable*.001,h=Math.max(.1,g.volume[i]/g.area[i]),exchange=dt*K*g.area[i]/Math.max(.1,h*(g.fractions[l]+g.fractions[l+1])/2);
  for(const k of TRACERS){const moved=(g[k][a]/V-g[k][b]/U)*exchange/(1+exchange*(1/V+1/U));g[k][a]-=moved;g[k][b]+=moved;}
 }}}
// Surf dissipation stirs surrounding water before becoming local sensible
// heat. A mixing-length closure K=0.1 (epsilon L^4)^(1/3) transports the same
// finite inventories; it cannot heat a tiny shore cell from an unlimited bath.
export function horizontalMix(g,dt){const face=(i,j,length,distance)=>{if(!g.area[i]||!g.area[j]||g.volume[i]<=.001||g.volume[j]<=.001)return;const di=g.volume[i]/g.area[i],dj=g.volume[j]/g.area[j],epsilon=Math.max((g.breaking?.[i]||0)/RHO/Math.max(.1,di),(g.breaking?.[j]||0)/RHO/Math.max(.1,dj)),L=Math.min(g.dx,g.dy),K=.001+.1*dcbrt(epsilon*L*L*L*L),wet=Math.min(g.area[i],g.area[j])/(g.dx*g.dy),Q=dt*K*length*wet*Math.min(di,dj)/distance;for(let l=0;l<3;l++){const a=l*g.n+i,b=l*g.n+j,V=layerVolume(g,i,l),U=layerVolume(g,j,l),exchange=Q*g.fractions[l];for(const k of TRACERS){const moved=(g[k][a]/V-g[k][b]/U)*exchange/(1+exchange*(1/V+1/U));g[k][a]-=moved;g[k][b]+=moved;}}};for(let y=0;y<g.ny;y++)for(let x=0;x<g.nx;x++){const i=y*g.nx+x;if(x+1<g.nx)face(i,i+1,g.dy,g.dx);if(y+1<g.ny)face(i,i+g.nx,g.dx,g.dy);}}
