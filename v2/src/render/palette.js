// A warm, cozy palette. Every material is a short ramp from shadow to highlight; outlines are a warm near-black.
// (No purple anywhere: house rule.)
export const OUT = "#2b1d16";          // outline
export const OUT2 = "#3d2a1e";         // softer inner outline
export const R = {
  grass: ["#3d6b2f", "#4f8a36", "#63a33c", "#7cbd47", "#9bd35a"],
  meadow: ["#56812f", "#6d9a36", "#87b33e", "#a3c94c", "#c3dc68"],
  wood: ["#2f5528", "#3b6a2e", "#4a7f33", "#5e943b", "#76ab48"],   // woodland floor, shadier
  dirt: ["#6b4526", "#86592f", "#a3713c", "#bf8a4c", "#d6a462"],
  sand: ["#b08c52", "#c9a664", "#dcbd7b", "#ebd294", "#f6e4b0"],
  shingle: ["#6f6a60", "#8a847a", "#a59f94", "#bfb9ad", "#d6d1c6"],
  rock: ["#4f5157", "#686b71", "#83868b", "#a1a3a6", "#c2c3c3"],
  water: ["#1d5d78", "#23738f", "#2e8ca6", "#4aa9bd", "#7ccad2"],
  deep: ["#174b66", "#1b5873", "#206583"],
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
  [0, "#4a5a8c"], [4.5, "#4f5f90"], [6, "#b58a86"], [7, "#f0d0b0"], [9, "#ffffff"], [16.5, "#ffffff"],
  [18.5, "#ffd9a8"], [19.5, "#d98c78"], [20.5, "#6f6f9c"], [22, "#4a5a8c"], [24, "#4a5a8c"],
];
export function hex(h) { return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
export function mix(a, b, t) { const A = hex(a), B = hex(b); return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, "0")).join(""); }
