// Authored material and expression families. Presentation never writes to W.
import {canvas} from './pix.js';
import {T} from '../world/gen.js';
import {hash3} from '../core/rng.js';
const images=new Map(),heads=new Map();let loading;
export function loadSceneArt(){
  if(loading)return loading;
  const names=[...['healthy','dry','damp','worn','rock-neutral','rock-damp','rock-moss','rock-dry'].map(n=>['ground/'+n,n]),...['neutral','down','closed','tired'].map(n=>['people/head-'+n,'head-'+n])];
  return loading=Promise.allSettled(names.map(([file,key])=>new Promise((resolve,reject)=>{
    const im=new Image(),timer=setTimeout(()=>{im.onload=im.onerror=null;reject(new Error(file));},5000);
    im.onload=()=>{clearTimeout(timer);images.set(key,im);if(key.startsWith('head-')){
      const cv=canvas(27,27),g=cv.getContext('2d');g.drawImage(im,0,0);const d=g.getImageData(0,0,27,27).data,p=[];
      for(let y=0;y<27;y++)for(let x=0;x<27;x++){const i=(y*27+x)*4;if(d[i+3]>96)p.push([x/3,y/3,'#'+[d[i],d[i+1],d[i+2]].map(v=>v.toString(16).padStart(2,'0')).join('')]);}heads.set(key,p);
    }resolve();};im.onerror=()=>{clearTimeout(timer);reject(new Error(file));};im.src=new URL('../../assets/'+file+'.png',import.meta.url).href;
  })));
}
export function paintAuthoredHead(P,x,y,down,mood,blink){
  const pixels=heads.get('head-'+(blink?'closed':down?'down':mood==='tired'||mood==='ill'?'tired':'neutral'));
  if(!pixels)return false;for(const [dx,dy,c] of pixels)P.dot(x+dx,y+dy,c);return true;
}
const clamp=v=>Math.max(0,Math.min(1,v));
function sample(a,W,x,y,fallback){
  if(!a)return fallback;const fx=Math.max(0,Math.min(W.MW-1,x/16-.5)),fy=Math.max(0,Math.min(W.MH-1,y/16-.5)),ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy;
  const at=(dx,dy)=>a[Math.min(W.MH-1,iy+dy)*W.MW+Math.min(W.MW-1,ix+dx)]||0;
  return at(0,0)*(1-u)*(1-v)+at(1,0)*u*(1-v)+at(0,1)*(1-u)*v+at(1,1)*u*v;
}
export function createGroundArt(terr){
  let cached,cacheKey;
  return {draw(g,V,W,sx,sy){
    if(!images.has('healthy'))return;
    // A margin allows camera-follow and short pans to reuse the material cache.
    const x0=Math.floor(sx/64)*64-32,y0=Math.floor(sy/64)*64-32,width=V.aw+130,height=V.ah+130,key=[x0,y0,width,height,W.t,V.groundSeason].join(':');
    if(cacheKey!==key){
      const cv=canvas(width*3,height*3),ctx=cv.getContext('2d'),mask=canvas(width,height),mg=mask.getContext('2d'),layer=canvas(width*3,height*3),lg=layer.getContext('2d');
      ctx.imageSmoothingEnabled=lg.imageSmoothingEnabled=false;
      const weights=Array.from({length:8},()=>mg.createImageData(width,height));
      const wearField=new Float32Array(W.MW*W.MH);for(const [i,q] of Object.entries(W.traces||{}))wearField[i]=q.wear||0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        const wx=x+x0,wy=y+y0;if(wx<0||wy<0||wx>=terr.PW||wy>=terr.PH)continue;
        const m=terr.mat[wy*terr.PW+wx];if(![T.GRASS,T.MEADOW,T.WOOD,T.MARSH,T.ROCK,T.SHINGLE].includes(m))continue;
        const soil=sample(W.hydro?.soil,W,wx,wy,.15),bare=clamp(1-sample(W.foodweb?.grass,W,wx,wy,.16)/.16);
        const dry=clamp((.14-soil)*3.5+(V.groundSeason||0)/64*.16),damp=clamp((soil-.17)*2.3),wear=sample(wearField,W,wx,wy,0);
        const worn=m===T.GRASS||m===T.MEADOW?clamp(bare*.7+wear*.02):0;
        if(m===T.ROCK||m===T.SHINGLE){const moss=clamp((sample(W.wet,W,wx,wy,.3)-.3)*.8),a=[1,damp,moss*(1-damp),dry];for(let k=0;k<4;k++)weights[k+4].data[(y*width+x)*4+3]=Math.round(a[k]*(m===T.SHINGLE?.68:1)*255);}
        else{const a=[1,dry,damp,worn];for(let k=0;k<4;k++)weights[k].data[(y*width+x)*4+3]=Math.round(a[k]*(m===T.WOOD?.52:m===T.MARSH?.46:.68)*255);}
      }
      for(const [k,name] of ['healthy','dry','damp','worn','rock-neutral','rock-damp','rock-moss','rock-dry'].entries()){
        const source=images.get(name);if(!source)continue;lg.clearRect(0,0,layer.width,layer.height);mg.putImageData(weights[k],0,0);
        for(let ty=Math.floor(y0/128);ty<=Math.floor((y0+height)/128);ty++)for(let tx=Math.floor(x0/128);tx<=Math.floor((x0+width)/128);tx++)lg.drawImage(source,(tx*128-x0)*3,(ty*128-y0)*3,384,384);
        lg.globalCompositeOperation='destination-in';lg.drawImage(mask,0,0,layer.width,layer.height);lg.globalCompositeOperation='source-over';ctx.drawImage(layer,0,0);
      }
      // Fine sand grains belong to the beach material, not interactive inventory.
      for(let y=0;y<height;y+=2)for(let x=0;x<width;x+=2){const wx=x+x0,wy=y+y0;if(wx<0||wy<0||wx>=terr.PW||wy>=terr.PH||terr.mat[wy*terr.PW+wx]!==T.SAND)continue;const h=hash3(wx,wy,W.seed+954);if(h<.15){ctx.fillStyle=h<.07?'#9a8b6d':'#e6d2a0';ctx.globalAlpha=.55;ctx.fillRect(x*3,y*3,2,1);}}
      ctx.globalAlpha=1;cached=cv;cacheKey=key;
    }
    g.drawImage(cached,x0-sx,y0-sy,width,height);
  }};
}
