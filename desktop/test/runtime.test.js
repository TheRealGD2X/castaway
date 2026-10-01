import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {createWorld,save} from '../../v2/src/sim/world.js';
import {Session} from '../runtime/session.js';
import {sourceFingerprint,readLocal,writeLocal} from '../runtime/storage.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),fixture=JSON.parse(await fs.readFile(new URL('baseline.json',import.meta.url),'utf8')),hash=s=>createHash('sha256').update(s).digest('hex');
assert.equal(await sourceFingerprint(root),fixture.fingerprint,'Existing simulation code changed');
for(const c of fixture.cases){const W=createWorld(c.seed,Date.UTC(2026,8,25,5)),S=new Session(save(W)),chunks=[1,7,31,3,120];let k=0;while(S.world.t<c.minutes)S.advance(c.minutes,chunks[k++%chunks.length]);assert.equal(hash(S.snapshot().blob),c.hash);assert.equal(S.world.man.B.alive,c.alive);const before=S.snapshot().blob;S.advance(c.minutes-1);assert.equal(S.snapshot().blob,before);}
const cp=fixture.checkpoint,S=new Session(cp.blob,cp.thoughts);S.advance(S.world.t+cp.minutes);assert.equal(hash(S.snapshot().blob),cp.hash);assert.throws(()=>S.advance(NaN));
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'castaway-test-'));await writeLocal(dir,S.snapshot(),fixture.fingerprint);assert.equal((await readLocal(dir,fixture.fingerprint)).blob,S.snapshot().blob);await writeLocal(dir,S.snapshot(),fixture.fingerprint);await fs.writeFile(path.join(dir,'world.json'),'corrupt');assert.equal((await readLocal(dir,fixture.fingerprint)).blob,S.snapshot().blob);assert.equal(await readLocal(dir,'different'),null);
const worker=new Worker(new URL('../runtime/worker.js',import.meta.url),{workerData:{root,userDir:dir,testMinute:1000,offline:true}});
const message=await new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',m=>{if(m.type==='error')reject(Error(m.message));if(m.type==='snapshot')resolve(m);});});assert.equal(hash(message.blob),fixture.cases[0].hash);await worker.terminate();
console.log('PASS unchanged source, five-day golden futures, irregular scheduling, checkpoint/thought replay, atomic save recovery, worker equality');
