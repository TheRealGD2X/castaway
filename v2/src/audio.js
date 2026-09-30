// Read-only acoustic presentation. The worklet clock, never the display frame rate, produces sound.
import { acousticState } from './render/sound-state.js';
import { displaySeconds } from './render/simulation-clock.js';

let ctx, master, field, loading, enabled = false, lastUpdate = -Infinity, suspendTimer;
const seenHorns = new Set();

async function initialise() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error('Audio is unavailable in this browser.');
  ctx = new Audio({ latencyHint: 'playback' });
  // Resume inside the original tap, before awaiting worklet loading (also needed by Safari).
  const resumed = ctx.resume();
  await ctx.audioWorklet.addModule(new URL('./render/sound-worklet.js', import.meta.url));
  field = new AudioWorkletNode(ctx, 'castaway-acoustics', {
    numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2],
  });
  const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 45;
  const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 4200; low.Q.value = .5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3;
  comp.attack.value = .02; comp.release.value = .8;
  master = ctx.createGain(); master.gain.value = 0;
  field.connect(high); high.connect(low); low.connect(comp); comp.connect(master); master.connect(ctx.destination);
  field.onprocessorerror = () => {
    audioStop(); const failed = ctx;
    ctx = master = field = loading = null;
    failed.close().catch(() => {});
    document.dispatchEvent(new Event('castaway-audio-error'));
  };
  await resumed;
}

export async function audioStart() {
  enabled = true; clearTimeout(suspendTimer);
  try {
    loading ||= initialise(); await loading;
    if (!enabled) { audioStop(); return; }
    await ctx.resume();
    if (!enabled) return;
    lastUpdate = -Infinity;
    master.gain.setTargetAtTime(.72, ctx.currentTime, 1.2);
  } catch (error) {
    enabled = false;
    if (ctx) await ctx.close().catch(() => {});
    ctx = master = field = loading = null;
    throw error;
  }
}

export function audioStop() {
  enabled = false; clearTimeout(suspendTimer);
  if (!master || !ctx) return;
  master.gain.setTargetAtTime(0, ctx.currentTime, .12);
  suspendTimer = setTimeout(() => { if (!enabled && ctx?.state === 'running') ctx.suspend().catch(() => {}); }, 1100);
}

export function audioUpdate(W, V,now=performance.now()) {
  if (!enabled || !field || ctx.state !== 'running') return;
  const t = ctx.currentTime;
  if (t - lastUpdate < .2) return; // five state snapshots/sec; audio itself is sample-continuous
  lastUpdate = t;
  const state = acousticState(W, V,displaySeconds(W,now));
  field.port.postMessage({ state, seed: W.seed });
  for(const voice of state.voices||[]){const key=`voice:${W.seed}:${voice.id}:${voice.t}`;if(!seenHorns.has(key)){seenHorns.add(key);field.port.postMessage({voice});}}
  for (const sh of W.ships || []) {
    const key = `${W.seed}:${sh.id}:${sh.horn}`;
    if (!sh.horn || seenHorns.has(key)) continue;
    seenHorns.add(key);
    // Opening the island must not replay historical greetings.
    if (W.t === sh.horn) field.port.postMessage({ horn: state.horns.find(h => h.id === sh.id) });
  }
  if (seenHorns.size > 128) { const keys = [...seenHorns]; for (const key of keys.slice(0, -64)) seenHorns.delete(key); }
}
