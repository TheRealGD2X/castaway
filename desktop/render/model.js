// Read-only projection in metres: +X east, +Z south, +Y up. Original tile=2 m.
import {elevation} from '../../v2/src/sim/geomorph.js';
import {waveCache,OMEGA} from '../../v2/src/sim/ocean-waves.js';
import {RHO,G,concentration,salinity,temperature} from '../../v2/src/sim/ocean-grid.js';
import {hash3} from '../../v2/src/core/rng.js';
export const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
export const seeded=(x,y,s)=>hash3(x,y,s);
export function rawGroundAt(W,x,z){const X=clamp(x/2-.5,0,W.MW-1),Y=clamp(z/2-.5,0,W.MH-1),ix=Math.min(W.MW-2,Math.floor(X)),iy=Math.min(W.MH-2,Math.floor(Y)),fx=X-ix,fy=Y-iy;let h=0;
 for(let q=0;q<4;q++){const i=(iy+(q>>1))*W.MW+ix+(q&1),weight=(q&1?fx:1-fx)*(q>>1?fy:1-fy);let level=W.ter[i]<=1?W.ocean.coastBed[i]+(W.relief?.[i]||0):elevation(W,i);if(W.ter[i]<=1){const g=W.ocean.grids[2],j=Math.floor(Math.floor(i/W.MW)/4)*g.nx+Math.floor(i%W.MW/4);level+=g.bed[j]-(g.baseBed?.[j]??g.bed[j]);}h+=weight*level;}return h;
}
export function nestBlend(W,x,z){const t=[x,W.MW*2-x,z,W.MH*2-z].map(n=>clamp(n/16)),s=t.map(n=>n*n*(3-2*n)),d=t.map(n=>6*n*(1-n)/16);return{w:s[0]*s[1]*s[2]*s[3],dx:(d[0]*s[1]-s[0]*d[1])*s[2]*s[3],dz:(d[2]*s[3]-s[2]*d[3])*s[0]*s[1]};}
export function groundAt(W,x,z){const h=rawGroundAt(W,x,z),tile=Math.floor(clamp(z/2,0,W.MH-1))*W.MW+Math.floor(clamp(x/2,0,W.MW-1));if(W.ter[tile]>1)return h;const {w}=nestBlend(W,x,z);return h*w+shelfBed(W,x,z)*(1-w);}
export function shelfBed(W,x,z){const g=W.ocean.grids[1],X=clamp((65000-W.MW+x)/g.dx-.5,0,g.nx-1),Y=clamp((65000-W.MH+z)/g.dy-.5,0,g.ny-1),ix=Math.min(g.nx-2,Math.floor(X)),iy=Math.min(g.ny-2,Math.floor(Y)),fx=X-ix,fy=Y-iy,i=iy*g.nx+ix;return g.bed[i]*(1-fx)*(1-fy)+g.bed[i+1]*fx*(1-fy)+g.bed[i+g.nx]*(1-fx)*fy+g.bed[i+g.nx+1]*fx*fy;}
// Continuous observation of nested bathymetry: all coastal samples are kept;
// between its boundary and the coarser shelf, interpolate the saved bed fields.
// This does not redefine a grid cell's bed, volume, or physical water depth.
export function seaBed(W,x,z){return x>=0&&z>=0&&x<=W.MW*2&&z<=W.MH*2?groundAt(W,x,z):shelfBed(W,x,z);}
// Quan & Fry (1995), equation 3, at atmospheric pressure. Surface refraction
// uses a representative 550 nm wavelength; clamp only the graphical fit to its
// measured range (0..35 g/kg, 0..30 C, 400..700 nm), never physical inventories.
export function waterIOR(salt,temp,wavelength=550){const S=clamp(salt,0,35),T=clamp(temp,0,30),l=clamp(wavelength,400,700);return 1.31405+(1.779e-4-1.05e-6*T+1.6e-8*T*T)*S-2.02e-6*T*T+(15.868+.01155*S-.00423*T)/l-4382/(l*l)+1.1455e6/(l*l*l);}
export function opticalTexture(g){const data=new Float32Array(g.n*4);for(let i=0;i<g.n;i++)data.set([waterIOR(salinity(g,i,0),temperature(g,i,0)),0,0,0],i*4);return data;}
export function waveTextures(g,seed,spacing=1){const c=waveCache(g),a=new Float32Array(g.n*24*4),b=new Float32Array(a.length),macro=new Float32Array(g.n*4),anchors=new Float64Array(24),first=g.area.findIndex((A,i)=>A>0&&g.volume[i]>A*.001),limit=Math.PI/spacing;for(let bin=0;bin<24;bin++)anchors[bin]=OMEGA[Math.floor(bin/8)]*c.travel[bin*g.n+Math.max(0,first)];for(let i=0;i<g.n;i++){
 macro.set([g.eta[i],g.bed[i],g.foam[i],clamp(concentration(g,i,'sediment',0)*2+concentration(g,i,'phyto',0)*15,0,.7)],i*4);
 for(let bin=0;bin<24;bin++){const at=bin*g.n+i,p=Math.floor(bin/8),cx=(i%g.nx+.5)*g.dx,cy=(Math.floor(i/g.nx)+.5)*g.dy,amplitude=g.area[i]>0&&g.volume[i]>g.area[i]*.001&&c.k[p*g.n+i]<=limit&&Math.hypot(c.gx[at],c.gy[at])<=limit?Math.sqrt(Math.max(0,2*g.action[at]*OMEGA[p]/(g.area[i]*RHO*G))):0;
 const relativePhase=OMEGA[p]*c.travel[at]-anchors[bin],wrapped=((relativePhase%(Math.PI*2))+Math.PI*2)%(Math.PI*2);a.set([amplitude,c.gx[at],c.gy[at],wrapped],at*4);b.set([cx,cy,c.k[p*g.n+i],g.area[i]>0&&g.volume[i]>g.area[i]*.001?1:0],at*4);
 }}return{a,b,macro,anchors};}
