import * as THREE from 'three/webgpu';
import {Fn,Loop,If,Discard,float,int,vec2,vec3,vec4,ivec2,uniform,uniformArray,instancedArray,instanceIndex,textureLoad,positionLocal,positionWorld,varyingProperty,sin,cos,exp,floor,clamp,mix,color,transformNormalToView} from 'three/tsl';
import {OMEGA} from '../../v2/src/sim/ocean-waves.js';
import {waveTextures,opticalTexture,seaBed,seeded} from './model.js';
import {oceanPlane} from './mesh.js';
const TAU=Math.PI*2;
function tex(data,w,h){const t=new THREE.DataTexture(data,w,h,THREE.RGBAFormat,THREE.FloatType);t.minFilter=t.magFilter=THREE.NearestFilter;t.generateMipmaps=false;t.needsUpdate=true;return t;}
function bilinear(point,width,height,dx,dy){const raw=point.div(vec2(dx,dy)).sub(.5),uv=clamp(raw,vec2(0),vec2(width-1,height-1)),cell=clamp(floor(uv),vec2(0),vec2(width-2,height-2)),f=uv.sub(cell),sx=float(0).toVar(),sy=float(0).toVar();If(raw.x.greaterThan(0).and(raw.x.lessThan(width-1)),()=>{sx.assign(1/dx);});If(raw.y.greaterThan(0).and(raw.y.lessThan(height-1)),()=>{sy.assign(1/dy);});const ids=[ivec2(cell),ivec2(cell.add(vec2(1,0))),ivec2(cell.add(vec2(0,1))),ivec2(cell.add(1))],weights=[f.x.oneMinus().mul(f.y.oneMinus()),f.x.mul(f.y.oneMinus()),f.x.oneMinus().mul(f.y),f.x.mul(f.y)];return{ids,weights,dx:[f.y.oneMinus().negate().mul(sx),f.y.oneMinus().mul(sx),f.y.negate().mul(sx),f.y.mul(sx)],dy:[f.x.oneMinus().negate().mul(sy),f.x.negate().mul(sy),f.x.oneMinus().mul(sy),f.x.mul(sy)]};}

