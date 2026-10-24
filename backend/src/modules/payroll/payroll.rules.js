// Illustrative annual tax slabs from the brief: [upTo, base, rate] on the part above the previous limit.
const SLABS = [
  [600000, 0, 0],
  [1200000, 0, 0.05],
  [2400000, 30000, 0.15],
  [3600000, 210000, 0.25],
  [Infinity, 510000, 0.35],
];

export function annualTax(annualIncome) {
  let lower = 0;
  for (const [upTo, base, rate] of SLABS) {
    if (annualIncome <= upTo) return base + (annualIncome - lower) * rate;
    lower = upTo;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * One employee's monthly pay (M6).
 * workingDays: company working days in the month; employedDays: of those, days the employee was employed (prorating).
 */
export function computePayslip({ basic, workingDays, employedDays, absentDays = 0, unpaidLeaveDays = 0, halfDays = 0, latePenaltyDays = 0 }) {
  const hra = basic * 0.4;
  const medical = basic * 0.1;
  const gross = basic + hra + medical; // = 1.5 × basic
  const perDay = workingDays ? gross / workingDays : 0;

  const proratedGross = perDay * employedDays;
  const deductionDays = absentDays + unpaidLeaveDays + 0.5 * halfDays + latePenaltyDays;
  const attendanceDeduction = Math.min(proratedGross, perDay * deductionDays);
  // Brief: slab on gross × 12; prorated for joiners/leavers like the gross itself.
  const tax = workingDays ? (annualTax(gross * 12) / 12) * (employedDays / workingDays) : 0;
  const net = Math.max(0, proratedGross - attendanceDeduction - tax);

  return {
    basic: round2(basic),
    hra: round2(hra),
    medical: round2(medical),
    gross: round2(gross),
    perDay: round2(perDay),
    proratedGross: round2(proratedGross),
    deductionDays,
    attendanceDeduction: round2(attendanceDeduction),
    tax: round2(tax),
    net: round2(net),
  };
}
