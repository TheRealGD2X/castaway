// Precomputed shores, a viewport-sized pixel shader and clipped reflection bands.
// Reads physical water state. Never advances the simulation or consumes its RNG.
import { T, WATER } from '../world/gen.js';
import { hash3 } from '../core/rng.js';
import { canvas } from './pix.js';
import { tree,shrub,rock } from './sprites.js';
import { localWeather } from '../sim/atmosphere.js';
import { coastal } from '../sim/ocean.js';
import { oceanSurface,surfaceAt,oceanPoint } from './ocean-surface.js';
import { concentration } from '../sim/ocean-grid.js';
import { displaySeconds } from './simulation-clock.js';
import { vnoise } from '../core/noise.js';
const LUT=new Float32Array(4096),TURN=4096/(Math.PI*2);
for(let i=0;i<LUT.length;i++)LUT[i]=Math.sin(i/TURN);
const sin=p=>LUT[(p|0)&4095],clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const shallow=[128,174,143],middle=[48,126,135],deep=[28,86,111],abyss=[18,55,78],fresh=[102,145,119],freshDeep=[29,91,112],foam=[247,245,223];
const trees=new Set(['oak','birch','pine','rowan','hazel']);
const iceColor=[178,202,187];
let waterArt,artLoading;
export function loadWaterArt(){
  return artLoading ||= new Promise(resolve=>{
    const image=new Image(),timer=setTimeout(()=>{image.onload=image.onerror=null;resolve();},5000);
    image.onload=()=>{clearTimeout(timer);waterArt=image;resolve();};image.onerror=()=>{clearTimeout(timer);resolve();};
    image.src=new URL('../../assets/water/surface.png',import.meta.url).href;
  });
}
export function createWaterRenderer(terr,W) {
  const {PW,PH,mat,wd}=terr,n=PW*PH,landDistance=new Uint16Array(n),nearest=new Uint8Array(n),texture=new Uint8Array(n),bedTexture=new Uint8Array(n);
  for(let y=0;y<PH;y++)for(let x=0;x<PW;x++){const i=y*PW+x;landDistance[i]=WATER(mat[i])?0:60000;nearest[i]=mat[i];texture[i]=hash3(x,y,W.seed+809)*255;bedTexture[i]=vnoise(x*.09,y*.09,W.seed+817)*255;}
  const visit=(i,j)=>{if(landDistance[j]+1<landDistance[i]){landDistance[i]=landDistance[j]+1;nearest[i]=nearest[j];}};
  for(let y=0;y<PH;y++)for(let x=0;x<PW;x++){const i=y*PW+x;if(x)visit(i,i-1);if(y)visit(i,i-PW);}
  for(let y=PH-1;y>=0;y--)for(let x=PW-1;x>=0;x--){const i=y*PW+x;if(x<PW-1)visit(i,i+1);if(y<PH-1)visit(i,i+PW);}
  let cv,cg,im,ref,rg,mask,mg,maskImage,coverage,artCoverage,oldW=0,oldH=0,oldRaster=0;const sample={},macro={},point={};
  const artTiles=new Map();
  function surfaceTile(tileY,now){
    const tick=Math.floor(now/150),cached=artTiles.get(tileY);if(cached?.tick===tick)return cached.cv;
    const size=waterArt.width,n=size/128,c=cached?.cv||canvas(size,size),g=c.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,size,size);
    for(let y=0;y<128;y++){
      const shift=Math.round(Math.sin(tick*150/2800+(tileY*128+y)*.073)*.65*n);
      g.drawImage(waterArt,0,y*n,size,n,shift,y*n,size,n);
      if(shift>0)g.drawImage(waterArt,0,y*n,size,n,shift-size,y*n,size,n);
      else if(shift<0)g.drawImage(waterArt,0,y*n,size,n,shift+size,y*n,size,n);
    }
    artTiles.set(tileY,{tick,cv:c});if(artTiles.size>12)artTiles.delete(artTiles.keys().next().value);return c;
  }
  const resize=V=>{if(V.aw===oldW&&V.ah===oldH&&V.raster===oldRaster)return;oldW=V.aw;oldH=V.ah;oldRaster=V.raster;
    cv=canvas(V.aw+1,V.ah+1);cg=cv.getContext('2d');im=cg.createImageData(cv.width,cv.height);mask=canvas(cv.width,cv.height);mg=mask.getContext('2d');maskImage=mg.createImageData(cv.width,cv.height);coverage=new Uint8Array(cv.width*cv.height);artCoverage=new Uint8Array(coverage.length);ref=canvas(V.aw*V.raster,V.ah*V.raster);rg=ref.getContext('2d');rg.imageSmoothingEnabled=false;rg.setTransform(V.raster,0,0,V.raster,0,0);};
  function draw(g,V,W,now,sx,sy) {
    resize(V);const h=W.hydro||{},t=now/1000,x=localWeather(W,V.cam.x/16,V.cam.y/16),D=im.data;D.fill(0);coverage.fill(0);artCoverage.fill(0);
    const seconds=displaySeconds(W,now),ocean=W.ocean?coastal(W):null,field=ocean?oceanSurface(W,seconds,{x:sx/8-4,y:sy/8-4,width:V.aw/8+8,height:V.ah/8+8}):null;
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
        const pool=!water&&!outside?poolAt(h.pool,W.MW,W.MH,wx/16,wy/16):0;
        if(ocean&&sea&&(water||landDistance[i]<=7)){
          const X=wx/8,Y=wy/8; oceanPoint(W,X,Y,point);macroAt(point.g,point.x,point.y,macro);const depth=Math.max(0,macro.level-macro.bed),z=outside?macro.bed:bedAt(W,X,Y)+macro.relief,level=macro.level;
          surfaceAt(field,X,Y,sample);const physicalDepth=Math.max(0,level+sample.height-z),o=(y*cv.width+xx)*4;if(!water&&physicalDepth<=0)continue;
          const dp=physicalDepth,colourDepth=outside?dp:dp*.25+wd[i]/17*.75,sediment=macro.sediment,plankton=macro.plankton,shade=clamp(-sample.nx*.8-sample.ny*.5,-.6,.6)*13+sample.height*2,crest=macro.foam*clamp(.5+sample.height/Math.max(.03,depth)*2,0,1),turbid=clamp(sediment*2,0,.65),green=clamp(plankton*15,0,.2);
          const wet=1-Math.exp(-dp/.08),grain=(outside?hash3(wx,wy,W.seed+809):texture[i]/255)*4;
          const bedGrain=outside?.5:bedTexture[i]/255,bedLight=(bedGrain-.5)*18*Math.exp(-colourDepth*.7);
          const lightNet=colourDepth<4?causticAt(wx,wy,time,sun)*Math.exp(-colourDepth*.65)*(1-turbid)*.3:0;
          const roll=sin((wx*.028+wy*.017)*TURN+time*.14),distance=water?wd[i]:-landDistance[i];
          const front=1.1+(1+roll)*1.4+clamp(sample.height*5,-1,2),broken=clamp((bedGrain-.22)*1.6,0,1);
          const inner=Math.max(0,1-Math.abs(distance-front)*2)*broken*(.58+Math.min(.3,wave));
          const outer=Math.max(0,1-Math.abs(distance-(9+roll*2+sample.height*2))*2.4)*(texture[i]/255>.44?.52:0)*Math.min(1,wave);
          const shoreFoam=!outside&&water?Math.max(inner,outer):0;
          const glint=Math.max(0,sin((wx*dx+wy*dy)*TURN-time*.18+sample.height*TURN*.06)-.92)*20;
          let a,b,k;if(colourDepth<1.5){a=shallow;b=middle;k=colourDepth/1.5;}else if(colourDepth<4){a=middle;b=deep;k=(colourDepth-1.5)/2.5;}else{a=deep;b=abyss;k=1-Math.exp(-(colourDepth-4)*.16);}
          for(let c=0;c<3;c++){const base=a[c]+(b[c]-a[c])*k+shade+bedLight+lightNet+glint+(c===1?green*55:0),murky=base+([117,139,104][c]-base)*turbid,lit=murky+(foam[c]-murky)*Math.min(.9,crest+shoreFoam),dry=[184,174,140][c]+grain;D[o+c]=clamp(dry+(lit-dry)*wet,0,255);}D[o+3]=water?255:clamp(physicalDepth*180+40,0,225);coverage[o/4]=clamp(dp*850,0,D[o+3]);artCoverage[o/4]=coverage[o/4]*clamp(colourDepth/1.4,.08,.88)*(1-turbid*.6)*(1-Math.min(.9,crest+shoreFoam));continue;
        }
        if(!water&&pool>.005){const hollow=.012+bedTexture[i]/255*.09,amount=clamp((pool-hollow)*22,0,1);if(amount>0){const o=(y*cv.width+xx)*4;D[o]=75;D[o+1]=133;D[o+2]=128;D[o+3]=amount*Math.min(160,30+pool*430);coverage[o/4]=D[o+3];continue;}}
        if(!water&&(landDistance[i]>7||m===T.ROCK))continue;
        if(stride>1&&water&&(outside||wd[i]>stride*3)){
          const o=(y*cv.width+xx)*4;
          const previous=wx%stride&&xx>0&&(outside?D[o-1]===255:mat[i-1]===m&&wd[i-1]>stride*3)?o-4:wy%stride&&y>0&&(outside?D[o-cv.width*4+3]===255:mat[i-PW]===m&&wd[i-PW]>stride*3)?o-cv.width*4:-1;
          if(previous>=0){D[o]=D[previous];D[o+1]=D[previous+1];D[o+2]=D[previous+2];D[o+3]=255;coverage[o/4]=coverage[previous/4];artCoverage[o/4]=artCoverage[previous/4];continue;}
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
        else{a=fresh;b=freshDeep;k=1-Math.exp(-dp*.85);}
        const tile=tileRow+Math.floor(wx/16),flowX=W.hydroMap?.fx[tile]||0,flowY=W.hydroMap?.fy[tile]||1;
        const rip=sin((wx*dx+wy*dy)*TURN-time*(.4+wind*.3)),cross=sin((wx*.19-wy*.13)*TURN+time*.23);
        const caustic=causticAt(wx,wy,time,sun)*Math.max(0,1-dp/3)*.25;
        const current=kind===T.STREAM?sin((wx*flowX+wy*flowY)*.55*TURN-time*(.8+Math.min(1,h.flow||0)*6)):0;
        const crest=Math.max(0,rip-.78)*24*(.3+wind*.7);
        const sheen=(rip*.55+cross*.45)*(3+wind*3)+crest+caustic+Math.max(0,current-.55)*21;
        const foamFront=.6+(.5+.5*breath)*(1.8+wave*3),edge=sea?Math.max(0,1-Math.abs(d-tide-foamFront)*1.2)*(.35+noise*.4):0;
        const wash=!water&&sea?Math.max(0,1-Math.abs(wet)*1.2)*.65:0,f=Math.max(edge,wash),sediment=sea?0:(h.sediment||0)*18;
        k=Math.floor(k*24)/24;
        const frozen=kind===T.LAKE?lakeIce:0;
        for(let c=0;c<3;c++){const color=a[c]+(b[c]-a[c])*k+sheen+(c===0?sediment:c===2?-sediment:0),lit=color+(foam[c]-color)*f;D[o+c]=clamp(lit+(iceColor[c]-lit)*frozen,0,255);}
        D[o+3]=water?255:sea?clamp(wet*190+35,0,220):220;coverage[o/4]=D[o+3];artCoverage[o/4]=coverage[o/4]*clamp(dp/1.8,.08,.9)*(1-frozen);
      }
    }
    cg.putImageData(im,0,0);g.drawImage(cv,offsetX,offsetY);
    if(waterArt){
      rg.clearRect(0,0,V.aw,V.ah);rg.globalAlpha=1;
      const tile=128;
      for(let gy=Math.floor(sy/tile);gy<=Math.floor((sy+V.ah)/tile);gy++){
        const art=surfaceTile(gy,now);
        for(let gx=Math.floor(sx/tile);gx<=Math.floor((sx+V.aw)/tile);gx++)rg.drawImage(art,gx*tile-sx,gy*tile-sy,tile,tile);
      }
      for(let i=0;i<coverage.length;i++)maskImage.data[i*4+3]=artCoverage[i];mg.putImageData(maskImage,0,0);
      rg.globalCompositeOperation='destination-in';rg.drawImage(mask,offsetX,offsetY);rg.globalCompositeOperation='source-over';g.drawImage(ref,0,0,V.aw,V.ah);
    }
    for(let i=0;i<coverage.length;i++)maskImage.data[i*4+3]=coverage[i];mg.putImageData(maskImage,0,0);
    // Art pixels are finer than the physical water grid: grouped horizontal
    // marks, submerged stones and broken reflected trees, like the reference.
    rg.clearRect(0,0,V.aw,V.ah);
    const grid=V.raster,snap=v=>Math.round(v*grid)/grid;
    for(let gy=Math.floor(sy/3);gy<=Math.floor((sy+V.ah)/3);gy++)for(let gx=Math.floor(sx/5);gx<=Math.floor((sx+V.aw)/5);gx++){
      const q=hash3(gx,gy,W.seed+851),px=gx*5+q*4,py=gy*3+hash3(gx,gy,W.seed+852)*2.5,ix=Math.floor(px),iy=Math.floor(py);
      const outside=ix<0||iy<0||ix>=PW||iy>=PH,i=iy*PW+ix,kind=outside?T.DEEP:mat[i];if(!WATER(kind))continue;
      const near=outside?99:wd[i],freeze=kind===T.LAKE?lakeIce:0,phase=t*.2+q*23;
      const px0=snap(px-sx+Math.sin(phase)*.65),py0=snap(py-sy+Math.sin(phase*.7)*.22);
      // Soft colour variation is carried by crisp irregular clusters, not blur.
      rg.globalAlpha=(waterArt ? .07 : 1)*(q>.82?.32:.15+q*.15)*(1-freeze);rg.fillStyle=q>.82?'#83b2a0':q>.52?'#4e918e':q>.2?'#1c6378':'#153f59';
      const length=.7+q*3.7;rg.fillRect(px0,py0,length,1/grid);
      if(q>.6){rg.fillRect(px0+1/grid,py0+1/grid,length*.8,2/grid);rg.fillRect(px0+2/grid,py0+3/grid,length*.5,1/grid);}
      if(q<.16)rg.fillRect(px0+length*.2,py0+1/grid,length*.6,2/grid);
      if(near<19&&q>.93){
        const w=2+q*2,alpha=(1-near/23)*.7*(1-freeze);rg.globalAlpha=alpha;
        rg.fillStyle='#355e61';rg.fillRect(px0-.3,py0+1.3,w+.7,2/grid);
        rg.fillStyle='#688875';rg.fillRect(px0,py0,w,1.3);rg.fillRect(px0+.6,py0-.6,w-1.2,.6);
        rg.fillStyle='#8da888';rg.fillRect(px0+.3,py0,w-.8,.6);
        rg.fillStyle='#b7be99';rg.fillRect(px0+.6,py0-.6,w*.5,1/grid);rg.fillRect(px0+.3,py0,w*.3,1/grid);
      }
    }
    rg.globalAlpha=1;
    // Sparse, softly travelling wavelets make calm water visibly alive without flashing speckles.
    for(let gy=Math.floor(sy/24);gy<=Math.floor((sy+V.ah)/24);gy++)for(let gx=Math.floor(sx/24);gx<=Math.floor((sx+V.aw)/24);gx++){
      const q=hash3(gx,gy,W.seed+833),px=gx*24+q*19,py=gy*24+hash3(gx,gy,W.seed+834)*19,ix=Math.floor(px),iy=Math.floor(py);
      const outside=ix<0||iy<0||ix>=PW||iy>=PH,i=iy*PW+ix,kind=outside?T.DEEP:mat[i];if(!WATER(kind)||kind===T.STREAM||(!outside&&wd[i]<5))continue;
      const phase=t*.38+q*15,life=(1+Math.sin(phase))*.5,length=3+q*5+wind*3;
      const frozen=kind===T.LAKE?lakeIce:0,alpha=life*life*(.14+sun*.16+wind*.1)*(1-frozen);
      const normal=field&&kind<=1?surfaceAt(field,px/8,py/8,sample):null;
      const localWave=kind>=T.LAKE?wind*.25:wave;
      const px0=snap(px-sx+Math.sin(phase*.7)*(1+localWave*2)),py0=snap(py-sy+Math.cos(phase*.7)*(.5+localWave)+(normal?normal.height*3:0));
      g.globalAlpha=alpha;g.fillStyle='#c5e4d5';g.fillRect(px0,py0,length,1/grid);g.fillRect(px0-1,py0+1/grid,1,1/grid);g.fillRect(px0+length,py0+1/grid,1,1/grid);
    }g.globalAlpha=1;
    // Reflect actual nearby crowns, with small distortion strips; clip against this frame's water coverage.
    for(const e of W.ents){
      const isTree=trees.has(e.k),isReed=e.k==='reeds';
      const px=e.x*16-sx,py=e.y*16-sy;if(px<-45||px>V.aw+45||py<-80||py>V.ah+30||(!isTree&&!isReed&&e.k!=='boulder'))continue;
      const baseX=Math.floor(e.x*16),baseY=Math.floor(e.y*16),i=baseY*PW+baseX;if(baseX<0||baseY<0||baseX>=PW||baseY>=PH||landDistance[i]>55)continue;
      const reflect=nearest[i]>=T.LAKE?.68/(1+wind*.7):.66/(1+wave*.8+wind*.5);
      if(!isTree){
        const s=isReed?shrub(e.k,e.size,e.id,{autumn:e.aut||0,fruit:e.fruit||0}):rock(e.k,e.size,e.id),scale=s.scale||1,w=s.img.width/scale,h=s.img.height/scale;
        rg.save();rg.translate(px,py+1);rg.scale(1,-.8);rg.globalAlpha=reflect*.75;
        for(let y=0;y<h;y+=1/grid){const band=Math.min(1/grid,h-y),shift=Math.sin(now/1600+y*2+e.id)*.5;rg.drawImage(s.img,0,y*scale,s.img.width,band*scale,-w/2+shift,-h+s.ay+y,w,band);}
        rg.restore();continue;
      }
      const fall=Math.max(e.fall||0,e.leafKg!=null?1-e.leafKg/Math.max(.01,(e.k==='hazel'?1:5)*e.size):0);
      const s=tree(e.k,e.size,e.id,{autumn:e.aut||0,fall,snow:W.surface?.snow||0});
      const scale=s.crownScale||1,cw=s.crown?s.crown.width/scale:0,ch=s.crown?s.crown.height/scale:0;
      rg.save();rg.translate(px,py+1);rg.scale(1,-1.3);
      for(let y=0;y<(s.trunkH||s.trunk.height);y+=1/grid){const shift=Math.sin(now/1600+y*1.8+e.id)*.8;rg.globalAlpha=reflect*.8;rg.drawImage(s.trunk,0,y*(s.trunkScale||1),s.trunk.width,(s.trunkScale||1)/grid,-s.cx+shift,-(s.trunkH||s.trunk.height)+y,s.trunkW||s.trunk.width,1/grid);}
      for(let y=0;y<ch;y+=2/grid){const band=Math.min(2/grid,ch-y),waveShift=field?surfaceAt(field,e.x*2,e.y*2+y/8,sample).nx*3:0,shift=waveShift+Math.sin(now/1400+y*1.7+e.id)*(.65+wind);rg.globalAlpha=reflect*(.5+.5*hash3(Math.floor(y*grid),e.id,857));rg.drawImage(s.crown,0,y*scale,s.crown.width,band*scale,-s.cx+shift,-(s.trunkH||s.trunk.height)-ch+6+y,cw,band);}rg.restore();
    }
    const fraction=clamp((W.t%10+((Date.now()-W.born)/60000-W.t))/10,0,1),curve=terr.streamCurve;
    for(const q of h.debris||[]){
      const at=q.prev+(q.at-q.prev)*fraction,k=Math.floor(at),u=at-k;if(!curve[k]||!curve[k+1])continue;
      const cr=(a,b,c,d)=>.5*(2*b+(-a+c)*u+(2*a-5*b+4*c-d)*u*u+(-a+3*b-3*c+d)*u*u*u);
      const a=curve[Math.max(0,k-1)],b=curve[k],c=curve[k+1],d=curve[Math.min(curve.length-1,k+2)],px=cr(a[0],b[0],c[0],d[0])-sx,py=cr(a[1],b[1],c[1],d[1])-sy;
      rg.fillStyle='#ae8151';rg.fillRect(px,py,2,1);rg.fillStyle='#d1aa70';rg.fillRect(px+.3,py-.3,1,1);
    }
    rg.globalCompositeOperation='destination-in';rg.drawImage(mask,offsetX,offsetY);rg.globalCompositeOperation='source-over';g.drawImage(ref,0,0,V.aw,V.ah);
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
// Smooth display sampling removes rectangular puddle footprints. The stored
// finite volumes, coast bed and tide are never modified by this interpolation.
export function poolAt(values,width,height,x,y){
  if(!values||x<0||y<0||x>=width||y>=height)return 0;
  const X=clamp(x-.5,0,width-1),Y=clamp(y-.5,0,height-1),ix=Math.floor(X),iy=Math.floor(Y),fx=X-ix,fy=Y-iy;
  const a=iy*width+ix,b=iy*width+Math.min(width-1,ix+1),c=Math.min(height-1,iy+1)*width+ix,d=Math.min(height-1,iy+1)*width+Math.min(width-1,ix+1);
  return Math.max(0,((values[a]||0)*(1-fx)*(1-fy)+(values[b]||0)*fx*(1-fy)+(values[c]||0)*(1-fx)*fy+(values[d]||0)*fx*fy)/4);
}
function causticAt(x,y,time,sun){
  const warp=sin((x*.061-y*.047)*TURN+time*.045)*680;
  const a=sin((x*.25+y*.13)*TURN+warp+time*.085),b=sin((y*.28-x*.1)*TURN-warp-time*.065);
  const net=Math.max(0,1-Math.abs(a+b)*4.5);
  return net*net*(6+sun*13);
}
function bedAt(W,x,y){const X=clamp(x/2-.5,0,W.MW-1),Y=clamp(y/2-.5,0,W.MH-1),ix=Math.min(W.MW-2,Math.floor(X)),iy=Math.min(W.MH-2,Math.floor(Y)),fx=X-ix,fy=Y-iy;let z=0;for(let q=0;q<4;q++){const i=(iy+(q>>1))*W.MW+ix+(q&1);z+=((q&1)?fx:1-fx)*((q>>1)?fy:1-fy)*(W.ocean.coastBed[i]+(W.relief?.[i]||0));}return z;}

