import { localMinutes, parseHHmm } from '../../utils/dates.js';

export const isLate = (checkIn, settings) => localMinutes(checkIn) > parseHHmm(settings.officeStart) + settings.graceMinutes;

// Final status of a day's record from check-in/out times and the company rules (M4).
export function computeStatus({ checkIn, checkOut }, settings) {
  if (!checkIn) return 'absent';
  if (!checkOut) return 'missing_checkout';
  if ((checkOut - checkIn) / 3600000 < settings.halfDayHours) return 'half_day';
  return isLate(checkIn, settings) ? 'late' : 'present';
}

// Euclidean distance between two face descriptors (face-api.js: < 0.5 is usually the same person).
export const FACE_MATCH_THRESHOLD = 0.5;
export const faceDistance = (a, b) => Math.sqrt(a.reduce((sum, v, i) => sum + (v - b[i]) ** 2, 0));

// Earth-surface distance in metres (Haversine) for the camera check-in geofence.
export function distanceMeters(a, b) {
  const R = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
