// Animals as pixel art, painted from their pose and an animation frame: the ship's dog (a rough-coated collie cross,
// tan and white, with the frayed rope still round its neck), gulls, rabbits.
import { R } from "./palette.js";
import { sprite,canvas } from "./pix.js";
import {detailSprite,motionFrames} from './motion.js';
import {jointedDog} from './dogrig.js';

const cache = new Map();
const memo = (k, f) => { let v = cache.get(k); if (!v) { v = f(); cache.set(k, v); if(cache.size>512)cache.delete(cache.keys().next().value); } return v; };
const TAN = ["#7a4a24", "#9c6232", "#bd7f43", "#d9a466"], WHITE = ["#bdb4a4", "#e2dccf", "#f6f2e8"], ROPE = "#c9b27a", NOSE = "#241812";
const rect = (P, x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) P.set(x + i, y + j, typeof c === "function" ? c(i, j) : c); };

// ---------------- the dog (faces right; feet at (8, 11))

const DOGF = { run: 2, trot: 2, walk: 2, sit: 2, stand: 2, beg: 2, shake: 2, eat: 2, drink: 2 };
export function dogSprite(pose, t) {
  return jointedDog({act:pose,tail:pose==='run'?'wag':'low',ears:'back'},t);
}
// the dog adrift on the hatch cover, riding the swell
export function raftSprite(t) {
  return memo('raft-fine',()=>{const cv=canvas(54,36),g=cv.getContext('2d');g.imageSmoothingEnabled=false;
    for(let y=24;y<33;y++)for(let x=3;x<51;x++){g.fillStyle=y===24?'#c3a36d':x%12<2?'#493e2d':y%3===0?'#987648':'#765a36';g.fillRect(x,y,1,1);}
    const dog=jointedDog({act:'lie',tail:'low',ears:'back'},0);g.drawImage(dog.img,0,0,51,36);return {img:cv,ox:9,oy:10,w:18,h:12};});
}

// ---------------- gulls: white and grey, yellow bill, flapping when flying
export function gullSprite(pose, t, id) {
  const period=pose==='fly'?900:1800,n=motionFrames(period),f=Math.floor((t/period+(id||0))%1*n),p=f/n*Math.PI*2;
  return memo(`fine-gull:${pose}:${f}`,()=>({img:detailSprite(11,8,P=>{
    oval(P,5,4.7,2.7,1.3,['#849c97','#d6ddd0','#f3efdb']);
    if(pose==='fly'){const wing=Math.sin(p)*2.4;fineLine(P,4.5,4,1,3-wing,'#98aaa5',.4);fineLine(P,6,4,9.8,3-wing,'#d8e1d2',.4);fineLine(P,1,3-wing,.3,3.4-wing,'#465d5b',.35);}
    else{fineLine(P,2,4,1,4.5,'#44564f',.45);if(pose!=='swim'){fineLine(P,4,5.5,3.6,7,'#b99957',.17);fineLine(P,6,5.5,6.4,7,'#b99957',.17);}}
    const hy=pose==='peck'?3.5+Math.sin(p)*1.1:pose==='fly'?3.8:2.4;oval(P,7.6,hy,1.2,1.1,['#a6bdb1','#e6e8d5','#faf2d9']);fineLine(P,8.5,hy+.4,9.8,hy+.7,'#d4af54',.27);P.dot(8,hy-.1,'#354c44');
  }),ox:5,oy:7,w:11,h:8}));
}

// ---------------- rabbits: brown-grey, white scut
export function rabbitSprite(pose, t, id) {
  const moving=pose==='hop'||pose==='bolt',period=moving?650:1800,n=motionFrames(period),f=Math.floor((t/period+(id||0))%1*n),p=f/n*Math.PI*2;
  return memo(`fine-rabbit:${pose}:${f}`,()=>({img:detailSprite(9,8,P=>{
    const lift=moving?Math.max(0,Math.sin(p))*1.1:0,hy=pose==='graze'?3+Math.sin(p)*.35:2.1-lift;
    oval(P,3.4,4.3-lift,2.7,1.7,['#645c48','#8d8062','#b6a57c']);oval(P,1,4-lift,.7,.8,['#b9bb9d','#e5e4c5','#f3edd2']);
    fineLine(P,2,5.4-lift,1.6+(moving?Math.cos(p)*.8:0),6.4,'#70664f',.4);fineLine(P,5.3,5.2-lift,6.1+(moving?Math.cos(p)*.8:0),6.5,'#978464',.3);
    oval(P,6,hy+1.1,1.5,1.2,['#6e624c','#a08e6b','#baa67d']);fineLine(P,5.5,hy+.5,5.2,hy-1.4,'#887957',.3);fineLine(P,6.3,hy+.3,6.5,hy-1.3,'#b8a281',.3);P.dot(6.8,hy+.7,'#364536');P.dot(7.5,hy+1.3,'#5e5142');
    fineLine(P,6.7,hy+1.5,7.7,hy+1.6,'#c4b392',.1);
  }),ox:4,oy:6,w:9,h:8}));
}

// ---------------- a snare on its peg; a caught rabbit; scraps
export function snareSprite(set, caught) {
  return memo(`fine-snare:${set}:${caught}`,()=>({img:detailSprite(9,9,P=>{if(set){fineLine(P,4,2,4,7,'#ab8b59',.4);for(let k=0;k<32;k++)P.dot(4+Math.cos(k/32*Math.PI*2)*1.7,4+Math.sin(k/32*Math.PI*2)*1.6,'#c6b580');}if(caught)oval(P,4,6,3,1.2,['#675e47','#928161','#b9a27b']);}),ox:4,oy:7,w:9,h:9}));
}
export function scrapsSprite(item={}) {const quarry=item.k==='quarry',amount=Math.round(Math.min(1,(item.kcal??200)/400)*16)/16;return memo('fine-scraps:'+quarry+':'+amount,()=>({img:detailSprite(8,5,P=>{if(quarry){oval(P,4,3,2.8,1.2,['#6c624c','#948365','#b3a07a']);P.dot(1,2.7,'#ded7b5');}else{oval(P,3,3,1.8*Math.max(.25,amount),.9,['#85614b','#b18b69','#ceab85']);fineLine(P,4,2.3,6,2.8,'#d8cdb0',.2);}}),ox:4,oy:4,w:8,h:5}));}
function oval(P,cx,cy,rx,ry,cols){for(let y=Math.floor((cy-ry)*3);y<=(cy+ry)*3;y++)for(let x=Math.floor((cx-rx)*3);x<=(cx+rx)*3;x++){const dx=(x/3-cx)/rx,dy=(y/3-cy)/ry;if(dx*dx+dy*dy<=1)P.dot(x/3,y/3,cols[-dx*.5-dy*.8>.4?2:dy>.5?0:1]);}}
function fineLine(P,x0,y0,x1,y1,c,r){const n=Math.ceil(Math.hypot(x1-x0,y1-y0)*6)||1;for(let k=0;k<=n;k++)for(let y=-r;y<=r;y+=1/3)for(let x=-r;x<=r;x+=1/3)if(x*x+y*y<=r*r+.03)P.dot(x0+(x1-x0)*k/n+x,y0+(y1-y0)*k/n+y,c);}
