import * as THREE from 'three/webgpu';
import {uniform,vec3,vec4,dot,normalWorld,max} from 'three/tsl';
import {SkyMesh} from 'three/addons/objects/SkyMesh.js';
import {Observer,Equator,Horizon,Illumination} from 'astronomy-engine';
import {sunDirection,groundAt,clamp} from './model.js';

// Photometric lights use a common display unit of 10,000 lux / candela.
// Camera exposure, never simulation irradiance, adapts to darkness.
export const LIGHT_UNIT=10000;
export function moonAt(W,seconds){const date=new Date(W.born+seconds*1000),observer=new Observer(57,-6.5,0),eq=Equator('Moon',date,observer,true,true),h=Horizon(date,observer,eq.ra,eq.dec,'normal'),q=Illumination('Moon',date),el=h.altitude*Math.PI/180,az=h.azimuth*Math.PI/180;return{direction:new THREE.Vector3(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)),phase:q.phase_fraction,distance:q.geo_dist,altitude:h.altitude};}
export class Lighting {
 constructor(scene,renderer,W,quality){
  this.scene=scene;this.renderer=renderer;this.W=W;this.fireLights=[];this.lastEnvironment=-Infinity;this.lastMoon=-Infinity;scene.fog=new THREE.FogExp2('#adc1b8',.0001);
  this.sky=new SkyMesh();this.sky.scale.setScalar(12000);this.sky.cloudSpeed.value=0;this.sky.renderOrder=-10;this.skyGain=uniform(1);this.sky.material.colorNode=this.sky.material.colorNode.mul(vec4(this.skyGain,this.skyGain,this.skyGain,1));scene.add(this.sky);
  this.envScene=new THREE.Scene();this.envSky=new SkyMesh();this.envSky.scale.setScalar(12000);this.envSky.cloudSpeed.value=0;this.envSky.showSunDisc.value=0;this.envSky.material.colorNode=this.envSky.material.colorNode.mul(vec4(this.skyGain,this.skyGain,this.skyGain,1));this.envScene.add(this.envSky);this.pmrem=new THREE.PMREMGenerator(renderer);
  this.sun=new THREE.DirectionalLight('#fff0d0',1);this.sun.castShadow=true;this.sun.shadow.camera.left=-135;this.sun.shadow.camera.right=135;this.sun.shadow.camera.top=105;this.sun.shadow.camera.bottom=-105;this.sun.shadow.camera.near=1;this.sun.shadow.camera.far=700;this.sun.shadow.bias=-.00012;this.sun.shadow.normalBias=.025;scene.add(this.sun,this.sun.target);
  this.moonLight=new THREE.DirectionalLight('#c9d5e5',0);this.moonLight.castShadow=true;this.moonLight.shadow.camera.left=-135;this.moonLight.shadow.camera.right=135;this.moonLight.shadow.camera.top=105;this.moonLight.shadow.camera.bottom=-105;this.moonLight.shadow.camera.near=1;this.moonLight.shadow.camera.far=700;this.moonLight.shadow.normalBias=.025;this.moonLight.shadow.bias=-.00012;this.moonLight.shadow.mapSize.set(2048,2048);this.moonLight.shadow.needsUpdate=true;scene.add(this.moonLight,this.moonLight.target);
  this.fill=new THREE.HemisphereLight('#b5cfdb','#807557',0);scene.add(this.fill);
  this.moonSun=uniform(new THREE.Vector3());this.moonGain=uniform(1);
  const moonMaterial=new THREE.MeshBasicNodeMaterial();moonMaterial.colorNode=vec3(.84,.82,.73).mul(max(dot(normalWorld,this.moonSun),.008)).mul(this.moonGain);moonMaterial.fog=false;
  this.moon=new THREE.Mesh(new THREE.SphereGeometry(1,32,24),moonMaterial);this.moon.renderOrder=-5;scene.add(this.moon);this.envMoon=new THREE.Mesh(this.moon.geometry,moonMaterial);this.envScene.add(this.envMoon);
  this.quality(quality);this.update(W);
 }
 quality(q){const size=q==='ultra'?8192:4096;if(this.sun.shadow.mapSize.x!==size){this.sun.shadow.mapSize.set(size,size);this.sun.shadow.needsUpdate=true;}this.qualityKey=q;this.lastEnvironment=-Infinity;}
 update(W){if(this.W&&Math.abs(W.t-this.W.t)>2){this.lastEnvironment=this.lastMoon=-Infinity;this.exposureReady=false;}this.W=W;while(this.fireLights.length>W.fires.length){const l=this.fireLights.pop();this.scene.remove(l);l.dispose();}while(this.fireLights.length<W.fires.length){const l=new THREE.PointLight('#ffb453',0,40,2);l.castShadow=true;l.shadow.mapSize.set(512,512);l.shadow.needsUpdate=true;l.shadow.bias=-.001;this.fireLights.push(l);this.scene.add(l);}for(let i=0;i<W.fires.length;i++){const F=W.fires[i],l=this.fireLights[i];l.position.set(F.x*2,groundAt(W,F.x*2,F.y*2)+.35,F.y*2);
   // Assumed luminous efficacy 0.65 lm/W for wood combustion. Embers use
   // the original radiantAt power; inverse-square attenuation is in Three.
   l.intensity=(F.heat*.65+(F.embers||0)*12)/(4*Math.PI*LIGHT_UNIT);l.shadow.autoUpdate=l.intensity>0;l.color.set(F.lit?'#ffbb66':'#df6b26');}
 }
 animate(seconds,camera,target,dt){
  const W=this.W,d=sunDirection(W,seconds),dir=new THREE.Vector3(d.x,d.y,d.z),elev=Math.max(0,d.y),cloud=clamp(W.wx.cloud),lux=Math.max(0,W.wx.sun||0)*115;
  this.sun.position.set(W.MW+dir.x*300,dir.y*300,W.MH+dir.z*300);this.sun.target.position.set(W.MW,0,W.MH);this.sun.intensity=elev>0?lux/Math.max(.05,elev)/LIGHT_UNIT:0;this.sun.color.setRGB(1,.87+.13*clamp(elev*3),.66+.34*clamp(elev*3));this.sun.shadow.autoUpdate=elev>0;
  this.sky.position.copy(camera.position);this.envSky.position.set(0,0,0);
  const twilight=Math.exp(Math.min(0,d.y*65));
  for(const sky of [this.sky,this.envSky]){sky.sunPosition.value.copy(dir).multiplyScalar(1000);sky.turbidity.value=2+cloud*7+(W.wx.hum||0)*1.5;sky.mieCoefficient.value=.003+(W.wx.fog||0)*.03;sky.cloudCoverage.value=cloud;sky.cloudDensity.value=.3+cloud*.8;}
  if(seconds-this.lastMoon>=60||seconds<this.lastMoon){this.moonState=moonAt(W,seconds);this.lastMoon=seconds;}
  const m=this.moonState,moonLux=.267*m.phase*m.phase*Math.max(0,m.direction.y)*Math.exp(-cloud*2.5);
  this.moonLight.position.copy(m.direction).multiplyScalar(300).add(new THREE.Vector3(W.MW,0,W.MH));this.moonLight.target.position.set(W.MW,0,W.MH);this.moonLight.intensity=moonLux/LIGHT_UNIT;
  this.moon.position.copy(camera.position).addScaledVector(m.direction,3500);this.moon.scale.setScalar(3500*.0045*.00257/m.distance);this.moon.visible=m.direction.y>-.01&&cloud<.92;this.envMoon.position.copy(m.direction).multiplyScalar(3500);this.envMoon.scale.copy(this.moon.scale);this.envMoon.visible=this.moon.visible;this.moonLight.shadow.autoUpdate=moonLux>0;this.moonSun.value.copy(dir);this.moonGain.value=.00004*Math.exp(-cloud*2.5);
  const diffuseLux=lux*(.18+cloud*.45)+twilight*4+moonLux*.25+.001;
  // Preetham provides angular colour, not photometric units. Normalize its
  // radiance by the same incident diffuse illuminance used by the lights.
  // In particular, a geometric dawn cannot emit daylight when wx.sun is zero.
  this.skyGain.value=Math.max(1e-10,diffuseLux/30000);
  this.fill.intensity=diffuseLux/LIGHT_UNIT*.35;
  const visibility=W.wx.fog>.3?600:W.wx.rain>1.5?3000:W.wx.rain>0?7000:W.wx.hum>.9?9000:18000;
  // Fog is incident-light scattering, not a fixed self-luminous colour.
  // A night exposure must not turn unlit mist into a white emitter.
  this.scene.fog.color.set(d.y>-.03?'#adc1b8':'#13212b').multiplyScalar(Math.max(1e-8,(diffuseLux+lux+moonLux)/50000));this.scene.fog.density=Math.sqrt(-Math.log(.02))/visibility;
  let fireLux=0;for(const l of this.fireLights)if(l.visible)fireLux+=l.intensity*LIGHT_UNIT/Math.max(1,l.position.distanceToSquared(target));
  const exposure=clamp(15000/Math.max(.001,diffuseLux+lux*.65+fireLux),.08,600000)*(this.exposureCompensation||1),smooth=1-Math.exp(-dt/2);
  if(!this.exposureReady){this.renderer.toneMappingExposure=exposure;this.exposureReady=true;}else this.renderer.toneMappingExposure+=(exposure-this.renderer.toneMappingExposure)*smooth;
  if(seconds-this.lastEnvironment>=120||seconds<this.lastEnvironment){const old=this.envTarget;this.envTarget=this.pmrem.fromScene(this.envScene,0,1,15000,{size:this.qualityKey==='ultra'?256:128,renderTarget:old});this.scene.environment=this.envTarget.texture;this.lastEnvironment=seconds;}
  this.scene.environmentIntensity=.45;
  this.sunLux=lux;this.moonLux=moonLux;
 }
 dispose(){this.envTarget?.dispose();this.pmrem.dispose();}
}
