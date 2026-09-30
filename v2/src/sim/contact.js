// Mechanical work advances workpieces. The model resolves an equivalent
// sequence of strokes per minute; renderer/audio interpolate these strokes.
import { clamp } from '../core/dmath.js';
import { toolProps, useAxe } from './tools.js';
import { workRate } from './effort.js';
import { localWeather } from './atmosphere.js';
const PROFILES={cut:{force:90,travel:.08,hz:.6,efficiency:.65},snap:{force:130,travel:.05,hz:.25,efficiency:.65},weave:{force:12,travel:.12,hz:.45,efficiency:.8},whittle:{force:30,travel:.06,hz:.5,efficiency:.7},potter:{force:18,travel:.1,hz:.35,efficiency:.8},build:{force:75,travel:.09,hz:.25,efficiency:.75},drill:{force:35,travel:.2,hz:1.8,efficiency:.65},pull:{force:100,travel:.12,hz:.25,efficiency:.7},pick:{force:5,travel:.08,hz:.3,efficiency:.9},crouch:{force:18,travel:.06,hz:.3,efficiency:.8}};
export function contactWork(W,M,target,pose=M.pose,dt=1){const p=PROFILES[pose];if(!p){M.workContact=null;M.contactRate=workRate(W,M);return M.contactRate;}
  const rate=workRate(W,M),axe=(pose==='snap'||pose==='cut')&&M.inv.axe?toolProps(M.tools?.axe):null;
  const force=Math.min(p.force,axe?axe.force:180*clamp(1-M.B.fatigue*.5,.1,1)),strokes=p.hz*rate*dt*60;
  const kinetic=axe?Math.min(axe.energy,force*p.travel):force*p.travel,energy=kinetic*strokes,reference=p.force*p.travel*p.hz*60;
  const metW=Math.max(0,(M.met||2)-1)*85*.22,available=metW*dt*60,delivered=Math.min(energy,available);
  const progress=delivered/Math.max(.001,reference*dt),friction=delivered*(1-p.efficiency),fracture=delivered*p.efficiency;
  M.mechanicalWorkJ=(M.mechanicalWorkJ||0)+delivered;M.contactRate=progress;
  const actualStrokes=kinetic>0?delivered/kinetic:0,travel=force>0?kinetic/force:0;
  M.workContact={t:W.t,pose,x:target?.x??M.x,y:target?.y??M.y,forceN:force,travelM:travel,frequency:actualStrokes/(dt*60),strokes:actualStrokes,energyJ:delivered,heatJ:friction,fractureJ:fracture,tool:axe?'axe':null};
  if(axe)useAxe(M,dt,localWeather(W,M.x,M.y),M.workContact);
  // Stored work survives interrupted manufacture; unpaid work never creates
  // material. Joint strain is exposed from installed part geometry as well.
  const s=W.structs.find(q=>q.id===target?.sid);if(s){s.workJ=(s.workJ||0)+fracture;const part=s.assembly?.parts.find(q=>q.stage===s.stage);if(part){const k=part.kind==='joint'?1e4:2e5;part.contact={forceN:force,deflectionM:force/k,heatJ:(part.contact?.heatJ||0)+friction};}}
  return progress;
}
