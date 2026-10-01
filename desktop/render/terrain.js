import * as THREE from 'three/webgpu';
import {attribute} from 'three/tsl';
import {groundAt,seaBed,clamp,seeded,waterIOR} from './model.js';
import {waterSalinity} from '../../v2/src/sim/hydro.js';
const palette=['#334c49','#528478','#d4bc84','#728752','#8c9d5f','#536b45','#8c8e83','#5c8b7c','#657847','#779b89','#ada48c'];
export class Terrain {
 constructor(scene,W){this.geometry=new THREE.PlaneGeometry(W.MW*2,W.MH*2,W.MW*2,W.MH*2);this.geometry.rotateX(-Math.PI/2);this.geometry.translate(W.MW,0,W.MH);this.geometry.setAttribute('color',new THREE.BufferAttribute(new Float32Array(this.geometry.attributes.position.count*3),3));this.material=new THREE.MeshStandardNodeMaterial({vertexColors:true,roughness:.9,metalness:0});this.mesh=new THREE.Mesh(this.geometry,this.material);this.mesh.receiveShadow=true;this.mesh.userData={kind:'terrain'};scene.add(this.mesh);this.update(W);}
 update(W){const p=this.geometry.attributes.position,c=this.geometry.attributes.color,color=new THREE.Color();for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),tile=clamp(Math.floor(z/2),0,W.MH-1)*W.MW+clamp(Math.floor(x/2),0,W.MW-1),wear=W.traces?.[tile]?.wear||0,wet=clamp((W.hydro.pool[tile]||0)*3+W.litterWet*.15),snow=clamp((W.surface.snow||0)/25),salt=clamp((W.hydro.saltSoil[tile]||0)/.1);
 p.setY(i,groundAt(W,x,z));color.set(palette[W.ter[tile]]);color.multiplyScalar(.95+seeded(tile,12,W.seed)*.1);if(wear)color.lerp(new THREE.Color('#987a50'),clamp(wear/25)*.65);if(salt&&W.ter[tile]>2&&W.ter[tile]<6)color.lerp(new THREE.Color('#a18e58'),salt*.5);color.multiplyScalar(1-wet*.15);color.lerp(new THREE.Color('#e5ecdb'),snow);c.setXYZ(i,color.r,color.g,color.b);}
 p.needsUpdate=c.needsUpdate=true;this.geometry.computeVertexNormals();this.geometry.computeBoundingSphere();this.material.roughness=.94-clamp(W.litterWet)*.35;}
}
export class MarineBed {
 constructor(scene,W){this.meshes=[];const w=W.MW*2,d=W.MH*2,margin=256;this.material=new THREE.MeshStandardNodeMaterial({color:'#334c49',roughness:1});for(const [x,z,width,depth]of [[-margin,-margin,w+margin*2,margin],[-margin,d,w+margin*2,margin],[-margin,0,margin,d],[w,0,margin,d]]){const geometry=new THREE.PlaneGeometry(width,depth,Math.ceil(width/2),Math.ceil(depth/2));geometry.rotateX(-Math.PI/2);geometry.translate(x+width/2,0,z+depth/2);const mesh=new THREE.Mesh(geometry,this.material);mesh.receiveShadow=true;scene.add(mesh);this.meshes.push(mesh);}this.update(W);}
 update(W){for(const mesh of this.meshes){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,seaBed(W,p.getX(i),p.getZ(i)));p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingSphere();}}
}
export function freshwater(scene,W){const group=new THREE.Group(),make=()=>new THREE.MeshPhysicalNodeMaterial({color:'#638d83',roughness:.2,transmission:.75,thickness:.4,metalness:0}),lake=make(),stream=make(),pool=make(),plane=new THREE.PlaneGeometry(2,2);plane.rotateX(-Math.PI/2);
 for(let i=0;i<W.ter.length;i++)if([7,9].includes(W.ter[i])){const m=new THREE.Mesh(plane,W.ter[i]===7?lake:stream);m.position.set((i%W.MW+.5)*2,0,(Math.floor(i/W.MW)+.5)*2);m.userData={kind:'freshwater',tile:i};m.receiveShadow=true;group.add(m);}
 const poolGeometry=plane.clone(),indices=new THREE.InstancedBufferAttribute(new Float32Array(W.ter.length),1);poolGeometry.setAttribute('poolIOR',indices);pool.iorNode=attribute('poolIOR','float');const pools=new THREE.InstancedMesh(poolGeometry,pool,W.ter.length),tiles=[],o=new THREE.Object3D();pools.receiveShadow=true;pools.userData={kind:'puddles',tiles};group.add(pools);scene.add(group);
 const api={update(W){const h=W.hydro,area=group.children.filter(m=>m.userData.tile!=null&&W.ter[m.userData.tile]===7).length*4,iceDepth=area?h.freshIce*1000/(917*area):0;
  for(const m of group.children){if(m===pools)continue;const i=m.userData.tile,d=W.ter[i]===7?h.lakeDepth+iceDepth:h.streamDepth;m.position.y=groundAt(W,m.position.x,m.position.z)+d;m.visible=d>.001;}
  lake.ior=waterIOR(h.lake>0?h.saltLake/h.lake:0,h.temp);stream.ior=waterIOR(h.stream>0?h.saltStream/h.stream:0,h.temp);lake.roughness=iceDepth>.001?.65:.2;lake.transmission=iceDepth>.001?.15:.75;lake.color.set(iceDepth>.001?'#cbd9cd':'#638d83');
  tiles.length=0;for(let i=0;i<W.ter.length;i++)if(W.ter[i]>1&&![7,9].includes(W.ter[i])&&h.pool[i]/4>.0003){const n=tiles.length,x=(i%W.MW+.5)*2,z=(Math.floor(i/W.MW)+.5)*2;o.position.set(x,groundAt(W,x,z)+h.pool[i]/4,z);o.updateMatrix();pools.setMatrixAt(n,o.matrix);indices.setX(n,waterIOR(waterSalinity(W,i),h.temp));tiles.push(i);}pools.count=tiles.length;pools.instanceMatrix.needsUpdate=indices.needsUpdate=true;pools.computeBoundingSphere();
 }};api.update(W);return api;
}
