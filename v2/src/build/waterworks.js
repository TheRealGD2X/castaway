// Small earthworks: excavated soil remains as spoil; stone volume sets barrier height.
import {clamp} from '../core/dmath.js';
import {MAT} from './assembly.js';
const part=(s,k)=>s.stage>k?1:s.stage===k?s.prog||0:0;
export function waterDesign(s,W){
  if(!['drainage','weir','settlingPool'].includes(s.k))return null;
  const tile=Math.floor(s.y)*W.MW+Math.floor(s.x),outlet=W.hydroMap.down[tile];
  if(s.k==='drainage')return{width:.3,length:2,depth:.12,cutStage:0,outlet};
  if(s.k==='weir')return{width:.7,length:.18,depth:0,barrierStage:0,outlet};
  return{width:.7,length:.6,depth:.2,cutStage:0,liningStage:1,outlet};
}
export function waterProps(s){
  const e=s.earthwork,cut=e.cutStage==null?0:part(s,e.cutStage),area=e.width*e.length;
  const excavated=area*e.depth*cut,lining=e.liningStage==null?0:part(s,e.liningStage);
  const stone=e.barrierStage==null?0:(s.stages[e.barrierStage].need.stones||0)*MAT.stones.kg/MAT.stones.density*part(s,e.barrierStage)*(s.integrity??1);
  return{excavatedM3:excavated,spoilM3:excavated,channelWidth:e.width*cut,channelDepth:e.depth*cut,
    drainage:e.liningStage==null?cut:0,crest:stone/Math.max(.01,area),retention:e.liningStage!=null?excavated:0,
    capacity:e.liningStage!=null?Math.max(0,excavated-(s.depositedKg||0)/1600)*1000:0,catchArea:e.liningStage!=null?area*cut:0,leakL:(1-lining*.995)*area*.1,infiltration:1-lining*.95,earthArea:area,earthOutlet:e.outlet};
}
