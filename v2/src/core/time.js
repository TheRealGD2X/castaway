// The real calendar, in Europe/London, without the host's time zone database (deterministic everywhere).
// Sim time t = whole minutes since the world was born (bornMs, a UTC timestamp).
const DAYMS = 86400000;
function ymd(ms) {                                    // UTC civil date from a timestamp (Howard Hinnant's algorithm)
  const z = Math.floor(ms / DAYMS) + 719468, era = Math.floor(z / 146097), doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100)), mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1, m = mp < 10 ? mp + 3 : mp - 9;
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}
function utcMs(y, m, d, h) {                          // inverse of ymd, plus hours
  y -= m <= 2 ? 1 : 0; const era = Math.floor(y / 400), yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1, doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return (era * 146097 + doe - 719468) * DAYMS + h * 3600000;
}
const lastSunday = (y, m) => { const last = utcMs(y, m + 1 > 12 ? 1 : m + 1, 1, 0) - DAYMS + (m === 12 ? 0 : 0); const t = m === 12 ? utcMs(y + 1, 1, 1, 0) - DAYMS : last; const wd = (Math.floor(t / DAYMS) + 4) % 7; return t - wd * DAYMS; };
// British Summer Time: from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October
export function ukOffsetMin(ms) {
  const { y } = ymd(ms);
  const a = lastSunday(y, 3) + 3600000, b = lastSunday(y, 10) + 3600000;
  return ms >= a && ms < b ? 60 : 0;
}
export const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// local calendar for sim minute t
export function cal(bornMs, t) {
  const ms = bornMs + t * 60000, loc = ms + ukOffsetMin(ms) * 60000, c = ymd(loc);
  const mod = Math.floor((loc % DAYMS + DAYMS) % DAYMS / 60000);
  const doy = Math.floor((utcMs(c.y, c.m, c.d, 0) - utcMs(c.y, 1, 1, 0)) / DAYMS);
  return { y: c.y, mo: c.m - 1, d: c.d, wd: WD[(Math.floor(loc / DAYMS) + 4) % 7 < 0 ? 0 : (Math.floor(loc / DAYMS) + 4) % 7], mod, h: Math.floor(mod / 60), mi: mod % 60, doy };
}
