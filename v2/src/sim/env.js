// Astronomical forcing and a numerical, moisture-bearing atmosphere.
import { dsin, dcos, PI, TAU } from "../core/dmath.js";
import { cal } from "../core/time.js";
import { atmosphereInit, atmosphereStep } from './atmosphere.js';

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
export function envInit(W) {
  const c = climateAt(cal(W.born, 0).doy);
  W.wx = { reg: "ridge", until: 18 * 60, temp: c.tmean, cloud: .4, rain: 0, wind: 5, windDir: 4, hum: .8, fog: 0, gust: 0 };
  atmosphereInit(W);
}
// one minute of weather
export function envStep(W) {
  atmosphereStep(W,climateAt(cal(W.born,W.t).doy),sunAt(W.born+W.t*60000));
  W.wx.tide=tideAt(W.t);
}
export const WINDN = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
