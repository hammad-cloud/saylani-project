import { Setting } from '../../models/Setting.js';
import { Holiday } from '../../models/Holiday.js';
import { ApiError } from '../../utils/ApiError.js';

export async function getSettings() {
  const settings = await Setting.findOne();
  if (!settings) throw new ApiError(409, 'Company setup not completed');
  return settings;
}

// Set of "YYYY-MM-DD" holiday keys in [start, end].
export async function getHolidayKeys(start, end) {
  const holidays = await Holiday.find({ date: { $gte: start, $lte: end } }, 'date');
  return new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));
}
