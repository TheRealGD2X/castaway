import {parentPort,workerData} from 'node:worker_threads';
import fs from 'node:fs/promises';
import path from 'node:path';
import {Session} from './session.js';
import {readLocal,writeLocal,sourceFingerprint} from './storage.js';
const {root,userDir,testMinute,offline=false}=workerData,fingerprint=await sourceFingerprint(root);
const read=async name=>JSON.parse(await fs.readFile(path.join(root,'data/v2',name),'utf8'));
const packaged=await read('checkpoint.json'),thoughts=await read('mind.json'),local=await readLocal(userDir,fingerprint);
let S=testMinute!=null?new Session(null,[]):new Session(local&&local.t>=packaged.t?local.blob:packaged.blob,local&&local.t>=packaged.t?local.thoughts:thoughts);
let busy=false,lastSent=-1,lastSaved=-1,lastMind=JSON.stringify(S.thoughts),closing=false,saveQueue=Promise.resolve();
const send=(type,value)=>parentPort.postMessage({type,...value});
const due=()=>testMinute??Math.max(0,Math.floor((Date.now()-S.world.born)/60000));
async function persist(){if(testMinute==null){const state=S.snapshot(),job=async()=>{await writeLocal(userDir,state,fingerprint);lastSaved=Math.max(lastSaved,state.t);};saveQueue=saveQueue.then(job,job);await saveQueue;}}
async function tick(){if(busy||closing)return;busy=true;try{
 const target=due(),start=S.world.t;let last=performance.now();
 while(S.world.t<target&&!closing){S.advance(target,24);if(performance.now()-last>120){send('progress',{t:S.world.t,target,start});await new Promise(r=>setImmediate(r));last=performance.now();}}
 if(lastSent!==S.world.t){send('snapshot',{...S.snapshot(),fingerprint});lastSent=S.world.t;}
 if(S.world.t-lastSaved>=5)await persist();
 }catch(e){send('error',{message:e.stack});}finally{busy=false;}}
// Online synchronization uses the same canonical checkpoint and thought feed as
// the website. A changed thought history is replayed from that checkpoint.
async function sync(){if(offline||testMinute!=null||closing)return;try{
 const base='https://therealgd2x.github.io/castaway/data/v2/';
 const get=async name=>{const r=await fetch(base+name,{signal:AbortSignal.timeout(12000),cache:'no-store'});if(!r.ok)throw Error(`Feed returned ${r.status}`);return r.json();};
 const [cp,mind]=await Promise.all([get('checkpoint.json'),get('mind.json')]);
 const state=JSON.parse(cp.blob);if(state.seed!==S.world.seed||state.born!==S.world.born||state.t>due()||!Array.isArray(mind))throw Error('Invalid world feed');
 if(busy||closing)return;
 if(JSON.stringify(mind)!==lastMind||cp.t>S.world.t){S=new Session(cp.blob,mind);lastMind=JSON.stringify(mind);lastSent=-1;}
 send('connection',{online:true});await tick();
 }catch(e){send('connection',{online:false,message:e.message});}}
parentPort.on('message',async msg=>{
 if(msg.type==='snapshot'&&lastSent>=0)send('snapshot',{...S.snapshot(),fingerprint});
 if(msg.type==='save')try{await persist();send('saved',{t:S.world.t});}catch(e){send('error',{message:e.message});}
 if(msg.type==='close'){closing=true;while(busy)await new Promise(r=>setTimeout(r,10));try{await persist();}finally{send('closed',{});parentPort.close();}}
});
await tick();await sync();if(!closing){const timer=setInterval(tick,500),syncTimer=setInterval(sync,15*60000);parentPort.on('close',()=>{clearInterval(timer);clearInterval(syncTimer);});}
