import {RenderPipeline,RedFormat,HalfFloatType} from 'three/webgpu';
import {pass,mrt,output,normalView,roughness,metalness,mix,vec4,renderOutput} from 'three/tsl';
import {ao} from 'three/addons/tsl/display/GTAONode.js';
import {ssr} from 'three/addons/tsl/display/SSRNode.js';
import {bloom} from 'three/addons/tsl/display/BloomNode.js';
import {smaa} from 'three/addons/tsl/display/SMAANode.js';
export function makePost(renderer,scene,camera,quality){
 const pipeline=new RenderPipeline(renderer),beauty=pass(scene,camera,{samples:0});beauty.setMRT(mrt({output,normal:normalView,rough:roughness,metal:metalness}));
 for(const name of ['rough','metal']){const t=beauty.getTexture(name);t.format=RedFormat;t.type=HalfFloatType;}
 const base=beauty.getTextureNode('output'),depth=beauty.getTextureNode('depth'),normal=beauty.getTextureNode('normal'),r=beauty.getTextureNode('rough');
 const ambient=ao(depth,normal,camera);ambient.resolutionScale=quality==='ultra'?1:.5;ambient.radius.value=1.1;ambient.thickness.value=.4;
 const reflection=ssr(base,depth,normal,{camera,roughnessNode:r.r,metalnessNode:beauty.getTextureNode('metal').r,reflectNonMetals:true,binaryRefine:true});reflection.resolutionScale=quality==='ultra'?1:.5;reflection.maxDistance.value=140;reflection.thickness.value=.3;reflection.quality.value=.6;
 const shaded=base.rgb.mul(mix(1,ambient,.28)),reflected=shaded.add(reflection.rgb.mul(r.r.oneMinus().pow(4).mul(.32))),glow=bloom(vec4(reflected,1),.08,.3,1.5);
 // Preserve weak illumination in Float32 until exposure. SMAA's intermediate
 // targets are HalfFloat, and its edge detection expects display colours.
 // Mapping before AA avoids quantizing actual moonlight to zero first.
 const display=renderOutput(vec4(reflected.add(glow.rgb),base.a),renderer.toneMapping,renderer.outputColorSpace),antialias=smaa(display);pipeline.outputColorTransform=false;pipeline.outputNode=antialias;
 return{render:()=>pipeline.render(),dispose(){pipeline.dispose();beauty.dispose();ambient.dispose();reflection.dispose();glow.dispose();antialias.dispose();},pipeline,beauty};
}
