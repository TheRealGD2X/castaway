import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function readLocal(dir,fingerprint){
 for(const name of ['world.json','world.previous.json'])try{const o=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));if(o.schema!==1||hash(o.blob)!==o.hash||o.fingerprint!==fingerprint)continue;return o;}catch{}
 return null;
}
export async function writeLocal(dir,state,fingerprint){
 await fs.mkdir(dir,{recursive:true});const file=path.join(dir,'world.json'),temp=path.join(dir,'world.pending.json'),previous=path.join(dir,'world.previous.json');
 await fs.writeFile(temp,JSON.stringify({schema:1,...state,hash:hash(state.blob),fingerprint}));
 try{await fs.copyFile(file,previous);}catch(e){if(e.code!=='ENOENT')throw e;}
 await fs.rename(temp,file);
}
export async function sourceFingerprint(root){
 const h=createHash('sha256');for(const dir of ['core','world','sim','mind','build']){
  async function visit(folder){for(const e of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=path.join(folder,e.name);if(e.isDirectory())await visit(p);else if(e.name.endsWith('.js')){h.update(path.relative(root,p).replaceAll('\\','/'));h.update(await fs.readFile(p));}}}await visit(path.join(root,'v2/src',dir));
 }h.update(await fs.readFile(path.join(root,'v2/src/config.js')));return h.digest('hex');
}
