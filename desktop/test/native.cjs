// Real Electron / WebGPU QA. Never modifies the authoritative worker's world.
const {_electron}=require('playwright');
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs/promises'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.QA_OUTPUT||path.join(root,'desktop/dist/qa')),fixtures=path.resolve(process.env.QA_FIXTURES||path.join(root,'desktop/dist/qa-fixtures'));
const hash=s=>createHash('sha256').update(s).digest('hex');
(async()=>{
 await fs.mkdir(out,{recursive:true});const executablePath=process.env.QA_EXE||path.join(root,'desktop/node_modules/electron/dist/electron.exe');
 const args=[...(!process.env.QA_EXE?[path.join(root,'desktop')]:[]),'--qa','--minute=480','--offline','--state-dir='+path.join(out,'state')];
 const app=await _electron.launch({executablePath,args,timeout:90000}),errors=[],report={captures:[],checks:[]};
 try{
  const page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const ready=async()=>{await page.waitForFunction(()=>window.__castawayQA?.view?.frames>3||!document.getElementById('failure').hidden,null,{timeout:90000});assert.equal(await page.locator('#failure').isVisible(),false,await page.locator('#failure-text').textContent());};await ready();
  if(process.env.QA_VISIBLE==='1')await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0];w.show();w.focus();});
  report.adapter=await page.evaluate(async()=>{const a=await navigator.gpu.requestAdapter(),i=a.info;return{vendor:i.vendor,architecture:i.architecture,device:i.device,description:i.description,isFallbackAdapter:a.isFallbackAdapter};});assert.equal(await page.evaluate(()=>window.__castawayQA.view.backend),'WebGPU');
  const base=await page.evaluate(()=>window.__castawayQA.save());
  async function capture(name,focus='island'){
   await page.evaluate(k=>{document.getElementById('panel-close').click();window.__castawayQA.focus(k);},focus);
   const start=await page.evaluate(()=>window.__castawayQA.view.frames);await page.waitForFunction(n=>window.__castawayQA.view.frames>n+15||!document.getElementById('failure').hidden,start,{timeout:60000});await ready();
   await page.screenshot({path:path.join(out,name+'.jpg'),type:'jpeg',quality:92});const d=await page.evaluate(()=>({...window.__castawayQA.diagnostics(),heapMB:Math.round(performance.memory.usedJSHeapSize/1048576)}));const pixels=await app.evaluate(async({BrowserWindow})=>{const image=await BrowserWindow.getAllWindows()[0].webContents.capturePage(),{width:w,height:h}=image.getSize(),bytes=image.toBitmap();let sum=0,lit=0,count=0;for(let y=Math.floor(h*.32);y<h*.76;y+=4)for(let x=Math.floor(w*.32);x<w*.72;x+=4){const i=(y*w+x)*4,l=(bytes[i]+bytes[i+1]+bytes[i+2])/3;sum+=l;if(l>3)lit++;count++;}return{sceneMean:sum/count,litFraction:lit/count};});report.captures.push({name,...d,...pixels});console.log('CAPTURE',name,d.minute,d.resolution,d.backend,'heap',d.heapMB+'MB','light',pixels.sceneMean.toFixed(2));
   if(name==='night'){assert.ok(pixels.sceneMean>.3,'Actual moonlight was quantized to black');assert.ok(pixels.sceneMean<100,'Unlit fog became a bright emitter');}if(name==='camp')assert.ok(pixels.sceneMean<160,'Dawn sky lighting exceeded the simulated illuminance');
  }
  await capture('day');await capture('ocean','ocean');await capture('tomas','man');
  report.wave=await page.evaluate(async()=>{
   const qa=window.__castawayQA,v=qa.view;v.running=false;cancelAnimationFrame(v.raf);const {wavePoint}=await import('/desktop/render/model.js'),before=qa.save(),checks=[];
   try{for(const grid of [1,2])for(const seconds of [qa.world.t*60+3.2,3153600000.3]){const g=qa.world.ocean.grids[grid],points=grid===2?[[8,30],[30,8],[29.4,25.7],[180,100],[210,140],[-2,25],[230,200],[113,7],[50,115]]:[[62000,66000],[65000,65000],[66873.2,66483.7],[70123,80111]],actual=await v.ocean.sampleGPU(v.renderer,points,grid,seconds);let height=0,slope=0;for(let i=0;i<points.length;i++){const p=wavePoint(g,...points[i],seconds,qa.world.seed);height=Math.max(height,Math.abs(actual[i][0]-p.h));slope=Math.max(slope,Math.abs(actual[i][1]-p.nx),Math.abs(actual[i][2]-p.ny));}checks.push({grid,seconds,maxHeightError:height,maxSlopeError:slope});}return{checks,unchanged:qa.save()===before};}finally{v.start();}
  });
  for(const q of report.wave.checks){assert.ok(q.maxHeightError<.002,JSON.stringify(q));assert.ok(q.maxSlopeError<.002,JSON.stringify(q));}assert.ok(report.wave.unchanged);report.checks.push('GPU geometry and normals agree with double-precision waves, including 100-year clock');
  await page.locator('#journal-button').click();for(const tab of ['story','words','camp']){await page.locator(`[data-tab="${tab}"]`).click();assert.ok((await page.locator('#panel-title').textContent()).includes('life'));}await page.locator('#panel-close').click();
  await page.locator('#man-details').click();assert.ok((await page.locator('#panel-content').textContent()).includes('Body temperature'));await page.locator('#panel-close').click();
  await page.locator('#sound-button').click();await page.waitForFunction(()=>document.getElementById('sound-button').getAttribute('aria-pressed')==='true');await page.waitForTimeout(500);assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'),'true');await page.locator('#sound-button').click();
  await page.locator('#settings-button').click();await page.locator('#quality').selectOption('ultra');await capture('ultra');await page.locator('#settings-button').click();await page.locator('#quality').selectOption('high');await page.locator('#fps').selectOption('120');
  await page.locator('#exposure').fill('0.5');await page.locator('#exposure').dispatchEvent('input');await page.locator('#exposure').fill('0');await page.locator('#exposure').dispatchEvent('input');await page.locator('#panel-close').click();
  await page.keyboard.press('h');assert.ok(await page.locator('body').evaluate(b=>b.classList.contains('ui-hidden')));await page.keyboard.press('h');await page.keyboard.press('w');await page.keyboard.press('q');
  assert.equal(hash(await page.evaluate(()=>window.__castawayQA.save())),hash(base),'Graphics, UI and sound modified physical state');report.checks.push('Journal, inspections, sound, settings and camera do not mutate the world');
  for(const name of ['sunset','night','fire-night','rain','rough','camp','snow']){
   let blob;try{blob=await fs.readFile(path.join(fixtures,name+'.json'),'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}
   await page.evaluate(blob=>window.__castawayQA.replace(blob),blob);const before=await page.evaluate(()=>window.__castawayQA.save());await capture(name,name==='fire-night'||name==='camp'?'camp':name==='rough'?'ocean':'island');assert.equal(await page.evaluate(()=>window.__castawayQA.save()),before);
  }
  await page.evaluate(blob=>window.__castawayQA.replace(blob),base);await capture('island');
  const bench=async()=>{await page.waitForTimeout(2000);return page.evaluate(async()=>{const v=window.__castawayQA.view,n=v.frames,t=performance.now();await new Promise(r=>setTimeout(r,5000));return{fps:(v.frames-n)*1000/(performance.now()-t),...v.diagnostics()};});};
  report.visibleBenchmark=process.env.QA_VISIBLE==='1';report.performance=await bench();await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(2560,1440));await page.evaluate(()=>window.__castawayQA.view.resize());report.performance4K=await bench();await capture('desktop-4k');await page.locator('#settings-button').click();await page.locator('#quality').selectOption('ultra');await page.locator('#panel-close').click();report.performanceUltra4K=await bench();await capture('desktop-ultra-4k');await page.locator('#settings-button').click();await page.locator('#quality').selectOption('high');await page.locator('#panel-close').click();
  await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('World saved'),null,{timeout:10000});
  await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},path.join(out,'export.json'));await page.locator('#settings-button').click();await page.locator('#export').click();await page.waitForFunction(()=>document.getElementById('toast').textContent==='World exported');const exported=JSON.parse(await fs.readFile(path.join(out,'export.json'),'utf8'));assert.equal(exported.t,480);assert.equal(hash(exported.blob),hash(base));
  await page.locator('#fullscreen').click();assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].isFullScreen()),true);await page.locator('#fullscreen').click();
  await page.locator('#panel-close').click();report.checks.push('Native save, export and fullscreen work');
  await page.reload();await ready();assert.equal(hash(await page.evaluate(()=>window.__castawayQA.save())),hash(base));report.checks.push('Renderer reload retains original worker state');
  assert.deepEqual(errors,[],'Renderer / WebGPU errors');console.log('PASS native desktop, waves, UI, sound, read-only state, export, reload',JSON.stringify({adapter:report.adapter,wave:report.wave,performance:report.performance,performance4K:report.performance4K}));
 }finally{report.errors=errors;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
