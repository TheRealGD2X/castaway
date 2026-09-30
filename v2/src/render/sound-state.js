// The listener is the camera; all sources are read from existing, finite world state.
import { analyse } from '../build/assembly.js';
import { elevation } from '../sim/geomorph.js';
import { shipXY } from '../sim/ships.js';
import { localWeather } from '../sim/atmosphere.js';
import { transmission } from '../sim/senses.js';
import { coastal } from '../sim/ocean.js';
import { waveHeight,phaseAt,OMEGA } from '../sim/ocean-waves.js';
import { RHO,G } from '../sim/ocean-grid.js';

const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const safe = v => Number.isFinite(v) ? Math.max(0, v) : 0;
const coasts = new WeakMap();
export const distanceGain = (metres, radius = 6) => radius / Math.sqrt(radius * radius + metres * metres);
export const rainPower = (mmHour, area) => safe(mmHour) * safe(area) / 3600000 * 1000 * 6 * 6 / 2;
const quiet = (power, reference, ceiling) => ceiling * Math.sqrt(safe(power) / (safe(power) + reference));
function insideFloor(s, x, y) {
  const floor = s.assembly.floor || [], [rx, ry] = [[1,0],[0,1],[-1,0],[0,-1]][s.dir || 0];
  const dx = 2 * (x - s.x), dy = 2 * (y - s.y), px = dx*rx + dy*ry, py = -dx*ry + dy*rx;
  let inside = false;
  for (let i = 0, j = floor.length - 1; i < floor.length; j = i++) {
    const a = floor[i], b = floor[j];
    if ((a[1] > py) !== (b[1] > py) && px < (b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
  }
  return inside;
}

export function acousticState(W, V,seconds=W.t*60) {
  const x = Number.isFinite(V.cam.x) ? V.cam.x / 16 : W.cx;
  const y = Number.isFinite(V.cam.y) ? V.cam.y / 16 : W.cy;
  const wx = localWeather(W,x,y) || {}, wind = safe(wx.wind), gust = safe(wx.gust || wind);
  const dist = (sx, sy) => 2 * Math.hypot(sx - x, sy - y);
  const pan = sx => clamp((sx - x) / 16, -.65, .65);
  let coast = coasts.get(W);
  if (!coast) {
    coast = [];
    for (let i = 0; i < W.ter.length; i++) if (W.ter[i] > 1 && W.dsea?.[i] === 1) coast.push(i);
    coasts.set(W, coast);
  }
  let shoreDistance = Infinity, shoreX = x;
  for (const i of coast) {
    const sx = i % W.MW + .5, sy = Math.floor(i / W.MW) + .5, d = dist(sx, sy);
    if (d < shoreDistance) { shoreDistance = d; shoreX = sx; }
  }
  let wave = safe(W.hydro?.wave), shoreGain = 1 / Math.sqrt(1 + shoreDistance / 10),waveEnergy = 1000 * 9.81 * wave * wave / 8,surfPulse=0,oceanActive=0;
  if(W.ocean){const g=coastal(W);waveEnergy=0;let strongest=-1,strongPower=0,panSum=0;for(let i=0;i<g.n;i++){const sx=(i%g.nx+.5)*4,sy=(Math.floor(i/g.nx)+.5)*4,power=g.breaking[i]*g.area[i]*distanceGain(dist(sx,sy),8)**2;waveEnergy+=power;panSum+=power*sx;if(power>strongPower){strongPower=power;strongest=i;}}shoreGain=1;shoreX=waveEnergy?panSum/waveEnergy:x;oceanActive=1;if(strongest>=0){wave=waveHeight(g,strongest);let height=0;for(let b=0;b<24;b++){const amplitude=Math.sqrt(Math.max(0,2*g.action[b*g.n+strongest]*OMEGA[Math.floor(b/8)]/g.area[strongest]/RHO/G));height+=amplitude*Math.sin(phaseAt(g,b,strongest,(strongest%g.nx+.5)*g.dx,(Math.floor(strongest/g.nx)+.5)*g.dy,seconds,W.seed));}surfPulse=clamp(.5+height/Math.max(.05,wave));}}
  const rain = safe(wx.rain) * (1 - clamp((1 - (wx.temp ?? 10)) / 2));
  let leafPower = 0;
  for (const e of W.ents || []) if (e.leafKg > 0) leafPower += .5*1.2*safe(localWeather(W,e.x,e.y).wind)**3*Math.min(1, e.leafKg / 8) * distanceGain(dist(e.x, e.y), 3) ** 2/6;
  let streamGain = 0, streamPan = 0, streamDrop = 0;
  for (const i of W.stream || []) {
    const sx = i % W.MW + .5, sy = Math.floor(i / W.MW) + .5, g = distanceGain(dist(sx, sy), 4);
    if (g > streamGain) {
      streamGain = g; streamPan = pan(sx);
      const j = W.hydroMap?.down?.[i];
      streamDrop = j >= 0 ? Math.max(0, elevation(W, i) - elevation(W, j)) : 0;
    }
  }
  // hydro.flow is m³/min; gravitational power is rho*g*Q*head, in watts.
  const flow = safe(W.hydro?.flow) / 60, streamPower = 1000 * 9.81 * flow * streamDrop;
  let firePower = 0, firePan = 0, moisture = 0, roofPower = 0, roofPan = 0, softRoof = 0, shelter = 0;
  for (const F of W.fires || []) {
    if (!F.lit || !(F.heat > 0)) continue;
    const g = distanceGain(dist(F.x, F.y), 3), power = F.heat * g * g * (F.banked ? .12 : 1);
    firePower += power; firePan += power * pan(F.x);
    const fuel = F.fuel?.logs || [0, 0]; moisture += power * clamp(fuel[1]);
  }
  for (const s of W.structs || []) {
    const d = dist(s.x, s.y), g = distanceGain(d, 3);
    const sourceWx=localWeather(W,s.x,s.y),sourceRain=safe(sourceWx.rain)*(1-clamp((1-(sourceWx.temp??10))/2));
    if (s.assembly?.habitat && insideFloor(s, x, y)) shelter = Math.max(shelter, clamp(s.props?.indoorFire || 0));
    for (const geom of s.assembly ? analyse(s).panels : []) {
      const p = geom.p;
      if (geom.z < .35 || geom.normal < .1 || geom.f <= 0) continue;
      const power = rainPower(sourceRain, geom.projected * geom.f) * g * g;
      roofPower += power; roofPan += power * pan(s.x);
      softRoof += power * (['reeds', 'bracken', 'boughs', 'debris'].includes(p.mat) ? 1 : .15);
    }
  }
  const outdoor = 1 - shelter * .7;
  const work=W.man?.workContact,active=work?.t===W.t&&W.man?.act?.st.phase!=='go',workGain=active?distanceGain(dist(work.x,work.y),2)*transmission(W,{x,y},work,true):0;
  return {
    // Source energy maps to a gentle listening range, not calibrated dB SPL.
    sea: quiet(waveEnergy, 250, .23) * shoreGain * outdoor, seaPan: pan(shoreX), wave,oceanActive,surfPulse,
    wind: quiet(.5 * 1.2 * wind ** 3, 300, .055) * outdoor,
    leaves: quiet(leafPower, 300, .09) * outdoor, gust: clamp(gust / Math.max(1, wind), 1, 2),
    rain: quiet(rainPower(rain, 4), .04, .12) * outdoor, rainRate: rain,
    roof: quiet(roofPower, .03, .10), roofPan: roofPower ? roofPan / roofPower : 0,
    roofSoft: roofPower ? softRoof / roofPower : 1,
    stream: quiet(streamPower, 8, .13) * streamGain * outdoor, streamPan, flow,
    fire: quiet(firePower, 3000, .13), firePan: firePower ? firePan / firePower : 0,
    fireMoisture: firePower ? moisture / firePower : 0, muffling: shelter,
    work:active?quiet(work.fractureJ/60,.6,.035)*workGain:0,workPan:active?pan(work.x):0,workHz:active?work.frequency:0,
    voices:(W.animals||[]).filter(a=>a.call?.t===W.t&&!a.dead).map(a=>({id:a.id,t:a.call.t,hz:a.call.hz,duration:a.call.duration,gain:Math.min(.018,Math.sqrt(a.call.energyJ*.001))*distanceGain(dist(a.x,a.y),2)*transmission(W,{x,y},a,true),pan:pan(a.x)})),
    horns: (W.ships || []).filter(sh => sh.horn === W.t && sh.horn > 0).map(sh => {
      const p = shipXY(W, sh), sx = W.cx + p.x / 2, sy = W.cy + p.y / 2;
      return { id: sh.id, gain: .045 * distanceGain(dist(sx, sy), 180) * outdoor, pan: pan(sx) };
    }),
  };
}
