// What his deeper mind (Claude) is told about his life: the day and hour, his body as he feels it, what he has and
// has built, what he knows of the island, the dog, what happened lately, what he's doing and why, and his own
// journal so far. Plain words and numbers; nothing he couldn't know himself.
import { cal } from "../core/time.js";
import { feel } from "./body.js";
import { FAMILIES, finished } from "../build/build.js";
const FROM = ["E", "SE", "S", "SW", "W", "NW", "N", "NE"];              // octant k blows toward FROM[k]; it comes from FROM[k+4]
const HOW = v => v > .85 ? "desperately" : v > .6 ? "very" : v > .35 ? "somewhat" : v > .15 ? "a little" : "not";
export function brief(W) {
  const M = W.man, c = cal(W.born, W.t), f = feel(M.B), x = W.wx, dog = W.animals.find(a => a.sp === "dog");
  const since = W.t - 72 * 60, log = M.log.filter(l => l[0] > since && l[1] !== "failed").map(l => ({ day: Math.floor(l[0] / 1440) + 1, time: hm(W, l[0]), what: l.slice(1).join(" ") }));
  return {
    day: Math.floor(W.t / 1440) + 1, t: W.t, when: `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][c.wd] || c.wd} ${c.d}/${c.mo + 1} ${hm(W, W.t)} (UK time)`,
    alive: M.B.alive, cause: M.B.cause || undefined,
    weather: { temp: Math.round(x.temp), wind: `${Math.round(x.wind * 2.237)} mph from the ${FROM[((x.windDir | 0) + 4) % 8]}`, rain: x.rain > 1.5 ? "heavy" : x.rain > 0 ? "light" : "none", fog: x.fog > .3, light: x.elev > .05 ? "day" : x.elev > -.1 ? "twilight" : "night", tide: x.tide < -.8 ? "low" : x.tide > .8 ? "high" : x.tide < 0 ? "falling/low-ish" : "high-ish" },
    body: { hungry: HOW(f.hunger), thirsty: HOW(f.thirst), cold: HOW(f.cold), tired: HOW(f.tired), weary: HOW(f.weary), wet: HOW(f.wet), ill: M.B.ill > .05 ? HOW(M.B.ill) : "no", hurt: (M.B.hurt || []).length ? "a cut, healing" : "no", coreC: +M.B.core.toFixed(1), lonely: HOW(M.lonely || 0) },
    doing: M.doing || "", why: M.why || "", said: M.say || "",
    has: Object.fromEntries(Object.entries(M.inv).filter(([, v]) => v > .01).map(([k, v]) => [k, +(+v).toFixed(1)])),
    skills: Object.fromEntries(Object.entries(M.skill).map(([k, v]) => [k, +v.toFixed(2)])),
    built: W.structs.map(s => ({ what: FAMILIES[s.k].label, stage: finished(s) ? "finished" : `${s.stages[s.stage].name} next (${s.stage}/${s.stages.length} stages done)` })),
    canBuild: Object.entries(FAMILIES).map(([k, F]) => ({ k: "build:" + k, what: F.label, able: M.skill.build >= F.minSkill })),
    fire: W.fires.map(F => (F.lit ? "burning" : F.embers > .03 ? "embers" : "cold") + (F.signal ? " (signal fire)" : "")),
    beliefs: M.belief || {},
    dog: dog && !dog.adrift && M.mem.dog ? { name: dog.name, trust: dog.trust > .8 ? "trusts him completely" : dog.trust > .5 ? "trusts him" : dog.trust > .2 ? "wary but coming round" : "keeps its distance", thin: dog.E < .3 } : dog && !dog.adrift ? "a dog is ashore somewhere; he hasn't seen it yet" : "no dog (yet)",
    knowsOf: summarise(M), shipsSeen: M.log.filter(l => l[1] === "ship").length,
    lately: log.slice(-40), intentions: (M.intents || []).filter(q => q.until > W.t).map(q => ({ k: q.k, w: q.w, hoursLeft: Math.round((q.until - W.t) / 60) })),
    journal: (M.journal || []).slice(-6).map(j => ({ day: Math.floor(j.t / 1440) + 1, text: j.text })), lastThought: M.thought || "",
  };
}
function hm(W, t) { const c = cal(W.born, t); return `${String(c.h).padStart(2, "0")}:${String(c.mi).padStart(2, "0")}`; }
function summarise(M) { const n = {}; for (const k in M.mem) { const m = M.mem[k]; n[m.k] = (n[m.k] || 0) + 1; } let known = 0; for (const v of M.known) known += v; return { places: n, islandSeen: Math.round(known / M.known.length * 100) + "%" }; }
