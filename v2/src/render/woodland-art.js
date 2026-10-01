// Authored foliage stays in world units. Loading and pixel preparation never
// touch the world, advance its clock, or consume simulation randomness.
import { canvas } from './pix.js';
import { hash3 } from '../core/rng.js';

export const FOLIAGE_GRID = 3;
const images = new Map(), prepared = new Map();
const species = ['oak', 'birch', 'pine', 'rowan', 'hazel'];
const objects = ['bramble', 'gorse', 'fern', 'reeds', 'boulder', 'pebbles','reeds-green','reeds-heads','reeds-short','reeds-autumn',...['dry','wet','old','snow'].map(n=>'driftwood-'+n),...['fern','bramble','gorse'].flatMap(k=>[0,1,2,3].map(n=>k+'-state-'+n))];
let loading;

export function loadWoodlandArt() {
  if (loading) return loading;
  const assets = [...species.flatMap(kind => ['summer', 'autumn'].map(season => [kind+':'+season,kind+'-'+season])), ...objects.map(kind=>[kind,kind])];
  loading = Promise.allSettled(assets.map(([key,file]) =>
    new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('Foliage load timed out')); }, 5000);
      image.onload = () => { clearTimeout(timer); images.set(key, image); resolve(); };
      image.onerror = () => { clearTimeout(timer); reject(new Error(`Missing woodland art: ${file}`)); };
      image.src = new URL(`../../assets/woodland/${file}.png`, import.meta.url).href;
    })
  ));
  return loading;
}

export function authoredCanopy(kind, width, height, variant, autumn, fall, snow) {
  const summer = images.get(`${kind}:summer`), gold = images.get(`${kind}:autumn`);
  if (!summer || !gold) return null;
  const turn = kind === 'pine' ? 0 : Math.max(0, Math.min(1, autumn + (hash3(variant, 3, 77) - .5) * .55));
  const bucket = Math.round(turn * 64) / 64;
  const key = [kind, width, height, variant & 7, bucket, fall, snow].join(':');
  if (prepared.has(key)) return prepared.get(key);
  const n = FOLIAGE_GRID, cv = canvas(width*n, height*n), g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  blend(g,cv,[[summer,1-bucket],[gold,bucket]]);
  const im = g.getImageData(0, 0, cv.width, cv.height), d = im.data;
  // Clustered loss preserves the simulation's finite leaves. Snow sits on the
  // remaining upper silhouette; neither operation changes plant inventories.
  for (let y=0; y<cv.height; y++) for (let x=0; x<cv.width; x++) {
    const i=(y*cv.width+x)*4;
    if(fall>0){const threshold=hash3(Math.floor(x/(n*2)),Math.floor(y/(n*2)),variant+71);d[i+3]*=fall>=1?0:Math.max(0,Math.min(1,(threshold-fall)*32+1));}
  }
  if (snow > 0) for (let x=0; x<cv.width; x++) for (let y=0; y<cv.height; y++) {
    const i=(y*cv.width+x)*4;
    if (d[i+3] < 96 || (y > 0 && d[i-cv.width*4+3] > 96)) continue;
    if (hash3(Math.floor(x/n), variant, 81) > Math.min(1, snow*.32)) continue;
    for (let j=0; j<Math.min(n*snow, cv.height-y); j++) {
      const at=i+j*cv.width*4;
      if (d[at+3] > 96) { d[at]=232-j*2; d[at+1]=238-j; d[at+2]=220-j; }
    }
  }
  const leaf=canvas(cv.width,cv.height);leaf.getContext('2d').putImageData(im,0,0);g.clearRect(0,0,cv.width,cv.height);
  if(kind!=='pine'){
    // The same twig skeleton sits under every seasonal copy. As finite leaves
    // disappear, branches emerge at their existing positions rather than pop in.
    const stroke=(ax,ay,bx,by,wide)=>{const steps=Math.ceil(Math.max(Math.abs(bx-ax),Math.abs(by-ay))*n);for(let j=0;j<=steps;j++){const x=Math.round((ax+(bx-ax)*j/steps)*n),y=Math.round((ay+(by-ay)*j/steps)*n);g.fillStyle=kind==='birch'?'#a4aa8d':'#7b5937';g.fillRect(x,y,wide,1);}};
    const cx=width*.5,base=height,top=height*.25;stroke(cx,base,cx-.7,top,2);
    for(let j=0;j<7;j++){const side=j%2?-1:1,y=height*(.34+j*.07),endX=cx+side*width*(.18+hash3(j,variant,883)*.17),endY=y-height*.15;stroke(cx,y,endX,endY,1);stroke(endX,endY,endX+side*width*.04,endY-height*.12,1);}
  }
  g.drawImage(leaf,0,0);
  prepared.set(key, cv);
  if (prepared.size > 384) prepared.delete(prepared.keys().next().value);
  return cv;
}