// Interpolate resolved fields without drawing the finite-volume mesh. Dry
// neighbours cannot raise the water surface to the height of their land bed.
function macroAt(g,x,y,out){
 const X=clamp(x/g.dx-.5,0,g.nx-1),Y=clamp(y/g.dy-.5,0,g.ny-1),ix=Math.min(g.nx-2,Math.floor(X)),iy=Math.min(g.ny-2,Math.floor(Y)),fx=X-ix,fy=Y-iy;
 out.level=out.bed=out.relief=out.foam=out.sediment=out.plankton=0;let wet=0;
 for(let q=0;q<4;q++){const i=(iy+(q>>1))*g.nx+ix+(q&1),weight=(q&1?fx:1-fx)*(q>>1?fy:1-fy);out.bed+=weight*g.bed[i];out.relief+=weight*(g.bed[i]-(g.baseBed?.[i]??g.bed[i]));if(g.volume[i]<=g.area[i]*.001)continue;wet+=weight;out.level+=weight*g.eta[i];out.foam+=weight*g.foam[i];out.sediment+=weight*concentration(g,i,'sediment',0);out.plankton+=weight*concentration(g,i,'phyto',0);}
 if(wet){out.level/=wet;out.foam/=wet;out.sediment/=wet;out.plankton/=wet;}else out.level=out.bed;
}
