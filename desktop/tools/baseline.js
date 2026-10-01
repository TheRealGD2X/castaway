// Run only when intentionally recording a verified simulation release.
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWorld,step,save,load} from '../../v2/src/sim/world.js';
import {SEED,BORN} from '../../v2/src/config.js';
import {sourceFingerprint} from '../runtime/storage.js';
const root=new URL('../../',import.meta.url),cases=[];
for(const [seed,minutes]of [[SEED,1000],[SEED,7200],[SEED+1,7200]]){const W=createWorld(seed,BORN);for(let t=0;t<minutes;t++)step(W);cases.push({seed,minutes,hash:createHash('sha256').update(save(W)).digest('hex'),alive:W.man.B.alive});}
const cp=JSON.parse(await fs.readFile(new URL('../../data/v2/checkpoint.json',import.meta.url),'utf8')),thoughts=JSON.parse(await fs.readFile(new URL('../../data/v2/mind.json',import.meta.url),'utf8')),W=load(cp.blob,thoughts);for(let t=0;t<120;t++)step(W);
await fs.writeFile(new URL('../test/baseline.json',import.meta.url),JSON.stringify({release:'85e2027',fingerprint:await sourceFingerprint(root.pathname.replace(/^\/(\w:)/,'$1')),cases,checkpoint:{blob:cp.blob,thoughts,minutes:120,hash:createHash('sha256').update(save(W)).digest('hex')}},null,2));console.log('Recorded the existing release before desktop renderer changes');
