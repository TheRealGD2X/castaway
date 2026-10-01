// A warm, cozy palette. Every material is a short ramp from shadow to highlight; outlines are a warm near-black.
// (No purple anywhere: house rule.)
export const OUT = "#403f30";          // soft warm silhouette
export const OUT2 = "#686b4e";         // turf and inner material edges
export const R = {
  grass: ["#4d6446", "#69805a", "#8b9d70", "#a7b689", "#c7d2a5"],
  meadow: ["#687748", "#879562", "#a5b37c", "#c2cb99", "#dce0b7"],
  wood: ["#354d3e", "#50664b", "#70805b", "#8f9a72", "#aeb793"],   // woodland floor, shadier
  dirt: ["#5b503d", "#7f6e50", "#a48d63", "#c2ab7c", "#ddc99b"],
  sand: ["#aa956c", "#c8b58b", "#decfa6", "#ece0bb", "#f6efda"],
  shingle: ["#727c73", "#90978a", "#abb0a0", "#c6cabc", "#e0dfcf"],
  rock: ["#424f50", "#626f6c", "#83908a", "#a8b2a7", "#d0d4c5"],
  water: ["#254f63", "#367781", "#569b9d", "#89c1b4", "#bee0cb"],
  deep: ["#193849", "#245365", "#34717d"],
  foam: ["#e0edda", "#f5f5e5"],
  marsh: ["#45624a", "#607751", "#809366"],
  bark: ["#393428", "#584330", "#805c3c", "#ac8556", "#d2b680"],
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