export function sunDirection(W,seconds){const ms=W.born+seconds*1000,days=ms/86400000,day=days-365.2425*Math.floor(days/365.2425),decl=23.44*Math.PI/180*Math.sin(Math.PI*2*(284+day)/365),hour=((ms/3600000)%24+24)%24-6.5/15,ha=(hour-12)*Math.PI/12,lat=57*Math.PI/180;
 const x=-Math.cos(decl)*Math.sin(ha),north=Math.cos(lat)*Math.sin(decl)-Math.sin(lat)*Math.cos(decl)*Math.cos(ha),up=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(ha);return{x,y:up,z:-north};}
// Bilinear reconstruction is the same in the CPU observer and GPU vertex stage.
// Amplitude comes from action; phase is extrapolated from each saved ray front.
export function wavePoint(g,x,y,seconds,seed,spacing=1){const c=waveCache(g),X=clamp(x/g.dx-.5,0,g.nx-1),Y=clamp(y/g.dy-.5,0,g.ny-1),ix=Math.min(g.nx-2,Math.floor(X)),iy=Math.min(g.ny-2,Math.floor(Y)),fx=X-ix,fy=Y-iy,ids=[iy*g.nx+ix,iy*g.nx+ix+1,(iy+1)*g.nx+ix,(iy+1)*g.nx+ix+1],weights=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],sx=x/g.dx-.5>0&&x/g.dx-.5<g.nx-1?1/g.dx:0,sy=y/g.dy-.5>0&&y/g.dy-.5<g.ny-1?1/g.dy:0,dx=[-(1-fy)*sx,(1-fy)*sx,-fy*sx,fy*sx],dy=[-(1-fx)*sy,-fx*sy,(1-fx)*sy,fx*sy],limit=Math.PI/spacing;let h=0,wet=0,nx=0,ny=0,wx=0,wy=0;
 for(let q=0;q<4;q++)if(g.area[ids[q]]>0&&g.volume[ids[q]]>g.area[ids[q]]*.001){h+=g.eta[ids[q]]*weights[q];nx+=g.eta[ids[q]]*dx[q];ny+=g.eta[ids[q]]*dy[q];wx+=dx[q];wy+=dy[q];wet+=weights[q];}if(wet<1e-5)return{h:0,nx:0,ny:0,wet};h/=wet;nx=(nx-h*wx)/wet;ny=(ny-h*wy)/wet;
 // Interpolate complex mode amplitudes, not phase angles. Phase wrapping and
 // dry-cell fronts cannot introduce invented high-frequency waves this way.
 for(let b=0;b<24;b++){const p=Math.floor(b/8);for(let q=0;q<4;q++){const i=ids[q],at=b*g.n+i,w=weights[q];if(g.area[i]<=0||g.volume[i]<=g.area[i]*.001||c.k[p*g.n+i]>limit||Math.hypot(c.gx[at],c.gy[at])>limit)continue;const A=Math.sqrt(Math.max(0,2*g.action[at]*OMEGA[p]/g.area[i]/RHO/G)),angle=OMEGA[p]*(c.travel[at]-seconds)+c.gx[at]*(x-(i%g.nx+.5)*g.dx)+c.gy[at]*(y-(Math.floor(i/g.nx)+.5)*g.dy)+hash3(b,907,seed)*Math.PI*2,s=Math.sin(angle),co=Math.cos(angle);h+=A*w*s;nx+=A*(dx[q]*s+w*c.gx[at]*co);ny+=A*(dy[q]*s+w*c.gy[at]*co);}}
 return{h,nx,ny,wet};}
export function waterAt(W,x,z,seconds,spacing=1){const parent=wavePoint(W.ocean.grids[1],65000-W.MW+x,65000-W.MH+z,seconds,W.seed,spacing);if(x<0||z<0||x>W.MW*2||z>W.MH*2)return parent;const child=wavePoint(W.ocean.grids[2],x,z,seconds,W.seed,spacing),{w,dx,dz}=nestBlend(W,x,z),delta=child.h-parent.h;return{h:parent.h+delta*w,nx:parent.nx+(child.nx-parent.nx)*w+delta*dx,ny:parent.ny+(child.ny-parent.ny)*w+delta*dz,wet:parent.wet+(child.wet-parent.wet)*w};}
