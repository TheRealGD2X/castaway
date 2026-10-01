import fs from 'node:fs/promises';
import path from 'node:path';
import {createWorld,load,step,save} from '../../v2/src/sim/world.js';
import {SEED,BORN} from '../../v2/src/config.js';
const dir=path.resolve(process.argv[2]||'dist/qa-fixtures');await fs.mkdir(dir,{recursive:true});
const W=createWorld(SEED,BORN);let maximumRain=0,maximumWind=0,nightFire=false;
const record=async(name,W)=>{await fs.writeFile(path.join(dir,name+'.json'),save(W));console.log(name,W.t,W.wx.temp,W.wx.rain,W.wx.wind,W.fires.map(f=>f.heat));};
for(let minute=0;minute<=1800;minute++){
 if([480,730,1000].includes(W.t))await record({480:'day',730:'sunset',1000:'night'}[W.t],W);
 if(W.t%60===0){if(W.wx.rain>maximumRain){maximumRain=W.wx.rain;await record('rain',W);}if(W.wx.wind>maximumWind){maximumWind=W.wx.wind;await record('rough',W);}if(!nightFire&&W.wx.elev<-.15&&W.fires.some(f=>f.heat>1000)){await record('fire-night',W);nightFire=true;}}
 step(W);
}
const cp=JSON.parse(await fs.readFile(new URL('../../data/v2/checkpoint.json',import.meta.url),'utf8')),mind=JSON.parse(await fs.readFile(new URL('../../data/v2/mind.json',import.meta.url),'utf8'));await record('camp',load(cp.blob,mind));
const winter=createWorld(SEED,Date.UTC(2026,11,15,5));for(let i=0;i<1000;i++){step(winter);if(winter.wx.rain>.1&&winter.wx.temp<1){await record('snow',winter);break;}}
