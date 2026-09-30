// Useful equipment, made from gathered materials. Planning and execution use the same recipes.
import { addBatch, heatFood, finishFood, moveFood, syncFood } from '../sim/food.js';
import { harvestFish } from '../sim/foodweb.js';
import {workRate} from '../sim/effort.js';
import {ensureTools,makeTool,useLine,toolProps} from '../sim/tools.js';
import { MET } from '../sim/body.js';
import { MW, idx, T } from '../world/gen.js';
import { clamp, dceil } from '../core/dmath.js';
import { MAT, fitted, reclaimPart, startRepair, finishRepair } from '../build/assembly.js';
import { finished, FAMILIES, propsOf } from '../build/build.js';
import { FISH } from '../sim/fish.js';
import { availableWater } from '../sim/hydro.js';

export const RECIPES = {
  twistCord: { out: 'cord', qty: 6, need: { withies: 3 }, mins: 35, pose: 'weave', name: 'bark cordage' },
  weaveBasket: { out: 'basket', qty: 1, need: { withies: 6, cord: 2 }, mins: 70, pose: 'weave', name: 'carrying basket' },
  makeLine: { out: 'line', qty: 1, need: { cord: 3, flake: 1 }, keep: ['flake'], mins: 45, pose: 'weave', name: 'fishing line' },
  haftAxe: { out: 'axe', qty: 1, need: { stones: 2, poles: 1, cord: 2 }, mins: 70, pose: 'whittle', name: 'stone axe' },
  weaveWrap: { out: 'wrap', qty: 1, need: { reeds: 8, cord: 3 }, mins: 100, pose: 'weave', name: 'woven reed cape' },
  shapeClay: { out: 'greenPot', qty: 1, need: { mud: 3 }, mins: 55, pose: 'potter', name: 'clay pot' },
};
const point = s => ({ x: s.x, y: s.y, tile: idx(Math.floor(s.x), Math.floor(s.y)), sid: s.id });
const dist = (a,b) => { const x=a.x-b.x,y=a.y-b.y; return Math.sqrt(x*x+y*y); };
const minutes = (M,t) => t.x == null ? 0 : dist(M,t)*2/60;
const workplace = (W,M) => {
  const s = W.structs.find(s => (s.props?.bench||0)>.5);
  const room = W.structs.find(s => (s.props?.workspace || 0) > .5);
  return room ? point(room) : s ? point(s) : { x: null };
};
export function craftActions(work) {
  const A = {};
  for (const [key, r] of Object.entries(RECIPES)) {
    const mats = Object.keys(r.need);
    A[key] = { r: [...mats, r.out], w: [r.out, ...mats.filter(m=>!r.keep?.includes(m))], provides: [r.out],
      find: workplace, pre: S => S[r.out] < (r.out === 'cord' ? 6 : 1) && mats.every(m => S[m] >= r.need[m]),
      eff: S => { for (const m of mats) if (!r.keep?.includes(m)) S[m] -= r.need[m]; S[r.out] += r.qty; },
      cost: (W,M,t) => minutes(M,t) + r.mins,
      exec: manufacture(r), say: 'Making something useful with what the island gives him.' };
  }
  function manufacture(r) {
    return work({ adjacent: true, mins: r.mins, met: MET.craft, pose: r.pose,
      tick: (W,M,t,st) => {
        M.workpieces ||= {}; const piece = M.workpieces[r.out] || (M.workpieces[r.out] = { progress: 0, paid: false });
        if (!piece.paid) {
          if (Object.keys(r.need).some(m => (M.inv[m] || 0) < r.need[m])) return 'fail';
          for (const m in r.need) if (!r.keep?.includes(m)) M.inv[m] -= r.need[m];
          piece.paid = true;
        }
        const bench = W.structs.find(s => (s.props?.bench||0)>.2 && Math.abs(s.x-M.x) < 2 && Math.abs(s.y-M.y) < 2);
        const room = W.structs.find(s => (s.props?.workspace || 0) > .5 && Math.abs(s.x-M.x) < 1 && Math.abs(s.y-M.y) < 1);
        const rain = W.wx.rain * (1-Math.max(room?.props.rain||0,bench?.props.dry||0));
        piece.progress += (M.contactRate??workRate(W,M)) / (1 + rain * .08); st.left = Math.max(1, r.mins - piece.progress + 1);
        M.skill.build += .0006;
        if(piece.progress>=r.mins)return 'done';
      }, done: (W,M) => {
        delete M.workpieces[r.out];
        M.inv[r.out] = (M.inv[r.out] || 0) + r.qty;
        if(r.out==='line'){const t=makeTool(M,'line');M.lineStrength=toolProps(t).tension/30;}
        if(r.out==='axe'){makeTool(M,'axe');M.axeWear=1;}
        if (r.out === 'greenPot') M.potDry = 0;
        M.log.push([W.t,'crafted',r.name]);
      } });
  }
  A.fireClay = { r: ['greenPot','fire','clayPot'], w: ['clayPot','pot','greenPot'],
    find: (W,M) => { const f=W.fires.find(f=>f.lit && f.heat>1000); return f ? point(f) : null; },
    pre: S=>S.greenPot && S.fire===2 && !S.clayPot,
    eff: S=>{S.greenPot=0;S.clayPot=1;S.pot=1;}, cost: (W,M,t)=>minutes(M,t)+100,
    exec: work({ adjacent:true, mins:120, met:MET.sit, pose:'tend',
      tick:(W,M,t)=>{
        const f=W.fires.find(f=>f.id===t.sid); if(!f?.lit || (M.potDry||0)<.8) return 'fail';
        // Estimated ceramic temperature approaches the coals; sintering needs sustained red heat.
        const target=Math.min(950,250+Math.sqrt(f.heat)*6.5);
        M.potTemp=(M.potTemp??W.wx.temp)+(target-(M.potTemp??W.wx.temp))*.08;
        M.potDose=(M.potDose||0)+Math.max(0,M.potTemp-600)/180;
      }, done:(W,M)=>{ if((M.potDose||0)<35)return 'fail'; M.inv.greenPot=0; M.inv.clayPot=1; M.inv.pot=1; M.log.push([W.t,'crafted','fired clay pot']); } }) };
  A.lineFish = { r:['line','raw'], w:['raw'],
    find:(W,M)=>{
      if (!M.inv.line) return null;
      let best=null,bd=1e9;
      for(let i=MW;i<MW*(W.MH-1);i++)if(M.known[i]&&(W.ter[i]===T.STREAM||W.ter[i]===T.LAKE)&&availableWater(W,i)>.1) {
        const t={x:i%MW+.5,y:Math.floor(i/MW)+.5,tile:i},d=dist(M,t);if(d<bd){bd=d;best=t;}
      }return best;
    },pre:S=>S.line&&S.raw<2500,eff:S=>{S.raw+=600;},cost:(W,M,t)=>minutes(M,t)+60,
    exec:work({adjacent:true,mins:60,met:MET.sit,pose:'fish',tick:(W,M,t)=>{
      if(!M.inv.line||availableWater(W,t.tile)<.1)return 'fail'; const fish=W.fish; if(!fish)return 'fail';
      const water=W.ter[t.tile]===T.STREAM?"stream":"lake", population=fish[water] || 0, density=population/Math.max(1,W.fishK[water]);
      if(W.rng.f()<Math.min(.08, density * .05 * (.7+M.skill.forage*.1))&&population>=1) {
        const pull=.3+W.rng.f()*.55;
        if(!useLine(M,0,pull*30)){M.inv.line=0;M.say='The cord parted under the pull.';return 'fail';}
        harvestFish(W,water);
        addBatch(M,FISH.kcal,W.water.stream*.004,'fish',true);M.skill.forage+=.04;M.log.push([W.t,'caught fish']);
      }
      useLine(M,1);
    }}) };
  A.repairHome = {r:['poles','cord','debris','repaired'],w:['repaired','poles','cord','debris'],
    find:(W,M)=>{let s=null,v=.94;for(const q of W.structs)if(!q.assembly&&(q.integrity??1)<v&&dist(M,q)<25){v=q.integrity;s=q;}return s?point(s):null;},
    pre:S=>S.poles>=1&&S.cord>=1&&S.debris>=2&&!S.repaired,
    eff:S=>{S.repaired=1;S.poles--;S.cord--;S.debris-=2;},cost:(W,M,t)=>minutes(M,t)+45,
    exec:work({adjacent:true,mins:45,met:MET.build,pose:'build',tick:(W,M,t,st)=>{
      const s=W.structs.find(s=>s.id===t.sid);if(!s)return 'fail';
      if(!st.paid){if((M.inv.poles||0)<1||(M.inv.cord||0)<1||(M.inv.debris||0)<2)return 'fail';M.inv.poles--;M.inv.cord--;M.inv.debris-=2;st.paid=1;}
      s.integrity=Math.min(1,(s.integrity??1)+.018);s.props=propsOf(s);M.skill.build+=.0012;
    },done:(W,M,t)=>{const s=W.structs.find(s=>s.id===t.sid);s.bracing=Math.min(3,(s.bracing||0)+.25);M.log.push([W.t,'repaired',s.k]);M.projCache=null;}}) };
  A.repairPart={r:[],w:['repaired'],find:()=>null,pre:()=>false,eff:()=>{},cost:()=>1,
    exec:work({adjacent:true,mins:120,met:MET.build,pose:'build',tick:(W,M,t,st)=>{
      const s=W.structs.find(s=>s.id===t.sid),p=s?.assembly.parts.find(p=>p.id===t.pid);if(!s||!p)return 'fail';
      const piece=startRepair(s,p.id,M.inv);if(!piece)return 'fail';piece.progress+=(.8+Math.min(.6,M.skill.build*.3))*(M.contactRate??workRate(W,M));st.left=Math.max(1,12+p.amount*6-piece.progress+1);M.skill.build+=.0012;if(piece.progress>=12+p.amount*6)return 'done';
    },done:(W,M,t)=>{const s=W.structs.find(s=>s.id===t.sid);if(!s||!finishRepair(s,t.pid,M.inv))return 'fail';M.log.push([W.t,'repaired',s.k]);M.projCache=null;}})};
  A.salvagePart={r:[],w:[],find:()=>null,pre:()=>false,eff:()=>{},cost:()=>1,
    exec:work({adjacent:true,mins:18,met:MET.craft,pose:'build',done:(W,M,t)=>{const s=W.structs.find(s=>s.id===t.sid),got=s&&reclaimPart(s,t.pid);if(!got)return 'fail';M.inv[got.mat]=(M.inv[got.mat]||0)+got.amount;M.log.push([W.t,'salvaged',got.mat]);M.projCache=null;}})};
  A.storeFood={r:['food','stored'],w:['stored','food'],find:(W)=>{const s=W.structs.find(s=>(s.props?.store||0)>.4&&((s.props.storageKg||0)*1800>(s.stock||0)+200));return s?point(s):null;},
    pre:S=>S.food>1800&&!S.stored,eff:S=>{S.stored=1;S.food-=1000;},cost:(W,M,t)=>minutes(M,t)+6,
    exec:work({adjacent:true,mins:6,met:MET.carry,pose:'carry',done:(W,M,t)=>{const s=W.structs.find(s=>s.id===t.sid);if(!s)return 'fail';moveFood(M,s,Math.min(1800,Math.max(0,(M.inv.food||0)-900)),true);}})};
  A.takeStored={r:['food'],w:['food'],find:W=>{const s=W.structs.find(s=>s.stock>150);return s?point(s):null;},
    pre:S=>S.food<1200,eff:S=>{S.food+=1000;},cost:(W,M,t)=>minutes(M,t)+4,
    exec:work({adjacent:true,mins:4,met:MET.carry,pose:'carry',done:(W,M,t)=>{const s=W.structs.find(s=>s.id===t.sid);if(!s?.stock)return 'fail';moveFood(M,s,Math.min(1200,s.stock),false);}})};
  A.dryFood={r:['raw','fire'],w:['raw','food','preservedFood'],find:W=>{const s=W.structs.find(s=>(s.props?.drying||0)>.5&&W.fires.some(f=>f.lit&&f.heat>1200&&dist(f,s)<4));return s?point(s):null;},
    pre:S=>S.raw>200&&S.fire===2,eff:S=>{S.food+=S.raw;S.raw=0;S.preservedFood=1;},cost:(W,M,t)=>minutes(M,t)+100,
    exec:work({adjacent:true,mins:100,met:MET.sit,pose:'weave',tick:(W,M,t,st)=>{const s=W.structs.find(s=>s.id===t.sid),f=W.fires.find(f=>f.lit&&f.heat>1200&&dist(f,s)<4);if(!f)return 'fail';st.left=heatFood(M,f,true)?0:2;},done:(W,M)=>{finishFood(M,true);}})};
  A.collectQuarry={r:['raw'],w:['raw'],find:(W,M)=>{const it=W.items.find(it=>it.k==='quarry'&&dist(M,it)<25);return it?{...it,key:it.id,tile:idx(Math.floor(it.x),Math.floor(it.y))}:null;},
    pre:S=>S.raw<2500,eff:S=>{S.raw+=500;},cost:(W,M,t)=>minutes(M,t)+6,
    exec:work({adjacent:true,mins:6,met:MET.gather,pose:'crouch',done:(W,M,t)=>{const i=W.items.findIndex(it=>it.id===t.key);if(i<0)return 'fail';const it=W.items[i];if(it.foodBatches){for(const b of it.foodBatches)M.foodBatches.push(b);syncFood(M);}else addBatch(M,it.kcal,W.water.stream*.01,'rabbit',true);W.items.splice(i,1);}})};
  const positive = { fireClay:['clayPot','pot'], lineFish:['raw'], repairHome:['repaired'], storeFood:['stored'], takeStored:['food'], dryFood:['food','preservedFood'], collectQuarry:['raw'] };
  for (const [k, vars] of Object.entries(positive)) A[k].provides = vars;
  return A;
}
export function craftGoals(W,M,S) {
  const G=[],day=!S.night,home=W.structs.some(s=>FAMILIES[s.k].shelter&&s.stage>1);
  if(!day||!home)return G;
  const goal=(k,v,why,want)=>G.push({k:'craft:'+k,vars:[k],want:want||((S)=>S[k]>=1),v,why});
  if(!S.basket)goal('basket',17,'A basket would carry a larger load of food and materials');
  if(!S.line && Object.values(M.mem).some(m=>m.k==='mussels'||m.k==='cockles'))goal('line',20+Math.max(0,1-M.B.fat/6)*25,'A fishing line would give him another way to find food');
  if(!S.axe)goal('axe',18,'A hafted stone edge would make wood work easier');
  if(!S.wrap && W.wx.temp<12)goal('wrap',20+Math.max(0,12-W.wx.temp)*3,'A woven cape would keep off wind and conserve warmth');
  if(!S.clayPot && !S.greenPot && S.fire===2)goal('greenPot',12,'Clay could become a sturdy pot for boiled water');
  if(S.greenPot&&!S.clayPot&&(M.potDry||0)>=.8&&S.fire===2)goal('clayPot',18,'His dried clay pot needs enough heat in the coals to harden');
  const damage=A_REPAIR(W,M);
  if(damage&&!damage.assembly)goal('repaired',32+(1-(damage.integrity??1))*65,'Repairing the '+FAMILIES[damage.k].label+' would restore its protection');
  const broken=W.structs.flatMap(s=>s.assembly&&dist(M,s)<25?s.assembly.parts.filter(p=>s.stage>p.stage&&p.kind!=='stock'&&(p.condition??1)<.88).map(p=>({s,p})):[]).sort((a,b)=>a.p.condition-b.p.condition)[0];
  if(broken){const {s,p}=broken,qty=dceil(p.amount),t={...point(s),pid:p.id};G.push({k:'repair:'+s.id+':'+p.id,vars:['repaired'],want:S=>S.repaired,v:28+(1-p.condition)*45,why:'Replacing the strained '+p.mat+' in his '+s.label,
    acts:{repairPart:{r:[p.mat,'repaired'],w:[p.mat,'repaired'],provides:['repaired'],find:()=>t,pre:S=>S[p.mat]>=qty&&!S.repaired,eff:S=>{S[p.mat]-=qty;S.repaired=1;},cost:()=>minutes(M,t)+12+p.amount*6}}});}
  if(S.food>2200&&W.structs.some(s=>(s.props?.store||0)>.4))goal('stored',15,'Keeping surplus food dry in his store');
  if(S.raw>800&&M.B.gut>700&&S.fire===2&&!S.preservedFood)goal('preservedFood',19,'Drying surplus fish would keep it useful for leaner days');
  return G;
}
function A_REPAIR(W,M){return W.structs.find(s=>!s.assembly&&(s.integrity??1)<.88&&Math.abs(s.x-M.x)<25&&Math.abs(s.y-M.y)<25);}
export function equipmentStep(W) {
  const M=W.man;if(!M)return;ensureTools(M);
  if(M.inv.greenPot)M.potDry=clamp((M.potDry||0)+Math.max(0,W.wx.temp)*.00007*(1-W.wx.hum*.65)-W.wx.rain*.00008,0,1);
  if(M.inv.wrap) {M.wrapWet=clamp((M.wrapWet||0)+W.wx.rain*.0004-.0004,0,1);}
}
// Recovery is offered as a material source to the ordinary planner, only once per part.
export function salvageActions(W,M) {
  const out={};for(const s of W.structs)if(s.assembly&&finished(s)&&dist(M,s)<25)for(const p of s.assembly.parts)if(!p.removed&&(p.condition??1)<.35&&fitted(s,p)>0){
    const key='recovered:'+s.id+':'+p.id,qty=p.amount*(p.condition??1)*MAT[p.mat].recover;if(qty<.05)continue;
    const t={...point(s),pid:p.id};out['salvage_'+s.id+'_'+p.id]={r:[key,p.mat],w:[key,p.mat],provides:[p.mat],find:()=>t,pre:S=>!S[key],eff:S=>{S[key]=1;S[p.mat]+=qty;},cost:()=>minutes(M,t)+18};
  }return out;
}
