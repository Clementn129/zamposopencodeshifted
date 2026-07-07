// Day boundaries in Africa/Lusaka (UTC+2, no DST) regardless of the
// device's timezone. Returns ISO timestamps suitable for Postgres timestamptz
// comparisons, plus a YYYY-MM-DD label for date columns.

const LUSAKA_OFFSET_MS = 2 * 60 * 60 * 1000; // +02:00, no DST

function lusakaParts(d: Date) {
  // Shift into Lusaka local clock so .getUTC* returns Lusaka components.
  const shifted = new Date(d.getTime() + LUSAKA_OFFSET_MS);
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth(),
    d: shifted.getUTCDate(),
  };
}

function lusakaMidnightUTC(y: number, m: number, d: number) {
  // Midnight Lusaka = previous UTC day at 22:00.
  return new Date(Date.UTC(y, m, d) - LUSAKA_OFFSET_MS);
}

export function lusakaDayRange(reference: Date = new Date()) {
  const { y, m, d } = lusakaParts(reference);
  const from = lusakaMidnightUTC(y, m, d);
  const to = new Date(lusakaMidnightUTC(y, m, d + 1).getTime() - 1);
  return { from, to };
}

export function lusakaWeekRange(reference: Date = new Date()) {
  const { y, m, d } = lusakaParts(reference);
  // Week starts Monday. JS getUTCDay: 0=Sun..6=Sat
  const ref = new Date(Date.UTC(y, m, d));
  const dow = (ref.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const from = lusakaMidnightUTC(y, m, d - dow);
  const to = new Date(lusakaMidnightUTC(y, m, d + 1).getTime() - 1);
  return { from, to };
}

export function lusakaMonthRange(reference: Date = new Date()) {
  const { y, m, d } = lusakaParts(reference);
  const from = lusakaMidnightUTC(y, m, 1);
  const to = new Date(lusakaMidnightUTC(y, m + 1, 1).getTime() - 1);
  return { from, to, day: d };
}

export function lusakaDateLabel(d: Date) {
  const p = lusakaParts(d);
  return `${p.y}-${String(p.m + 1).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}
