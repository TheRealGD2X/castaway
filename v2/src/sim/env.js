// The island's environment: sun, tide and weather, as physical quantities.
// Weather: air masses come and go as a Markov chain of regimes (a high, a trough, a depression with its fronts,
// showery polar air behind it), with British seasonal odds and durations; within a regime, temperature, cloud,
// wind, humidity and rain relax smoothly toward what that air mass brings at this hour, and showers and gusts
// come from smooth deterministic noise (they cost no random numbers). Fog forms on calm, humid, cool dawns.
import { dsin, dcos, clamp, relax, PI, TAU } from "../core/dmath.js";
import { vnoise } from "../core/noise.js";
import { cal } from "../core/time.js";

export const LAT = 57 * PI / 180, LON = -6.5;          // a Hebridean sort of island
// monthly mean air temperature (°C), mid-month, and mean daily range
const TMEAN = [5.5, 5.3, 6.5, 8.3, 10.8, 13.2, 14.8, 15.0, 13.4, 11.0, 8.0, 6.4], TRANGE = [4, 4.5, 5.5, 6.5, 7, 7, 6.5, 6, 5.5, 5, 4.5, 4];
export function climateAt(doy) {                       // smooth interpolation between month centres
  const m = (doy - 15.2) / 30.44, i = Math.floor(m), f = m - i, a = ((i % 12) + 12) % 12, b = (a + 1) % 12;
  return { tmean: TMEAN[a] + (TMEAN[b] - TMEAN[a]) * f, trange: TRANGE[a] + (TRANGE[b] - TRANGE[a]) * f, winter: .5 + .5 * dcos(TAU * (doy - 15) / 365) };
}
// the sun: elevation (radians) and clear-sky radiation for a UTC timestamp
export function sunAt(ms) {
  const days = ms / 86400000, doy = days - 365.2425 * Math.floor(days / 365.2425);
  const decl = 23.44 * PI / 180 * dsin(TAU * (284 + doy) / 365);
  const solarHour = ((ms / 3600000) % 24 + 24) % 24 + LON / 15;
  const ha = (solarHour - 12) * 15 * PI / 180;
  const s = dsin(LAT) * dsin(decl) + dcos(LAT) * dcos(decl) * dcos(ha);
  return { elev: s, rad: s > 0 ? 1050 * s * (.7 + .3 * s) : 0 };    // sin(elevation), W/m2 through clear air
}
// tide height (m) about mean sea level: the lunar semidiurnal tide with spring-neap modulation
export function tideAt(t) {
  const m2 = dsin(TAU * t / 745.2 + 1.1), sn = .75 + .25 * dcos(TAU * t / 21262);
  return 1.9 * sn * m2;
}
// air-mass regimes: [cloud, rain mm/h when raining, rain share, wind m/s, temp offset, humidity, hours min..max]
export const REG = {
  high: { cloud: .15, rain: 0, wet: 0, wind: 3, dt: 1, hum: .72, hrs: [30, 120] },
  ridge: { cloud: .4, rain: .3, wet: .03, wind: 4.5, dt: .5, hum: .8, hrs: [12, 36] },
  front: { cloud: .95, rain: 2.2, wet: .55, wind: 9.5, dt: 1.5, hum: .95, hrs: [6, 18] },
  low: { cloud: .8, rain: 1.1, wet: .28, wind: 8.5, dt: 0, hum: .9, hrs: [12, 48] },
  showery: { cloud: .55, rain: 3, wet: .13, wind: 7.5, dt: -1.8, hum: .82, hrs: [12, 40] },
};
const NEXT = { high: [["ridge", .7], ["front", .3]], ridge: [["front", .75], ["high", .25]], front: [["low", .55], ["showery", .45]], low: [["showery", .6], ["front", .25], ["ridge", .15]], showery: [["ridge", .55], ["high", .25], ["front", .2]] };

export function envInit(W) {
  const c = climateAt(cal(W.born, 0).doy);
  W.wx = { reg: "ridge", until: 18 * 60, temp: c.tmean, cloud: .4, rain: 0, wind: 5, windDir: 4, hum: .8, fog: 0, gust: 0 };
}
// one minute of weather
export function envStep(W) {
  const x = W.wx, t = W.t, C = cal(W.born, t), c = climateAt(C.doy), s = W.seed;
  if (t >= x.until) {                                   // the next air mass arrives
    let opts = NEXT[x.reg], r = W.rng.f(), acc = 0;
    if (c.winter > .6 && x.reg === "ridge") opts = [["front", .85], ["high", .15]];   // winters are stormier
    for (const [k, p] of opts) { acc += p; if (r < acc) { x.reg = k; break; } }
    const R = REG[x.reg]; x.until = t + Math.round((R.hrs[0] + W.rng.f() * (R.hrs[1] - R.hrs[0])) * 60);
    x.windDir = (x.windDir + (x.reg === "front" ? 1 : x.reg === "showery" ? 2 : W.rng.int(3) - 1) + 8) % 8;
  }
  const R = REG[x.reg], sun = sunAt(W.born + t * 60000);
  // cloud and rain: the regime's mean, broken up by smooth noise (showers pass, fronts arrive in bands)
  const n1 = vnoise(t / 55, 0, s + 901), n2 = vnoise(t / 17, 3, s + 902);
  const cloudT = clamp(R.cloud + (n1 - .5) * .5, 0, 1);
  const raining = R.wet > 0 && n1 * .7 + n2 * .3 > 1 - R.wet;
  const rainT = raining ? R.rain * (.4 + n2 * 1.2) * (1 + c.winter * .4) : 0;
  x.cloud = relax(x.cloud, raining ? Math.max(cloudT, .85) : cloudT, 1, 25);
  x.rain = relax(x.rain, rainT, 1, 6);
  if (x.rain < .02) x.rain = 0;
  // wind with gusts
  const windT = R.wind * (.7 + c.winter * .5) * (.7 + vnoise(t / 90, 5, s + 903) * .6);
  x.wind = relax(x.wind, windT, 1, 30);
  x.gust = x.wind * (1 + vnoise(t / 3, 7, s + 904) * .7);
  // temperature: the season, the hour (sunshine warms, clear nights chill), the air mass
  const hr = C.h + C.mi / 60, clear = 1 - x.cloud * .8;
  const diurnal = .5 * c.trange * clear * 1.4 * dcos(TAU * (hr - 15) / 24);
  x.temp = relax(x.temp, c.tmean + R.dt + diurnal - (x.rain > 0 ? 1 : 0), 1, 90);
  x.hum = relax(x.hum, clamp(R.hum + (x.rain > 0 ? .08 : 0) - (sun.elev > 0 ? .12 * clear * sun.elev : 0) + (sun.elev < .05 ? .2 * clear : 0), .4, 1), 1, 60);   // clear nights cool the air toward dew point
  // fog on calm, humid, cool mornings and evenings
  const fogT = x.wind < 4.2 && x.hum > .875 && sun.elev < .25 && x.rain < .2 ? clamp((x.hum - .875) * 20 * (1.25 - x.wind / 4.2), 0, 1) : 0;
  x.fog = relax(x.fog, fogT, 1, 40);
  x.sun = sun.rad * (1 - .75 * x.cloud * x.cloud * x.cloud) * (1 - x.fog * .6);   // sunshine reaching the ground (W/m2)
  x.elev = sun.elev;
  x.tide = tideAt(t);
}
export const WINDN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
