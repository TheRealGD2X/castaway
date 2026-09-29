// A warm, cozy palette. Every material is a short ramp from shadow to highlight; outlines are a warm near-black.
// (No purple anywhere: house rule.)
export const OUT = "#4c3c2b";          // warm one-pixel outline
export const OUT2 = "#68553b";         // softer inner outline
export const R = {
  grass: ["#4c6840", "#64814d", "#7c965b", "#9bb474", "#bdcc8d"],
  meadow: ["#6c7e46", "#869758", "#a5b36c", "#c0c783", "#d4d5a0"],
  wood: ["#42543b", "#536846", "#6a7d53", "#829369", "#a0ad7f"],   // woodland floor, shadier
  dirt: ["#6b4526", "#86592f", "#a3713c", "#bf8a4c", "#d6a462"],
  sand: ["#b08c52", "#c9a664", "#dcbd7b", "#ebd294", "#f6e4b0"],
  shingle: ["#847d6a", "#99917d", "#ada68f", "#c2bba4", "#d5cfb9"],
  rock: ["#4f5157", "#686b71", "#83868b", "#a1a3a6", "#c2c3c3"],
  water: ["#365e6b", "#427785", "#5697a2", "#7cb8b7", "#a5d2c8"],
  deep: ["#294f60", "#315e6d", "#3a6e79"],
  foam: ["#d9f3ef", "#f4fffb"],
  marsh: ["#4c6b33", "#5d7e3a", "#6f9142"],
  bark: ["#3a2418", "#553523", "#6f472d", "#8a5c3a", "#a4744b"],
  birch: ["#8d8a80", "#bdb9ac", "#e2ded2", "#f6f3ea"],
  oak: ["#1f4a27", "#2b5f2e", "#3a7a35", "#4f9640", "#6cb04c", "#8ccc5e"],
  oakAut: ["#6b3a18", "#8d4d1c", "#b3651f", "#d18426", "#e6a43a", "#f2c45a"],
  birchL: ["#3d6a2a", "#4f8331", "#669d3b", "#82b84a", "#a4d05e", "#c4e27a"],
  birchAut: ["#8a6a18", "#a88420", "#c9a22a", "#e0bd3a", "#efd35a", "#f8e583"],
  pine: ["#173a30", "#1f4a3a", "#295e46", "#357452", "#468b5f"],
  rowan: ["#284f25", "#346530", "#437e39", "#579844", "#72b250", "#8fca62"],
  berry: ["#8e1f23", "#c12d2b", "#e3533f", "#f48a66"],
  hazel: ["#2d5626", "#3c6d2d", "#4d8534", "#629d3f", "#7fb84d"],
  gorse: ["#2c4a22", "#3b5f28", "#4d7630"],
  gorseF: ["#d9a51f", "#f2c832", "#fbe36a"],
  fern: ["#2e5c26", "#3f762c", "#559235", "#70ad42"],
  reed: ["#6b6a2f", "#8a8a3a", "#aaa74c", "#c8c262"],
  flint: ["#2a2b31", "#3e4048", "#5b5e68", "#8b8f98"],
  skin: ["#a8664a", "#cf8a64", "#eab08a", "#f8cfae"],
  shadow: "rgba(34, 26, 18, .28)",
};
// sky and light over the day: multiply tint (cozy dusk and blue nights) and how strong warm light sources look
export const SKY = [
  // [hour, multiply colour]
  [0, "#526e7c"], [4.5, "#617e88"], [6, "#bd9f7b"], [7, "#f0d0b0"], [9, "#ffffff"], [16.5, "#ffffff"],
  [18.5, "#ffd9a8"], [19.5, "#c29a76"], [20.5, "#718d91"], [22, "#526e7c"], [24, "#526e7c"],
];
export function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
