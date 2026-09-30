// Shared presentation interpolation for water, floating bodies and acoustics.
// It changes no world state and extrapolates only within the current minute.
const anchors=new WeakMap();
export function displaySeconds(W,now){let a=anchors.get(W);if(!a||a.t!==W.t){a={t:W.t,now};anchors.set(W,a);}return W.t*60+Math.max(0,Math.min(60,(now-a.now)/1000));}
