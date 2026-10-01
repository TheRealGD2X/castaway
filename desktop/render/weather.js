import * as THREE from 'three/webgpu';
import {groundAt,seeded,clamp} from './model.js';
import {localWeather} from '../../v2/src/sim/atmosphere.js';
// Statistical precipitation projection. Each glyph stands for an equal number
// of real drops/flakes; its ballistic trajectory uses simulated wind and rain.
export class Weather {
 constructor(scene){this.mesh=new THREE.InstancedMesh(new THREE.CylinderGeometry(.005,.005,.16,4),new THREE.MeshStandardNodeMaterial({color:'#dce8de',roughness:.25,transparent:true,opacity:.3,depthWrite:false}),1024);this.mesh.frustumCulled=false;this.mesh.userData={kind:'weather'};scene.add(this.mesh);this.o=new THREE.Object3D();}
 update(W){this.W=W;}
 animate(seconds,target){const W=this.W,wx=localWeather(W,target.x/2,target.z/2),snow=clamp((1-wx.temp)/2),v=9*(1-snow)+.9*snow,rain=Math.max(0,wx.rain||0),width=36,height=18,actual=rain/3600000*width*width*height/(4*Math.PI*.001**3/3*v),count=Math.min(1024,Math.ceil(actual/400));this.mesh.count=count;this.representedDrops=count?actual/count:0;const o=this.o;
  for(let n=0;n<count;n++){const age=(seconds+seeded(n,301,W.seed)*height/v)%(height/v),x=target.x+(seeded(n,302,W.seed)-.5)*width+(wx.u||0)*age,z=target.z+(seeded(n,303,W.seed)-.5)*width+(wx.v||0)*age,y=groundAt(W,target.x,target.z)+height-age*v;o.position.set(x,y,z);o.rotation.set(-(wx.v||0)/v,0,(wx.u||0)/v);o.scale.set(snow?3:1,snow?.13:1,snow?3:1);o.updateMatrix();this.mesh.setMatrixAt(n,o.matrix);}this.mesh.instanceMatrix.needsUpdate=true;}
}