function blend(g,cv,entries){
  const out=g.createImageData(cv.width,cv.height),tmp=canvas(cv.width,cv.height),tg=tmp.getContext('2d');tg.imageSmoothingEnabled=false;
  const sums=new Float32Array(out.data.length);
  for(const [img,weight] of entries){if(!img||weight<=0)continue;tg.clearRect(0,0,cv.width,cv.height);tg.drawImage(img,0,0,cv.width,cv.height);const d=tg.getImageData(0,0,cv.width,cv.height).data;
    for(let i=0;i<d.length;i+=4){const a=d[i+3]/255*weight;sums[i]+=d[i]*a;sums[i+1]+=d[i+1]*a;sums[i+2]+=d[i+2]*a;sums[i+3]+=a;}
  }
  for(let i=0;i<sums.length;i+=4){const a=sums[i+3];if(!a)continue;for(let k=0;k<3;k++)out.data[i+k]=sums[i+k]/a;out.data[i+3]=Math.min(255,a*255);}g.putImageData(out,0,0);
}
export function authoredProp(kind, width, height, variant, season = {}) {
  const source = images.get(kind==='driftwood'?'driftwood-dry':kind);
  if (!source) return null;
  const quant=v=>Math.round(Math.max(0,Math.min(1,v||0))*64)/64;
  const fruit=quant(season.fruit),flowers=quant(season.flower),autumn=quant(season.autumn),fall=quant(season.fall),seedHeads=quant(Math.max(autumn,fruit)),wet=quant(season.wet),age=quant(season.age),snow=quant(season.snow);
  const key=['prop',kind,width,height,variant&3,fruit,flowers,autumn,fall,wet,age,snow].join(':');
  if(prepared.has(key))return prepared.get(key);
  const n=FOLIAGE_GRID,cv=canvas(width*n,height*n),g=cv.getContext('2d');g.imageSmoothingEnabled=false;
  let family=false;
  if(kind==='driftwood'){
    blend(g,cv,[[source,(1-wet)*(1-age)*(1-snow)],[images.get('driftwood-wet'),wet*(1-age)*(1-snow)],[images.get('driftwood-old'),age*(1-snow)],[images.get('driftwood-snow'),snow]]);family=true;
  }else if(kind==='reeds'&&images.has('reeds-green')){
    const gold=autumn,heads=seedHeads*(1-gold),green=1-gold-heads;
    blend(g,cv,[[images.get((variant&3)===0?'reeds-short':'reeds-green'),green],[images.get('reeds-heads'),heads],[images.get('reeds-autumn'),gold]]);family=true;
  }else if(images.has(kind+'-state-0')){
    const states=[0,0,0,0];if(kind==='fern'){states[3]=fall;states[2]=autumn*(1-fall);states[1]=(1-autumn)*(1-fall);}
    else{states[3]=autumn;states[kind==='bramble'?2:1]=fruit*(1-autumn);states[1]+=flowers*(1-autumn)*(1-fruit);states[0]=1-states.reduce((a,b)=>a+b,0);}
    blend(g,cv,states.map((w,k)=>[images.get(kind+'-state-'+k),w]));family=true;
  }else g.drawImage(source,0,0,cv.width,cv.height);
  if(kind==='boulder'||kind==='pebbles'){
    const im=g.getImageData(0,0,cv.width,cv.height),d=im.data,identity=(hash3(variant,13,987)-.5)*.07;
    for(let y=0;y<cv.height;y++)for(let x=0;x<cv.width;x++){const i=(y*cv.width+x)*4;if(d[i+3]<96)continue;for(let c=0;c<3;c++)d[i+c]*=1-wet*.18+identity;
      if(snow>0&&(y===0||d[i-cv.width*4+3]<96)&&hash3(x,variant,992)<snow){d[i]=236;d[i+1]=235;d[i+2]=215;}}
    g.putImageData(im,0,0);
  }
  if(!family&&kind==='bramble'&&(fruit||flowers)) {
    const d=g.getImageData(0,0,cv.width,cv.height).data;
    for(let k=0;k<(fruit?8:6);k++){
      const x=Math.floor((.15+hash3(k,variant,41)*.7)*cv.width),y=Math.floor((.2+hash3(k,variant,42)*.55)*cv.height);
      if(d[(y*cv.width+x)*4+3]<96)continue;g.globalAlpha=fruit||flowers;
      g.fillStyle=fruit?'#302828':'#f3eee0';g.fillRect(x,y,n,n);
      if(fruit){g.fillStyle='#73513f';g.fillRect(x,y,1,1);}
    }
  }
  if(!family&&kind==='reeds'&&seedHeads)for(let k=0;k<3;k++){
    const x=Math.round((.25+k*.24)*cv.width),y=Math.round((.22+k*.14)*cv.height);
    g.fillStyle='#665137';g.fillRect(x,y,2,Math.max(3,3*n));g.fillStyle='#b1945d';g.fillRect(x,y,1,2*n);
  }
  g.globalAlpha=1;prepared.set(key,cv);if(prepared.size>384)prepared.delete(prepared.keys().next().value);
  return cv;
}
