// Precomputed shores, a viewport-sized pixel shader and clipped reflection bands.
// Reads physical water state. Never advances the simulation or consumes its RNG.
import { T, WATER } from '../world/gen.js';
import { hash3 } from '../core/rng.js';
import { canvas } from './pix.js';
import { tree } from './sprites.js';
import { localWeather } from '../sim/atmosphere.js';
const LUT=new Float32Array(4096),TURN=4096/(Math.PI*2);
for(let i=0;i<LUT.length;i++)LUT[i]=Math.sin(i/TURN);
const sin=p=>LUT[(p|0)&4095],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const shallow=[113,174,163],middle=[58,126,137],deep=[27,69,87],abyss=[20,48,64],fresh=[70,139,141],freshDeep=[41,94,110],foam=[218,236,211];
const trees=new Set(['oak','birch','pine','rowan','hazel']);
const iceColor=[178,202,187];
export function createWaterRenderer(terr,W) {
  const {PW,PH,mat,wd}=terr,n=PW*PH,landDistance=new Uint16Array(n),nearest=new Uint8Array(n),texture=new Uint8Array(n);
  for(let y=0;y<PH;y++)for(let x=0;x<PW;x++){const i=y*PW+x;landDistance[i]=WATER(mat[i])?0:60000;nearest[i]=mat[i];texture[i]=hash3(x,y,W.seed+809)*255;}
  const visit=(i,j)=>{if(landDistance[j]+1<landDistance[i]){landDistance[i]=landDistance[j]+1;nearest[i]=nearest[j];}};
  for(let y=0;y<PH;y++)for(let x=0;x<PW;x++){const i=y*PW+x;if(x)visit(i,i-1);if(y)visit(i,i-PW);}
  for(let y=PH-1;y>=0;y--)for(let x=PW-1;x>=0;x--){const i=y*PW+x;if(x<PW-1)visit(i,i+1);if(y<PH-1)visit(i,i+PW);}
  let cv,cg,im,ref,rg,oldW=0,oldH=0,oldRaster=0;
  const resize=V=>{if(V.aw===oldW&&V.ah===oldH&&V.raster===oldRaster)return;oldW=V.aw;oldH=V.ah;oldRaster=V.raster;
    cv=canvas(V.aw+1,V.ah+1);cg=cv.getContext('2d');im=cg.createImageData(cv.width,cv.height);ref=canvas(V.aw*V.raster,V.ah*V.raster);rg=ref.getContext('2d');rg.imageSmoothingEnabled=false;rg.setTransform(V.raster,0,0,V.raster,0,0);};
  function draw(g,V,W,now,sx,sy) {
    resize(V);const h=W.hydro||{},t=now/1000,x=localWeather(W,V.cam.x/16,V.cam.y/16),D=im.data;D.fill(0);
    const wave=h.wave??.1,sun=clamp((x.sun||0)/450,0,1),period=.72/(1+wave*.2),time=t*TURN;
    const dir=x.windDir*Math.PI/4,dx=Math.cos(dir)*.11,dy=Math.sin(dir)*.11,wind=Math.min(1,x.wind/14);
    const tide=x.tide*.9,streamWidth=(Math.sqrt(Math.max(.001,h.streamDepth??.14)/.14)-1)*2.8,lakeWidth=((h.lakeDepth??.65)-.65)*6;
    const lakeIce=clamp((h.freshIce||0)/Math.max(1,(W.hydroMap?.lake.length||0)*4)/.015,0,.95);
    // At wide zoom, reuse interior shading in small blocks. Shore edges always retain every art pixel.
    const stride=Math.min(4,Math.max(1,Math.ceil(Math.sqrt(V.aw*V.ah/65000))));
    const offsetX=Math.floor(sx)-sx,offsetY=Math.floor(sy)-sy;
    for(let y=0;y<cv.height;y++){
      const wy=Math.floor(sy+y),row=clamp(wy,0,PH-1)*PW,tileRow=Math.floor(wy/16)*W.MW;
      for(let xx=0;xx<cv.width;xx++){
        const wx=Math.floor(sx+xx),outside=wx<0||wx>=PW||wy<0||wy>=PH;
        const i=row+clamp(wx,0,PW-1),m=outside?T.DEEP:mat[i],water=WATER(m),kind=water?m:nearest[i],sea=kind<=1;
        const poolTile=tileRow+Math.floor(wx/16),pool=(h.pool?.[poolTile]||0)/4;
        if(!water&&pool>.005&&W.ter[poolTile]>1){const o=(y*cv.width+xx)*4;D[o]=66;D[o+1]=116;D[o+2]=110;D[o+3]=Math.min(200,35+pool*700);continue;}
        if(!water&&(landDistance[i]>7||m===T.ROCK))continue;
        if(stride>1&&water&&(outside||wd[i]>stride*3)){
          const o=(y*cv.width+xx)*4;
          const previous=wx%stride&&xx>0&&(outside?D[o-1]===255:mat[i-1]===m&&wd[i-1]>stride*3)?o-4:wy%stride&&y>0&&(outside?D[o-cv.width*4+3]===255:mat[i-PW]===m&&wd[i-PW]>stride*3)?o-cv.width*4:-1;
          if(previous>=0){D[o]=D[previous];D[o+1]=D[previous+1];D[o+2]=D[previous+2];D[o+3]=255;continue;}
        }
        const d=outside?1e6:water?wd[i]:-landDistance[i],noise=outside?hash3(wx,wy,W.seed+809):texture[i]/255,phase=(wx*.075+wy*.031)*TURN+time*period,breath=sin(phase);
        const advance=sea?tide+(.5+.5*breath)*(1.3+wave*3):kind===T.STREAM?streamWidth:kind===T.LAKE?lakeWidth:0,wet=d+advance,o=(y*cv.width+xx)*4;
        if(wet<0){
          if(water){D[o]=117+noise*9;D[o+1]=129+noise*8;D[o+2]=97+noise*6;D[o+3]=255;}
          else if(sea&&(m===T.SAND||m===T.SHINGLE)&&landDistance[i]<3.2+wave*2){D[o]=67;D[o+1]=104;D[o+2]=91;D[o+3]=55;}continue;
        }
        // Subtle stepped depth bands keep the surface legible as pixel art.
        const dp=sea?Math.max(0,wet)/18:Math.max(0,wet)/9;let a,b,k;
        if(sea){if(dp<1.8){a=shallow;b=middle;k=dp/1.8;}else if(dp<5){a=middle;b=deep;k=(dp-1.8)/3.2;}else{a=deep;b=abyss;k=Math.min(1,(dp-5)/8);}}
        else{a=fresh;b=freshDeep;k=Math.min(.8,dp*.17);}
        const tile=tileRow+Math.floor(wx/16),flowX=W.hydroMap?.fx[tile]||0,flowY=W.hydroMap?.fy[tile]||1;
        const rip=sin((wx*dx+wy*dy)*TURN-time*(.4+wind*.3)),cross=sin((wx*.19-wy*.13)*TURN+time*.23);
        const caustic=Math.max(0,sin((wx*.31+wy*.17)*TURN+time*.41)+sin((wy*.29-wx*.09)*TURN-time*.37)-1.12)*sun*Math.max(0,1-dp/3)*28;
        const current=kind===T.STREAM?sin((wx*flowX+wy*flowY)*.55*TURN-time*(.8+Math.min(1,h.flow||0)*6)):0;
        const crest=Math.max(0,rip-.78)*24*(.3+wind*.7);
        const sheen=(rip*.55+cross*.45)*(3+wind*3)+crest+caustic+Math.max(0,current-.55)*21;
        const foamFront=.6+(.5+.5*breath)*(1.8+wave*3),edge=sea?Math.max(0,1-Math.abs(d-tide-foamFront)*1.2)*(.35+noise*.4):0;
        const wash=!water&&sea?Math.max(0,1-Math.abs(wet)*1.2)*.65:0,f=Math.max(edge,wash),sediment=sea?0:(h.sediment||0)*18;
        k=Math.floor(k*24)/24;
        const frozen=kind===T.LAKE?lakeIce:0;
        for(let c=0;c<3;c++){const color=a[c]+(b[c]-a[c])*k+sheen+(c===0?sediment:c===2?-sediment:0),lit=color+(foam[c]-color)*f;D[o+c]=clamp(lit+(iceColor[c]-lit)*frozen,0,255);}
        D[o+3]=water?255:sea?clamp(wet*190+35,0,220):220;
      }
    }
    cg.putImageData(im,0,0);g.drawImage(cv,offsetX,offsetY);
    // Sparse, softly travelling wavelets make calm water visibly alive without flashing speckles.
    const grid=V.raster,snap=v=>Math.round(v*grid)/grid;
    for(let gy=Math.floor(sy/24);gy<=Math.floor((sy+V.ah)/24);gy++)for(let gx=Math.floor(sx/24);gx<=Math.floor((sx+V.aw)/24);gx++){
      const q=hash3(gx,gy,W.seed+833),px=gx*24+q*19,py=gy*24+hash3(gx,gy,W.seed+834)*19,ix=Math.floor(px),iy=Math.floor(py);
      const outside=ix<0||iy<0||ix>=PW||iy>=PH,i=iy*PW+ix,kind=outside?T.DEEP:mat[i];if(!WATER(kind)||kind===T.STREAM||(!outside&&wd[i]<5))continue;
      const phase=t*.62+q*15,life=(1+Math.sin(phase))*.5,length=2+q*4+wind*3;
      const frozen=kind===T.LAKE?lakeIce:0,alpha=life*life*(.14+sun*.16+wind*.1)*(1-frozen);
      const px0=snap(px-sx+Math.sin(phase*.7)*(1+wave*2)),py0=snap(py-sy+Math.cos(phase*.7)*(.5+wave));
      g.globalAlpha=alpha;g.fillStyle='#b8d8cc';g.fillRect(px0,py0,length,1/grid);g.fillRect(px0-1,py0+1/grid,1,1/grid);g.fillRect(px0+length,py0+1/grid,1,1/grid);
    }g.globalAlpha=1;
    // Reflect actual nearby crowns, with small distortion strips; clip against this frame's water coverage.
    rg.clearRect(0,0,V.aw,V.ah);const reflect=.22/(1+wave*3);
    for(const e of W.ents){
      const px=e.x*16-sx,py=e.y*16-sy;if(px<-45||px>V.aw+45||py<-50||py>V.ah+30||!trees.has(e.k))continue;
      const baseX=Math.floor(e.x*16),baseY=Math.floor(e.y*16),i=baseY*PW+baseX;if(baseX<0||baseY<0||baseX>=PW||baseY>=PH||landDistance[i]>28)continue;
      const s=tree(e.k,e.size,e.id,{autumn:e.aut||0,fall:e.fall||0,snow:W.surface?.snow||0});if(!s.crown)continue;
      rg.save();rg.translate(px,py+2);rg.scale(1,-.42);rg.globalAlpha=reflect;
      for(let y=0;y<s.crown.height;y+=3){const band=Math.min(3,s.crown.height-y),shift=Math.sin(now/1100+y*.35+e.id)*(.25+wave*.5);rg.drawImage(s.crown,0,y,s.crown.width,band,-s.cx+shift,-s.trunk.height-s.crown.height+6+y,s.crown.width,band);}rg.restore();
    }
    const fraction=clamp((W.t%10+((Date.now()-W.born)/60000-W.t))/10,0,1),curve=terr.streamCurve;
    for(const q of h.debris||[]){
      const at=q.prev+(q.at-q.prev)*fraction,k=Math.floor(at),u=at-k;if(!curve[k]||!curve[k+1])continue;
      const cr=(a,b,c,d)=>.5*(2*b+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
      const a=curve[Math.max(0,k-1)],b=curve[k],c=curve[k+1],d=curve[Math.min(curve.length-1,k+2)],px=cr(a[0],b[0],c[0],d[0])-sx,py=cr(a[1],b[1],c[1],d[1])-sy;
      rg.fillStyle='#ae8151';rg.fillRect(px,py,2,1);rg.fillStyle='#d1aa70';rg.fillRect(px+.3,py-.3,1,1);
    }
    rg.globalCompositeOperation='destination-in';rg.drawImage(cv,offsetX,offsetY);rg.globalCompositeOperation='source-over';g.drawImage(ref,0,0,V.aw,V.ah);
    if(x.rain>.05&&x.temp>1){
      const count=Math.min(45,Math.floor(V.aw*V.ah*x.rain/4500)),grid=V.raster;
      for(let k=0;k<count;k++){
        const px=hash3(k,1,W.seed)*V.aw,py=hash3(k,2,W.seed)*V.ah,ix=Math.floor(px+sx),iy=Math.floor(py+sy);
        if(ix<0||iy<0||ix>=PW||iy>=PH||!WATER(mat[iy*PW+ix]))continue;
        const age=(t*.65+hash3(k,3,W.seed))%1,r=.3+age*2.6;g.globalAlpha=(1-age)*.28;g.fillStyle='#d4e8d2';
        for(let q=0;q<8;q++){const angle=q*Math.PI/4;g.fillRect(Math.round((px+Math.cos(angle)*r)*grid)/grid,Math.round((py+Math.sin(angle)*r*.45)*grid)/grid,1/grid,1/grid);}
      }g.globalAlpha=1;
    }
  }
  return{draw};
}
