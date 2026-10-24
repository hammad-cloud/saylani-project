import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeStatus, distanceMeters } from '../src/modules/attendance/attendance.rules.js';
import { annualTax, computePayslip } from '../src/modules/payroll/payroll.rules.js';
import { countWorkingDays, dayFromKey } from '../src/utils/dates.js';

const settings = { officeStart: '09:00', graceMinutes: 15, halfDayHours: 5 };
// Times are PKT (UTC+5): 09:10 PKT = 04:10Z
const at = (hhmm) => new Date(`2026-10-26T${hhmm}:00+05:00`);

test('attendance status rules', () => {
  assert.equal(computeStatus({ checkIn: at('09:10'), checkOut: at('18:00') }, settings), 'present');
  assert.equal(computeStatus({ checkIn: at('09:15'), checkOut: at('18:00') }, settings), 'present');
  assert.equal(computeStatus({ checkIn: at('09:16'), checkOut: at('18:00') }, settings), 'late');
  assert.equal(computeStatus({ checkIn: at('09:00'), checkOut: at('13:59') }, settings), 'half_day');
  assert.equal(computeStatus({ checkIn: at('09:00') }, settings), 'missing_checkout');
  assert.equal(computeStatus({}, settings), 'absent');
});

test('haversine distance', () => {
  const office = { lat: 24.8607, lng: 67.0011 };
  assert.ok(distanceMeters(office, office) < 1);
  const d = distanceMeters(office, { lat: 24.8617, lng: 67.0011 }); // ~111 m north
  assert.ok(d > 105 && d < 117, `got ${d}`);
});

test('working days skip weekends and holidays', () => {
  // Oct 2026: 31 days, 9 weekend days (Sat/Sun) -> 22 working days
  const start = dayFromKey('2026-10-01');
  const end = dayFromKey('2026-10-31');
  assert.equal(countWorkingDays(start, end, [0, 6], new Set()), 22);
  assert.equal(countWorkingDays(start, end, [0, 6], new Set(['2026-10-26'])), 21);
});

test('tax slabs', () => {
  assert.equal(annualTax(600000), 0);
  assert.equal(annualTax(1200000), 30000);
  assert.equal(annualTax(2400000), 210000);
  assert.equal(annualTax(3600000), 510000);
  assert.equal(annualTax(4600000), 510000 + 350000);
  assert.equal(annualTax(900000), 15000);
});

test('payslip: full month, deductions, prorating', () => {
  const full = computePayslip({ basic: 100000, workingDays: 20, employedDays: 20 });
  assert.equal(full.gross, 150000);
  // gross × 12 = 1.8M -> 30k + 15% × 600k = 120k / yr -> 10k / month
  assert.equal(full.tax, 10000);
  assert.equal(full.net, 140000);

  const withDeductions = computePayslip({ basic: 100000, workingDays: 20, employedDays: 20, absentDays: 1, unpaidLeaveDays: 1, halfDays: 2 });
  assert.equal(withDeductions.attendanceDeduction, 7500 * 3);

  const joiner = computePayslip({ basic: 100000, workingDays: 20, employedDays: 10 });
  assert.equal(joiner.proratedGross, 75000);
  assert.equal(joiner.tax, 5000);
});
