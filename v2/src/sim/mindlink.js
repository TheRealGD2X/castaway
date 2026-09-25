// His deeper mind (Claude, a few times a day) speaks into the simulation only through thoughts, each timed to a
// simulated minute so every device and every replay applies it at the same moment. A thought can:
//  * be a line of inner monologue (shown when you tap to see why he's doing what he's doing),
//  * add a diary entry to his journal,
//  * add INTENTIONS: wishes with a weight and a lifetime ("build:roundhouse" 25 for 72 hours, "explore" 15 for a
//    day). They don't make him do anything: they add weight to the goals his own mind forms, which still compete
//    with thirst, cold, hunger, tiredness and what he's able to do. Hunger always wins over ambition.
//  * give names (he may name the dog, a place).
// Kinds of intention the mind understands: build:<family>, explore, food, fire, dog, rest, stock, signal, boil.
export const INTENT_KINDS = ["explore", "food", "fire", "dog", "rest", "stock", "signal", "boil"];
export function thoughtsFrom(list, t) { const L = (list || []).filter(x => Number.isInteger(x.applyAt)).sort((a, b) => a.applyAt - b.applyAt); let i = 0; while (i < L.length && L[i].applyAt <= t) i++; return { L, i }; }
export function applyThoughts(W) {
  const Q = W.thoughtQ; if (!Q || !W.man) return;
  while (Q.i < Q.L.length && Q.L[Q.i].applyAt <= W.t) {
    const d = Q.L[Q.i++], M = W.man;
    if (d.thought) { M.thought = String(d.thought).slice(0, 400); M.thoughtT = W.t; }
    if (d.diary) (M.journal || (M.journal = [])).push({ t: W.t, text: String(d.diary).slice(0, 2000) });
    for (const it of d.intents || []) {
      const k = String(it.k || ""); if (!(k.startsWith("build:") || INTENT_KINDS.includes(k))) continue;
      const w = Math.max(-30, Math.min(40, +it.w || 0)), hours = Math.max(1, Math.min(24 * 14, +it.hours || 24));
      M.intents = (M.intents || []).filter(q => q.k !== k); M.intents.push({ k, w, until: W.t + hours * 60 });
    }
    if (d.names) { M.names = Object.assign(M.names || {}, d.names); if (d.names.dog) for (const a of W.animals) if (a.sp === "dog") a.name = String(d.names.dog).slice(0, 24); }
  }
}
// how much his deeper mind wants this kind of goal right now
export function intent(W, M, k) { let w = 0; for (const q of M.intents || []) if (q.until > W.t && (q.k === k || (k.startsWith("build:") && q.k === k))) w += q.w; return w; }
