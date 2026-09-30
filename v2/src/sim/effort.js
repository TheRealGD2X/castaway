// Load, mechanical work and support. kg, metres, watts; continuous changes, no load threshold.
import { MAT } from '../build/assembly.js';
import { toolProps } from './tools.js';
import { foodMass } from './food.js';
export function carriedMass(M){let kg=0;for(const [k,n] of Object.entries(M.inv))if(MAT[k])kg+=n*MAT[k].kg;
  for(const k of ['fuel','kindling','tinder','clean'])kg+=M.inv[k]||0;
  kg+=(M.inv.cord||0)*.09+(M.inv.basket||0)*1.26+(M.inv.wrap||0)*2.27+(M.inv.greenPot||M.inv.clayPot||0)*3+(M.inv.flake||0)*.15+(M.inv.drill||0)*.3+(M.inv.pot&&!M.inv.clayPot?.15:0);
  for(const [k,t] of Object.entries(M.tools||{}))if(M.inv[k])kg+=toolProps(t).mass;
  for(const b of M.foodBatches||[])kg+=foodMass(b);return kg;
}
export function loadFactor(M){const kg=carriedMass(M),bulk=(M.inv.poles||0)*.12+(M.inv.boughs||0)*.035;return 1+kg/75*.55+bulk/(1+(M.inv.basket||0));}
export function workRate(W,M){const bench=W.structs.find(s=>(s.props?.bench||0)>.2&&Math.abs(s.x-M.x)<2&&Math.abs(s.y-M.y)<2);
  const unsupported=bench?1-(bench.props.bench||0)*.35:1;return 1/(1+(carriedMass(M)/75)*.18+unsupported*.08+(M.B.fatigue||0)*.12);
}
export function effortMet(W,M,base){const kg=carriedMass(M);if(base<=1.6)return base;const moving=M.pose==='walk'||M.pose==='carry',work=moving?(kg*9.81*.025*(M.walkedM||0)/60+(M.climbedM||0)*(75+kg)*9.81/60)/.25:base*82*kg/75*.025;return base+work/82;}