// Displacement and analytic derivatives of the existing saved linear waves.
// A partition of unity joins child and parent observations at the nest boundary.
// Inventories and the authoritative CPU solver are never changed by this mesh.
export class Ocean {
 constructor(scene,W,quality='high'){
  this.scene=scene;this.W=W;this.quality=quality;this.patches=[];this.spacing=quality==='ultra'?.5:1;this.scatterLight=uniform(Math.max(0,W.wx.sun||0)*115/10000*.17);
  this.bedWidth=W.MW+256;this.bedHeight=W.MH+256;this.bed=tex(new Float32Array(this.bedWidth*this.bedHeight*4),this.bedWidth,this.bedHeight);this.groups=new Map();
  for(const grid of [1,2]){const g=W.ocean.grids[grid];this.groups.set(grid,{g,grid,mode:tex(new Float32Array(g.n*24*4),g.nx,g.ny*24),meta:tex(new Float32Array(g.n*24*4),g.nx,g.ny*24),macro:tex(new Float32Array(g.n*4),g.nx,g.ny),optical:tex(new Float32Array(g.n*4),g.nx,g.ny),phases:uniformArray(new Array(24).fill(0),'float')});}
  this.materials=new Map();this.update(W);this.build(W);
 }
 field(group,point,spacing){
  const {g,mode,meta,macro,optical,phases}=group,{ids,weights,dx,dy}=bilinear(point,g.nx,g.ny,g.dx,g.dy),wet=float(0).toVar(),wetX=float(0).toVar(),wetZ=float(0).toVar(),state=vec4(0).toVar(),index=float(0).toVar(),etaX=float(0).toVar(),etaZ=float(0).toVar();
  for(let q=0;q<4;q++){const m=textureLoad(meta,ids[q]),c=textureLoad(macro,ids[q]);wet.addAssign(weights[q].mul(m.w));wetX.addAssign(dx[q].mul(m.w));wetZ.addAssign(dy[q].mul(m.w));state.addAssign(c.mul(weights[q]).mul(m.w));index.addAssign(textureLoad(optical,ids[q]).x.mul(weights[q]).mul(m.w));etaX.addAssign(c.x.mul(dx[q]).mul(m.w));etaZ.addAssign(c.x.mul(dy[q]).mul(m.w));}
  state.divAssign(wet.max(.00001));const H=state.x.toVar(),slopeX=etaX.sub(H.mul(wetX)).div(wet.max(.00001)).toVar(),slopeZ=etaZ.sub(H.mul(wetZ)).div(wet.max(.00001)).toVar();
  Loop({start:int(0),end:int(24),type:'int'},({i})=>{
   for(let q=0;q<4;q++){const id=ivec2(ids[q].x,ids[q].y.add(i.mul(g.ny))),a=textureLoad(mode,id),b=textureLoad(meta,id),angle=a.w.add(a.y.mul(point.x.sub(b.x))).add(a.z.mul(point.y.sub(b.y))).add(phases.element(i)),amp=float(0).toVar();
    // Spatial Nyquist limit. Omitted modes retain all their simulation action.
    If(a.y.mul(a.y).add(a.z.mul(a.z)).lessThan((Math.PI/spacing)**2).and(b.z.lessThan(Math.PI/spacing)),()=>{amp.assign(a.x);});
    const s=sin(angle),c=cos(angle);H.addAssign(amp.mul(weights[q]).mul(s));slopeX.addAssign(amp.mul(dx[q].mul(s).add(weights[q].mul(a.y).mul(c))));slopeZ.addAssign(amp.mul(dy[q].mul(s).add(weights[q].mul(a.z).mul(c))));
   }
  });
  If(wet.lessThan(.00001),()=>{H.assign(0);slopeX.assign(0);slopeZ.assign(0);});return [vec4(H,slopeX,slopeZ,wet),vec4(state.z,state.w,state.y,state.x),index.div(wet.max(.00001)).max(1)];
 }
 build(W){const w=W.MW*2,d=W.MH*2;this.add(W,oceanPlane(0,0,w,d,this.spacing),this.spacing,true,0,this.spacing*2);
  // Dense nearshore geometry, then progressively coarser horizon rings.
  let inner=0;const rings=[[32,this.spacing*2],[256,4],[2048,16],[20000,128]];for(let n=0;n<rings.length;n++){const [outer,step]=rings[n],next=rings[n+1]?.[1];
   for(const [x,z,pw,pd]of [[-outer,-outer,w+outer*2,outer-inner],[-outer,d+inner,w+outer*2,outer-inner],[-outer,-inner,outer-inner,d+inner*2],[w+inner,-inner,outer-inner,d+inner*2]])this.add(W,oceanPlane(x,z,pw,pd,step,[0,w,-inner,w+inner],[0,d,-inner,d+inner]),step,false,outer,next);
   inner=outer;
  }
 }
 add(W,geometry,spacing,coast,outer,next){const key=spacing+':'+coast,cached=this.materials.get(key);if(cached){this.attach(geometry,cached,spacing,coast);return;}const normal=varyingProperty('vec3'),surface=varyingProperty('vec4'),wet=varyingProperty('float'),refractive=varyingProperty('float'),material=new THREE.MeshPhysicalNodeMaterial({color:'#e2eade',roughness:.10,metalness:0,transmission:1,thickness:6,attenuationColor:'#79b9b0',attenuationDistance:4,side:THREE.DoubleSide});material.forceSinglePass=true;material.iorNode=refractive;
  material.positionNode=Fn(()=>{
   const point=positionLocal.xz,parentPoint=point.add(vec2(65000-W.MW,65000-W.MH)),parent=this.field(this.groups.get(1),parentPoint,spacing),height=parent[0].toVar(),optics=parent[1].toVar(),index=parent[2].toVar();
   if(coast){const child=this.field(this.groups.get(2),point,spacing),t=[point.x,float(W.MW*2).sub(point.x),point.y,float(W.MH*2).sub(point.y)].map(n=>clamp(n.div(16),0,1)),s=t.map(n=>n.mul(n).mul(float(3).sub(n.mul(2)))),d=t.map(n=>n.mul(n.oneMinus()).mul(6/16)),weight=s[0].mul(s[1]).mul(s[2]).mul(s[3]),gradient=vec2(d[0].mul(s[1]).sub(s[0].mul(d[1])).mul(s[2]).mul(s[3]),d[2].mul(s[3]).sub(s[2].mul(d[3])).mul(s[0]).mul(s[1]));
    const delta=child[0].x.sub(parent[0].x);height.assign(mix(parent[0],child[0],weight));height.y.addAssign(delta.mul(gradient.x));height.z.addAssign(delta.mul(gradient.y));optics.assign(mix(parent[1],child[1],weight));index.assign(mix(parent[2],child[2],weight));}
   if(next){const boundary=point.x.add(outer).min(float(W.MW*2+outer).sub(point.x)).min(point.y.add(outer)).min(float(W.MH*2+outer).sub(point.y));If(boundary.abs().lessThan(.0001),()=>{
    // Fine edge vertices lie on the neighbouring coarse polygon's polyline.
    // This removes T-junction holes without adding any extra wave energy.
    const a=point.toVar(),b=point.toVar(),f=float(0).toVar(),horizontal=point.y.equal(-outer).or(point.y.equal(W.MH*2+outer));
    const edge=(along,size)=>{const lo=clamp(floor(along.div(next)).mul(next),-outer,size+outer).toVar(),hi=clamp(floor(along.div(next)).add(1).mul(next),-outer,size+outer).toVar();If(along.greaterThanEqual(0),()=>{lo.assign(lo.max(0));}).Else(()=>{hi.assign(hi.min(0));});If(along.greaterThanEqual(size),()=>{lo.assign(lo.max(size));}).Else(()=>{hi.assign(hi.min(size));});return{lo,hi,f:along.sub(lo).div(hi.sub(lo).max(.0001))};};
    If(horizontal,()=>{const e=edge(point.x,W.MW*2);a.x.assign(e.lo);b.x.assign(e.hi);f.assign(e.f);}).Else(()=>{const e=edge(point.y,W.MH*2);a.y.assign(e.lo);b.y.assign(e.hi);f.assign(e.f);});
    const offset=vec2(65000-W.MW,65000-W.MH),p=this.field(this.groups.get(1),a.add(offset),next),q=this.field(this.groups.get(1),b.add(offset),next);height.assign(mix(p[0],q[0],f));optics.assign(mix(p[1],q[1],f));index.assign(mix(p[2],q[2],f));
   });}
   wet.assign(height.w);surface.assign(optics);refractive.assign(index);normal.assign(vec3(height.y.negate(),1,height.z.negate()).normalize());return vec3(positionLocal.x,height.x,positionLocal.z);
  })();
  material.normalNode=transformNormalToView(normal);
  const bedAt=()=>{const point=positionWorld.xz,{ids,weights}=bilinear(point.add(256),this.bedWidth,this.bedHeight,2,2),bed=float(0).toVar();for(let q=0;q<4;q++)bed.addAssign(textureLoad(this.bed,ids[q]).x.mul(weights[q]));If(point.x.lessThan(-255).or(point.y.lessThan(-255)).or(point.x.greaterThan(W.MW*2+255)).or(point.y.greaterThan(W.MH*2+255)),()=>{bed.assign(surface.z);});return bed;};
  material.colorNode=Fn(()=>{If(wet.lessThan(.0001),()=>{Discard();});if(coast)If(positionWorld.y.lessThan(bedAt().add(.005)),()=>{Discard();});return mix(color('#cee6db'),color('#e9eada'),surface.x.clamp(0,1));})();
  material.thicknessNode=Fn(()=>{return positionWorld.y.sub(bedAt()).max(.005).min(40);})();
  material.attenuationColorNode=mix(color('#79b9b0'),color('#8d9171'),surface.y.clamp(0,.7));material.roughnessNode=mix(float(.10),float(.68),surface.x.clamp(0,1));material.transmissionNode=surface.x.oneMinus().clamp(0,1);
  // Single-scattering source term L∞(1-exp(-σd)); illuminance is supplied
  // by the simulated sun. This prevents a clear, infinitely deep water body
  // from refracting a nonexistent screen-space seabed into a black rectangle.
  material.emissiveNode=Fn(()=>{const depth=positionWorld.y.sub(bedAt()).max(0),extinction=float(.09).add(surface.y.mul(.3));return color('#397d8a').mul(this.scatterLight).mul(float(1).sub(exp(depth.mul(extinction).negate()))).mul(surface.x.oneMinus().clamp(0,1));})();
  this.materials.set(key,material);this.attach(geometry,material,spacing,coast);
 }
 attach(geometry,material,spacing,coast){const mesh=new THREE.Mesh(geometry,material);mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.userData={kind:'ocean'};this.scene.add(mesh);this.patches.push({mesh,spacing,coast});}
 update(W){this.W=W;this.scatterLight.value=Math.max(0,W.wx.sun||0)*115/10000*.17;for(let y=0;y<this.bedHeight;y++)for(let x=0;x<this.bedWidth;x++)this.bed.image.data[(y*this.bedWidth+x)*4]=seaBed(W,(x+.5)*2-256,(y+.5)*2-256);this.bed.needsUpdate=true;
  for(const p of this.groups.values()){const g=W.ocean.grids[p.grid],t=waveTextures(g,W.seed,.25);p.mode.image.data.set(t.a);p.meta.image.data.set(t.b);p.macro.image.data.set(t.macro);p.optical.image.data.set(opticalTexture(g));p.mode.needsUpdate=p.meta.needsUpdate=p.macro.needsUpdate=p.optical.needsUpdate=true;p.anchors=t.anchors;}
 }
 animate(seconds){for(const p of this.groups.values())for(let b=0;b<24;b++){const v=p.anchors[b]-OMEGA[Math.floor(b/8)]*seconds+seeded(b,907,this.W.seed)*TAU;p.phases.array[b]=((v%TAU)+TAU)%TAU;}}
 async sampleGPU(renderer,points,grid=2,seconds=this.W.t*60){this.animate(seconds);const input=instancedArray(Float32Array.from(points.flat()),'vec2'),result=instancedArray(points.length,'vec4'),node=Fn(()=>{result.element(instanceIndex).assign(this.field(this.groups.get(grid),input.element(instanceIndex),this.spacing)[0]);})().compute(points.length);await renderer.computeAsync(node);const values=new Float32Array(await renderer.getArrayBufferAsync(result.value));node.dispose();return Array.from({length:points.length},(_,i)=>Array.from(values.slice(i*4,i*4+4)));}
 dispose(){this.bed.dispose();for(const g of this.groups.values()){g.mode.dispose();g.meta.dispose();g.macro.dispose();g.optical.dispose();}for(const p of this.patches){this.scene.remove(p.mesh);p.mesh.geometry.dispose();}for(const m of this.materials.values())m.dispose();}
}
