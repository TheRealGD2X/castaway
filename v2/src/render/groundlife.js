// Living ground: paths, ash, puddles, frost and snow. Drawn from saved physical state.
import { TS } from './terrain.js';
import { hash3 } from '../core/rng.js';
import { T } from '../world/gen.js';
import { canvas } from './pix.js';
let snowCache=null;
function snowLayer(W,terr) {
  const s=W.surface||{},bucket=Math.floor((s.snow||0)*4),key=W.t+':'+bucket;
  if(snowCache?.world===W&&snowCache.key===key)return snowCache.cv;
  const cv=snowCache?.cv||canvas(terr.PW,terr.PH),ctx=cv.getContext('2d'),im=ctx.createImageData(terr.PW,terr.PH),d=im.data;
  const cover=Math.min(.95,(s.snow||0)/4);
  for(let y=0;y<terr.PH;y++)for(let x=0;x<terr.PW;x++){
    const p=y*terr.PW+x,t=terr.mat[p];if(t<=1||t===T.STREAM||t===T.LAKE)continue;
    const i=Math.floor(y/TS)*W.MW+Math.floor(x/TS),wear=W.traces?.[i]?.wear||0,h=hash3(Math.floor(x/3),Math.floor(y/3),W.seed);
    const shade=W.treeAt[i]?.48:1,alpha=cover*shade*(1-Math.min(.25,wear*.01));
    const o=p*4;d[o]=h>.8?214:237;d[o+1]=h>.8?226:240;d[o+2]=h>.8?214:224;d[o+3]=Math.round(alpha*255);
  }
  ctx.putImageData(im,0,0);snowCache={world:W,key,cv};return cv;
}
export function drawGroundLife(g,V,W,sx,sy,terr) {
  const x0=Math.max(0,Math.floor(sx/TS)),y0=Math.max(0,Math.floor(sy/TS)),x1=Math.min(W.MW-1,Math.floor((sx+V.aw)/TS)),y1=Math.min(W.MH-1,Math.floor((sy+V.ah)/TS)),s=W.surface||{};
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
    const i=y*W.MW+x,t=W.ter[i],q=W.traces?.[i],px=x*TS-sx,py=y*TS-sy,h=hash3(x,y,W.seed);
    if(t<=1||t===T.LAKE||t===T.STREAM)continue;
    if(W.foodweb&&(t===T.GRASS||t===T.MEADOW)){const bare=1-Math.min(1,W.foodweb.grass[i]/.16);if(bare>.05){g.globalAlpha=bare*.55;g.fillStyle='#a99b72';g.fillRect(px,py,TS,TS);g.fillStyle='#8d8461';for(let k=0;k<8;k++)if(hash3(i,k,W.seed)<bare)g.fillRect(px+2+(k*5)%12,py+2+(k*7)%12,2,1);g.globalAlpha=1;}}
    const relief=W.relief?.[i]||0;
    if(Math.abs(relief)>.002){g.globalAlpha=Math.min(.65,Math.abs(relief)*12);g.fillStyle=relief<0?'#79694e':'#b5a27d';g.fillRect(px+3,py+8,10,3);g.fillStyle=relief<0?'#b1a27b':'#d0bb91';g.fillRect(px+4,py+7,8,1);g.globalAlpha=1;}
    if(q?.wear>.5){const a=Math.min(.65,q.wear*.045),r=Math.min(4,1+q.wear*.13);g.globalAlpha=a;g.fillStyle=t===T.SAND?'#bfa884':'#a89870';
      g.beginPath();g.ellipse(px+8,py+9,r+1,r*.65,0,0,Math.PI*2);g.fill();
      for(const [dx,dy] of [[1,0],[0,1]])if((W.traces?.[i+dx+dy*W.MW]?.wear||0)>.5){g.lineWidth=Math.round(r*1.4);g.beginPath();g.moveTo(px+8,py+9);g.lineTo(px+8+dx*TS,py+9+dy*TS);g.strokeStyle=g.fillStyle;g.stroke();}
      g.globalAlpha=1;
    }
    if(q?.ash>.02){g.globalAlpha=Math.min(.8,q.ash*.4);g.fillStyle='#756956';g.fillRect(px+4,py+6,9,5);g.fillStyle='#b4a88a';g.fillRect(px+5,py+7,5,1);g.globalAlpha=1;}
    const water=W.hydro?(W.hydro.pool[i]||0)*250:s.puddle,ice=W.hydro?(W.hydro.ice[i]||0)*250:s.ice;
    if(water+ice>.6&&!W.treeAt[i]){const r=Math.min(6,Math.sqrt(water+ice)*1.4);g.fillStyle=ice>.2?'#a8c6c5':'#638b89';g.fillRect(px+8-r,py+9,r*2,2);g.fillRect(px+9-r*.7,py+8,r*1.4,1);g.fillStyle=ice>.2?'#d8e8dd':'#a4bbb0';g.fillRect(px+8-r*.6,py+9,r*.7,1);}
    if(s.frost>.12&&h<.7){g.globalAlpha=Math.min(.65,s.frost);g.fillStyle='#d7dfc9';g.fillRect(px+2,py+5,3,1);g.fillRect(px+11,py+11,2,1);g.globalAlpha=1;}
  }
  if(s.snow>.1&&terr){const layer=snowLayer(W,terr);g.drawImage(layer,-sx,-sy);}
}
