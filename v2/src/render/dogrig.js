// A jointed collie: four two-bone legs, spine, neck, ears and tail, shaded in warm pixels.
import { sprite } from './pix.js';
const cache = new Map();
const C = { dark:'#755032', coat:'#b78150', light:'#d9ae78', white:'#f3ecda', shade:'#d0c6ae', nose:'#37281d', rope:'#baa16b' };
function limb(P,a,b,r,c) {
  const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2)||1;
  for(let k=0;k<=n;k++){const x=a[0]+(b[0]-a[0])*k/n,y=a[1]+(b[1]-a[1])*k/n;
    for(let j=-r;j<=r;j++)for(let i=-r;i<=r;i++)if(i*i+j*j<=r*r+.5)P.set(Math.round(x+i),Math.round(y+j),c);
  }
}
function ellipse(P,cx,cy,rx,ry,a,b){for(let y=Math.floor(cy-ry);y<=cy+ry;y++)for(let x=Math.floor(cx-rx);x<=cx+rx;x++)if(((x-cx)/rx)**2+((y-cy)/ry)**2<=1)P.set(x,y,y<cy-1?a:b);}
export function jointedDog(a,t) {
  const pose=a.curled?'sleep':a.act||'stand',moving=['walk','trot','run','shy'].includes(pose),low=['eat','drink','sniff'].includes(pose),sleep=['sleep','lie'].includes(pose),sit=pose==='sit';
  const n=moving?8:4,f=Math.floor(t/(moving?pose==='run'?75:110:450))%n,key=[pose,f,a.tail,a.ears].join(':');
  if(cache.has(key))return cache.get(key);
  const img=sprite(32,25,P=>{
    const p=f/n*Math.PI*2,bob=moving?Math.abs(Math.sin(p*2))*.8:0;
    if(sleep){ellipse(P,13,19,10,4,C.light,C.coat);ellipse(P,22,18,5,3,C.light,C.coat);limb(P,[7,20],[21,21],1,C.shade);P.set(27,18,C.nose);P.set(23,17,pose==='lie'?C.nose:C.dark);limb(P,[22,14],[20,16],1,C.dark);return;}
    const hip=[10,sit?15:13+bob],shoulder=[21,sit?10:12+bob];
    const joints=[{x:11,near:false},{x:19,near:false},{x:9,near:true},{x:21,near:true}];
    for(const q of joints.filter(q=>!q.near)){const swing=moving?Math.sin(p+(q.x<15?Math.PI:0))*3:0;limb(P,[q.x,14],[q.x+swing*.5,18],1,C.dark);limb(P,[q.x+swing*.5,18],[q.x+swing,22],1,C.shade);}
    limb(P,hip,shoulder,4,C.coat);limb(P,[hip[0]-1,hip[1]-2],[shoulder[0]-1,shoulder[1]-2],2,C.light);
    ellipse(P,shoulder[0],shoulder[1]+2,3,4,C.white,C.shade);
    for(const q of joints.filter(q=>q.near)){const swing=moving?Math.sin(p+(q.x<15?0:Math.PI))*3:0,foot=sit&&q.x<15?[7,22]:[q.x+swing,22-Math.max(0,moving?Math.cos(p+(q.x<15?0:Math.PI))*2:0)];limb(P,[q.x,q.x<15?hip[1]:shoulder[1]+2],[q.x+swing*.6,18],1,C.coat);limb(P,[q.x+swing*.6,18],foot,1,C.white);P.set(foot[0]+1,foot[1],C.shade);}
    const neck=[24,low?14:7];limb(P,shoulder,neck,2,C.white);ellipse(P,25,low?15:7,4,3,C.light,C.coat);
    const hy=low?15:7;limb(P,[27,hy+1],[30,hy+1],1,C.white);P.set(31,hy+1,C.nose);P.set(26,hy-1,C.nose);P.set(25,hy-2,C.light);
    limb(P,[23,hy-3],[a.ears==='alert'?22:21,hy+(a.ears==='back'?1:-1)],1,C.dark);
    limb(P,[22,hy+3],[20,hy+5],.8,C.rope);P.set(19,hy+6,C.rope);
    const wag=a.tail==='wag'?Math.sin(p)*2:0,tailY=a.tail==='low'?18:9+wag;
    limb(P,[7,hip[1]],[3,tailY],1,C.coat);limb(P,[3,tailY],[1,tailY-1],1,C.white);
    if(pose==='drink')P.set(30,hy+3,'#88b8bc');
  });
  const s={img,ox:16,oy:22};cache.set(key,s);return s;
}
