import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {load,save} from '../../v2/src/sim/world.js';
import {newGrid,RHO,G} from '../../v2/src/sim/ocean-grid.js';
import {wavesInit,waveCache,OMEGA,phaseAt} from '../../v2/src/sim/ocean-waves.js';
import {wavePoint,waveTextures,waterAt,groundAt,sunDirection,waterIOR,opticalTexture} from '../render/model.js';
import {moonAt} from '../render/lighting.js';
import {coordinates,oceanPlane} from '../render/mesh.js';
const near=(a,b,t=1e-6)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b} (tolerance ${t})`);
const g=newGrid(8,8,8,8,Array(64).fill(-15));wavesInit(g);g.waveVersion=1;
const c=waveCache(g),A=.35,omega=OMEGA[1],k=c.k[g.n],seed=1404719350;
// A uniform monochromatic field has known energy, phase speed and normal.
for(let i=0;i<g.n;i++){g.action[8*g.n+i]=A*A*RHO*G*g.area[i]/(2*omega);g.rayTravel[8*g.n+i]=(i%8+.5)*8*k/omega;g.phaseX[8*g.n+i]=k;}
const t=4319999.2,point=wavePoint(g,28,28,t,seed),phi=phaseAt(g,8,27,28,28,t,seed);
near(point.h,A*Math.sin(phi),1e-8);near(point.nx,A*k*Math.cos(phi),1e-8);near(point.ny,0);
near(wavePoint(g,28,28,t+10,seed).h,point.h,1e-8);
const packed=waveTextures(g,seed),energy=g.action[8*g.n+27]*omega;near(packed.a[(8*g.n+27)*4]**2*RHO*G*g.area[27]/2,energy,energy*2e-7); // Float32 atlas encoding
const epsilon=.0001;
near((wavePoint(g,27.3+epsilon,29.7,t,seed).h-wavePoint(g,27.3-epsilon,29.7,t,seed).h)/(2*epsilon),wavePoint(g,27.3,29.7,t,seed).nx,1e-5);
g.volume.fill(0);assert.deepEqual(wavePoint(g,28,28,t,seed),{h:0,nx:0,ny:0,wet:0});
const fixture=JSON.parse(await fs.readFile(new URL('baseline.json',import.meta.url),'utf8')),W=load(fixture.checkpoint.blob,fixture.checkpoint.thoughts),before=save(W),hash=s=>createHash('sha256').update(s).digest('hex');
for(const [x,z]of [[.01,20],[15.7,25.7],[8,8],[12,12],[W.MW*2-8,8],[30.3,9.7],[220.3,100.1],[250,210]]){
 const p=waterAt(W,x,z,W.t*60+3.2);assert.ok(Object.values(p).every(Number.isFinite));
 if(p.wet>.1){near((waterAt(W,x+epsilon,z,W.t*60+3.2).h-waterAt(W,x-epsilon,z,W.t*60+3.2).h)/(2*epsilon),p.nx,1e-5);near((waterAt(W,x,z+epsilon,W.t*60+3.2).h-waterAt(W,x,z-epsilon,W.t*60+3.2).h)/(2*epsilon),p.ny,1e-5);}
}
for(const [x,z,dx,dz]of [[0,20,1,0],[W.MW*2,40,1,0],[30,0,0,1],[70,W.MH*2,0,1]]){const a=waterAt(W,x-epsilon*dx,z-epsilon*dz,t),b=waterAt(W,x+epsilon*dx,z+epsilon*dz,t);near(a.h,b.h,.0001);near(a.nx,b.nx,.0001);near(a.ny,b.ny,.0001);near(groundAt(W,x-epsilon*dx,z-epsilon*dz),groundAt(W,x+epsilon*dx,z+epsilon*dz),.001);}
const sun=sunDirection(W,W.t*60);near(Math.hypot(sun.x,sun.y,sun.z),1);near(sun.y,W.wx.elev,.003);
const moon=moonAt(W,W.t*60);near(moon.direction.length(),1);assert.ok(moon.phase>=0&&moon.phase<=1&&moon.distance>.002&&moon.distance<.003);
// Independent tabulated observations in Quan & Fry, Table 1 (589.3 nm).
near(waterIOR(0,20,589.3),1.33299,4e-5);near(waterIOR(34.998,20,589.3),1.33938,4e-5);assert.ok(waterIOR(35,15)>waterIOR(0,15));assert.ok(waterIOR(35,25)<waterIOR(35,5));near(waterIOR(50,-10,300),waterIOR(35,0,400));assert.ok(opticalTexture(W.ocean.grids[2]).every(Number.isFinite));
for(const grid of W.ocean.grids){waveTextures(grid,W.seed,.5);for(let n=0;n<20;n++)wavePoint(grid,n*grid.dx*.37,n*grid.dy*.63,t,W.seed);}
assert.equal(hash(save(W)),hash(before),'The observer mutated the saved physical world or RNG');
console.log('PASS wave energy, phase, period, analytic normals, dry cells, nest continuity, solar/lunar geometry and unchanged world');
assert.deepEqual(coordinates(-4,7,4,[0,5]),[-4,0,4,5,7]);const mesh=oceanPlane(-32,-32,288,32,4,[0,224],[0]);const positions=mesh.attributes.position;for(let i=0;i<positions.count;i++)assert.equal(positions.getY(i),0);assert.ok(mesh.index.array.every(i=>i<positions.count));mesh.dispose();
console.log('PASS world-aligned ocean topology with shared nest and patch corners');
