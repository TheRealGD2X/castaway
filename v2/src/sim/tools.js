// Geometry, force and wear of small hand tools. SI units; no object-name speed bonuses.
import {clamp} from '../core/dmath.js';
import {MAT} from '../build/assembly.js';
const PI=3.141592653589793;
export const CORD_KG=.09;
export function axeDesign(skill=0){return{parts:[
  {kind:'edge',mat:'stones',kg:.9,width:.04,radius:.0003/(.7+Math.min(1,skill*.15)),condition:1},
  {kind:'handle',mat:'poles',kg:.4,length:.42,condition:1},
  {kind:'binding',mat:'withies',kg:.06,length:1.1,quality:clamp(.65+skill*.08,.65,.95),condition:1}],wet:0};}
export function lineDesign(strength=.7){const length=5,diameter=.003;return{parts:[{kind:'fibre',mat:'withies',kg:PI*diameter*diameter/4*length*600,length,diameter,quality:clamp(strength,0,1),condition:1}],wet:0};}
export function toolProps(t){
  if(!t)return{mass:0,cutPower:0,tension:0};const parts=t.parts,edge=parts.find(p=>p.kind==='edge'),handle=parts.find(p=>p.kind==='handle'),binding=parts.find(p=>p.kind==='binding'),fibre=parts.find(p=>p.kind==='fibre');
  const mass=parts.reduce((v,p)=>v+p.kg,0),wet=t.wet||0;
  if(fibre){const area=fibre.kg/(MAT[fibre.mat].density*fibre.length);return{mass,tension:area*MAT[fibre.mat].tension*fibre.quality*fibre.condition*(1-wet*.2),length:fibre.length};}
  if(!edge||!handle||!binding)return{mass,cutPower:0,tension:0};
  const r=Math.sqrt(handle.kg/(MAT[handle.mat].density*PI*handle.length));
  const handleN=MAT[handle.mat].bend*PI*r*r*r/4/handle.length*handle.condition;
  const bindingN=binding.kg/(MAT[binding.mat].density*binding.length)*MAT[binding.mat].tension*binding.quality*binding.condition*(1-wet*.35);
  const energy=edge.kg*4*4/2,impactN=energy/.03+35,force=Math.min(impactN,handleN,bindingN);
  const resistance=2*edge.radius*edge.width*3e6;
  return{mass,length:handle.length,energy,impactN,handleN,bindingN,force,edgeRadius:edge.radius,cutPower:energy*.6*clamp(1-resistance/Math.max(.001,force),0,1)*edge.condition};
}
export function ensureTools(M){
  M.tools||={};M.toolScraps||={};M.toolDustKg??=0;M.brokenTools||=[];
  if(M.inv.axe&&!M.tools.axe){M.tools.axe=axeDesign(M.skill.build);const p=M.tools.axe.parts;p[0].kg=4;p[1].kg=1.5;p[2].kg=CORD_KG*2;p[0].radius/=.25+(M.axeWear??1)*.75;}
  if(M.inv.line&&!M.tools.line){const t=lineDesign(1),nominal=toolProps(t).tension;t.parts[0].quality=Math.min(1,(M.lineStrength??.5)*30/nominal);t.parts.push({kind:'stock',mat:'withies',kg:CORD_KG*3-t.parts[0].kg});M.tools.line=t;}
}
export function makeTool(M,key){
  ensureTools(M);const tool=key==='axe'?axeDesign(M.skill.build):lineDesign(clamp(.6+M.skill.build*.08,.6,.95));
  const budget=key==='axe'?{stones:4,poles:1.5,withies:CORD_KG*2}:{withies:CORD_KG*3};
  for(const p of tool.parts)budget[p.mat]-=p.kg;for(const mat in budget)M.toolScraps[mat]=(M.toolScraps[mat]||0)+Math.max(0,budget[mat]);M.tools[key]=tool;return tool;
}
export function woodWorkRate(M,fraction=.2){const p=toolProps(M.inv.axe?M.tools?.axe:null);return 1+fraction*Math.max(0,p.cutPower/1.8-1);}
export function breakTool(M,key){const tool=M.tools?.[key];if(!tool)return;M.brokenTools.push(tool);delete M.tools[key];M.inv[key]=0;}
export function useAxe(M,minutes,wx){
  ensureTools(M);if(!M.inv.axe)return;const t=M.tools.axe,p=toolProps(t),edge=t.parts.find(p=>p.kind==='edge'),binding=t.parts.find(p=>p.kind==='binding'),handle=t.parts.find(p=>p.kind==='handle');
  t.wet=clamp(t.wet+(wx.rain||0)*minutes*.0004-minutes*.00015,0,1);
  // Archard abrasion: load * sliding distance / hardness, with an assumed wear coefficient.
  const volume=.0002*p.force*(.08*.6*60*minutes)/3e9,kg=Math.min(edge.kg,volume*2400);
  edge.kg-=kg;M.toolDustKg+=kg;edge.radius+=volume/Math.max(.000001,edge.width*.01);
  binding.condition=clamp(binding.condition-Math.max(0,p.impactN/Math.max(.01,p.bindingN)-1)*minutes*.0005,0,1);
  handle.condition=clamp(handle.condition-Math.max(0,p.impactN/Math.max(.01,p.handleN)-1)*minutes*.0005,0,1);
  M.axeWear=clamp(.0003/edge.radius,0,1);if(binding.condition<=0||handle.condition<=0||edge.kg<.05)breakTool(M,'axe');
}
export function useLine(M,minutes,pull=0){
  ensureTools(M);const t=M.tools.line;if(!M.inv.line||!t)return false;
  if(pull>toolProps(t).tension){breakTool(M,'line');return false;}
  const p=t.parts[0],lost=Math.min(p.kg,p.kg*minutes*.000015);p.kg-=lost;M.toolDustKg+=lost;
  M.lineStrength=toolProps(t).tension/30;return true;
}
export const toolMass=M=>Object.values(M.tools||{}).reduce((v,t)=>v+toolProps(t).mass,0)+(M.brokenTools||[]).reduce((v,t)=>v+toolProps(t).mass,0)+Object.values(M.toolScraps||{}).reduce((v,q)=>v+q,0)+(M.toolDustKg||0);
