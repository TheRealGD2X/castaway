// Exercise real clock catch-up, on-disk saves and restart in an isolated profile.
const {_electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=path.resolve(process.env.QA_OUTPUT||path.join(root,'desktop/dist/production-qa')),exe=process.env.QA_EXE||path.join(root,'desktop/node_modules/electron/dist/electron.exe');
const hash=s=>createHash('sha256').update(s).digest('hex');
(async()=>{
 await fs.mkdir(out,{recursive:true});let previous;
 for(let run=0;run<2;run++){
  const app=await _electron.launch({executablePath:exe,args:[...(!process.env.QA_EXE?[path.join(root,'desktop')]:[]),'--qa','--offline','--state-dir='+out],timeout:90000});
  try{const page=await app.firstWindow();await page.waitForFunction(()=>window.__castawayQA?.view?.frames>3,null,{timeout:120000});const state=await page.evaluate(()=>({t:window.__castawayQA.world.t,born:window.__castawayQA.world.born,seed:window.__castawayQA.world.seed,blob:window.__castawayQA.save()}));
   assert.equal(state.seed,1404719350);assert.ok(Math.abs(state.t-Math.floor((Date.now()-state.born)/60000))<=1);if(previous)assert.ok(state.t>=previous.t);
   await page.keyboard.press('Control+s');await page.waitForFunction(()=>document.getElementById('toast').textContent.includes('World saved'),null,{timeout:15000});
   const {Session}=await import('../runtime/session.js'),cp=JSON.parse(await fs.readFile(path.join(root,'data/v2/checkpoint.json'),'utf8')),mind=JSON.parse(await fs.readFile(path.join(root,'data/v2/mind.json'),'utf8')),S=new Session(cp.blob,mind);S.advance(state.t);assert.equal(hash(state.blob),hash(S.snapshot().blob),'Native catch-up differs from original fixed-step simulation');
   console.log('PASS real UK clock / original world equality / restart',run,state.t);previous=state;
  }finally{await app.close();}
  const disk=JSON.parse(await fs.readFile(path.join(out,'world.json'),'utf8'));assert.equal(disk.hash,hash(disk.blob));assert.ok(disk.t>=previous.t);assert.equal(disk.fingerprint,'c494638a78a4b3d5464f9f9d04b56997f659e7a781043bceabc0edaf408be2b2');
 }
 console.log('PASS production worker saves on close, current-minute catch-up and compatible on-disk restart');
})().catch(e=>{console.error(e);process.exitCode=1;});
