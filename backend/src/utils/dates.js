// All day-level dates are stored as UTC midnight of the calendar day ("YYYY-MM-DD"), so the
// same day compares equal everywhere. Office-time math uses the company's fixed UTC offset.
// shortcut: single fixed TZ offset (Pakistan, UTC+5, no DST), switch to a tz library if multi-region.
export const TZ_OFFSET_MIN = Number(process.env.TZ_OFFSET_MINUTES ?? 300);

export const toDayKey = (date) => new Date(date.getTime() + TZ_OFFSET_MIN * 60000).toISOString().slice(0, 10);
export const dayFromKey = (key) => new Date(`${key}T00:00:00.000Z`);
export const today = (now = new Date()) => dayFromKey(toDayKey(now));

// Minutes since local midnight for a real timestamp.
export const localMinutes = (date) => {
  const local = new Date(date.getTime() + TZ_OFFSET_MIN * 60000);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

export const parseHHmm = (s) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

export function* eachDay(start, end) {
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 86400000)) yield d;
}

export const isWorkingDay = (day, weekend, holidayKeys) =>
  !weekend.includes(day.getUTCDay()) && !holidayKeys.has(day.toISOString().slice(0, 10));

export const countWorkingDays = (start, end, weekend, holidayKeys) => {
  let n = 0;
  for (const d of eachDay(start, end)) if (isWorkingDay(d, weekend, holidayKeys)) n++;
  return n;
};

export const monthRange = (year, month) => ({
  start: new Date(Date.UTC(year, month - 1, 1)),
  end: new Date(Date.UTC(year, month, 0)),
});
