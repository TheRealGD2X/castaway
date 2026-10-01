import {sprite} from './pix.js';
import {detailSprite} from './motion.js';
import {OUT} from './palette.js';
import {waterProps} from '../build/waterworks.js';
const cache=new Map();
export function waterworkSprite(s){
  const p=waterProps(s),key=JSON.stringify([s.dir,p.excavatedM3,p.crest,p.infiltration,Math.floor((s.waterL||0)/4),Math.floor((s.depositedKg||0)*10),s.flow>0]);
  if(cache.has(key))return cache.get(key);const e=s.earthwork,ox=25,oy=23;
  const result={ox,oy,w:50,h:32,img:detailSprite(50,32,P=>{
    const pit=p.retention>0,wet=(s.waterL||0)>.2,depth=p.channelDepth;
    if(depth>0)for(let y=0;y<(pit?8:3);y++)for(let x=0;x<(pit?14:30);x++){
      const X=ox+x-(pit?7:15),Y=oy+y-4+Math.floor((x-(pit?7:15))*.16);
      P.set(X,Y,y===0?'#514232':wet&&pit?'#527f78':(x+y)%3?'#826745':'#a18153');
      if(p.infiltration<.5&&(y===0||y===7))P.set(X,Y,'#b3a18a');
    }
    // Earth dug out is visible beside the cut; sediment builds on the actual pit floor.
    for(let n=0;n<Math.min(15,Math.ceil(p.spoilM3*80));n++)P.set(ox-10+n,oy+6-Math.floor(n%5/2),'#9a7650');
    for(let n=0;n<Math.min(20,Math.floor((s.depositedKg||0)*5));n++)P.set(ox-6+n%12,oy+1+Math.floor(n/12),'#ac9466');
    if(p.crest>0)for(let y=0;y<Math.max(1,Math.floor(p.crest*30));y++)for(let x=-7;x<8;x++){P.set(ox+x,oy-y,(x+y)%4?'#8b8b75':'#bfb297');}
    if(s.flow>0)for(let n=0;n<5;n++)P.set(ox-10+n*4,oy-3+Math.floor(n*.5),'#a4c4ad');
  },{out:OUT})};cache.set(key,result);if(cache.size>96)cache.delete(cache.keys().next().value);return result;
}
