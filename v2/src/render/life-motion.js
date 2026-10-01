// Independent physiological motion layered over paid work and locomotion.
// Pure display math: never uses the simulation RNG or changes Tomas's needs.
const clamp=v=>Math.max(0,Math.min(1,v||0));
const noise=n=>{const x=Math.sin(n*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
export function lifeMotion(B={},spec={},now=0,identity=1){
  if(B.alive===false)return {breath:0,blink:true,gaze:0,settle:0,tremor:0,slump:0,stride:0,chest:0};
  const asleep=spec.stance==='lie'||B.asleep,walking=spec.stance==='walk';
  const fatigue=clamp(B.fatigue),pain=clamp((B.hurt||[]).reduce((a,h)=>a+(h.sev||0),0)),shiver=clamp(B.shiver);
  const effort=['strike','pull','rub','scoop','saw','lift'].includes(spec.motion)?1:walking?.65:0;
  const clock=now/1000,seed=noise(identity+41)*8,period=asleep?5.3:4.1-effort*1.2+fatigue*.35;
  const breathPhase=clock/period*Math.PI*2+seed,breath=Math.sin(breathPhase)*(.22+effort*.14);
  const interval=Math.floor(clock/3.7),within=clock/3.7-interval,blinkAt=.32+noise(interval+identity*17)*.45;
  const blink=!asleep&&Math.abs(within-blinkAt)<.022+fatigue*.01;
  // Slow gaze drift and small posture shifts have their own clocks, so they
  // do not repeat on the same phase as an axe stroke or a walking stride.
  const gaze=asleep?0:(Math.sin(clock/4.7+seed)+Math.sin(clock/9.1+seed*.7))*.15;
  const settle=asleep?0:Math.sin(clock/8.9+seed)*.13*(1-effort*.7);
  const tremor=Math.sin(clock*27+seed)*shiver*.25;
  return {breath:Math.round(breath*12)/12,blink:asleep||blink,gaze:Math.round(gaze*6)/6,
    settle:Math.round(settle*12)/12,tremor:Math.round(tremor*12)/12,
    slump:Math.round((fatigue*.32+pain*.14)*12)/12,stride:Math.round((1-fatigue*.22-pain*.18)*64)/64,
    chest:Math.round((1+Math.sin(breathPhase))*.5*4)/4};
}
