// Finite soil movement changes elevation. Dry bulk density 1600 kg/m3, tile area 4 m2.
export const elevation=(W,i)=>(W.h[i]-.12)*18+(W.relief?.[i]||0)+(W.ter[i]===7?(W.hydro?.lakeBed||0)/(1600*Math.max(4,(W.hydroMap?.lake.length||0)*4)):0);
// Excess boundary shear entrains soil; roots and compacted ground raise its resistance.
export function erosionMass(depth,head,length,seconds,cover=0,wear=0){const shear=1000*9.81*Math.max(0,depth)*Math.max(0,head)/Math.max(.1,length),critical=.4*(1+cover*4+Math.min(4,wear*.1));return .00001*4*Math.max(0,shear-critical)*seconds;}
export function reliefInit(W,saved){W.relief=Float64Array.from(saved||new Float64Array(W.ter.length));}
export function reroute(W,i){const width=W.MW,x=i%width,y=Math.floor(i/width);let best=1e9,target=-1;
  for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){if(x+dx<0||x+dx>=width||y+dy<0||y+dy>=W.MH)continue;const j=i+dx+dy*width,h=W.ter[j]<=1?0:elevation(W,j);if(h<best){best=h;target=j;}}W.hydroMap.down[i]=target;
}
const invalidate=(W,i)=>{if(!W.reliefBatch){reroute(W,i);return;}if(!W.reliefDirty[i]){W.reliefDirty[i]=1;W.reliefBatch.push(i);}};
export function beginRelief(W){W.reliefDirty||=new Uint8Array(W.ter.length);W.reliefBatch=[];}
export function endRelief(W){for(const i of W.reliefBatch){reroute(W,i);W.reliefDirty[i]=0;}W.reliefBatch=null;}
export function touchRelief(W,i){invalidate(W,i);const x=i%W.MW,y=Math.floor(i/W.MW);if(x>0)invalidate(W,i-1);if(x+1<W.MW)invalidate(W,i+1);if(y>0)invalidate(W,i-W.MW);if(y+1<W.MH)invalidate(W,i+W.MW);}
export function moveRelief(W,i,kg){if(!kg)return;W.relief[i]+=kg/(1600*4);touchRelief(W,i);}
