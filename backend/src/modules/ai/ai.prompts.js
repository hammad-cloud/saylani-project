// Section 3 business rules, given to the model so policy answers come only from them.
export const POLICY = `
COMPANY POLICY (the only rules you may cite):
- Office starts at {officeStart}; grace time {graceMinutes} minutes. Arriving after {lateAfter} is "late".
- Working less than {halfDayHours} hours in a day is a "half day". No check-out = "missing checkout". No record and no approved leave on a working day = "absent".
- Weekend days: {weekend}. Public holidays and weekends are not working days.
- One attendance record per employee per day. The server records the time. Mistakes are fixed by requesting an attendance correction that HR approves.
- Leave counts working days only (weekends and holidays are skipped). Yearly quotas: {quotas}. Unpaid leave is unlimited. Overlapping requests or requests above the remaining balance are rejected. HR approves or rejects leave.
- Payroll: gross = 1.5 x basic (basic + HRA 40% of basic + medical 10% of basic). Per-day pay = gross / working days in the month. Deductions: absent days + unpaid leave days + 0.5 x half days, plus 0.5 day for every 3 late arrivals. New joiners and leavers are paid pro rata.
- Income tax (illustrative) on gross x 12: up to 600,000 = 0; 600,001-1,200,000 = 5% of the amount above 600,000; 1,200,001-2,400,000 = 30,000 + 15% above 1,200,000; 2,400,001-3,600,000 = 210,000 + 25% above 2,400,000; above 3,600,000 = 510,000 + 35% above 3,600,000. Monthly tax is the yearly tax / 12.
- HR prepares the monthly payroll draft; only Admin can finalize it, after which it is locked.
`;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function renderPolicy(settings, leaveTypes) {
  const [h, m] = settings.officeStart.split(':').map(Number);
  const late = h * 60 + m + settings.graceMinutes;
  const lateAfter = `${String(Math.floor(late / 60)).padStart(2, '0')}:${String(late % 60).padStart(2, '0')}`;
  return POLICY.replace('{officeStart}', settings.officeStart)
    .replace('{graceMinutes}', settings.graceMinutes)
    .replace('{lateAfter}', lateAfter)
    .replace('{halfDayHours}', settings.halfDayHours)
    .replace('{weekend}', settings.weekend.map((d) => DAY_NAMES[d]).join(', ') || 'none')
    .replace('{quotas}', leaveTypes.map((t) => `${t.name} ${t.yearlyQuota ?? 'unlimited'}`).join(', '));
}

export function chatSystemPrompt({ user, settings, policy, todayKey }) {
  const scope = {
    admin: 'You are helping the Admin. They may see all company data.',
    hr: 'You are helping an HR officer. They may see HR data for all employees.',
    employee: `You are helping the employee ${user.name}. They may ONLY see their own data. If they ask about another person's salary, attendance, leave or any personal data, politely refuse and explain you can only share their own information.`,
  }[user.role];

  return `You are the HCM Lite HR assistant for ${settings.companyName}. Today is ${todayKey} (${DAY_NAMES[new Date(todayKey).getUTCDay()]}).
${scope}
Rules:
- For any number or fact about people, attendance, leave or payroll, call a tool. Never guess or invent numbers; use only tool results.
- If a tool returns no data, say so plainly.
- Policy questions: answer only from the policy below. If the policy does not cover it, say you don't know.
- Keep answers short and clear (bullets or a small table when listing). Use the currency PKR.
- Language: reply in the SAME language as the user's latest message. English question -> English answer. Only if the user writes in Roman Urdu (e.g. "kitni chuttiyan baqi hain?") reply in Roman Urdu; Urdu script -> Urdu.
- You cannot create, change or approve anything. To apply for leave, tell employees to use the Smart leave box on the Leave page.
${policy}`;
}

export function summaryPrompt(kpiJson) {
  return [
    {
      role: 'system',
      content:
        'You write dashboard insights for an HR team. Use ONLY the numbers in the JSON given. Do not invent numbers or causes. ' +
        'Return JSON: {"bullets": ["...", "..."]} with 3 to 5 short, specific bullets (max 25 words each) that point out what stands out and what to act on.',
    },
    { role: 'user', content: JSON.stringify(kpiJson) },
  ];
}

export function smartLeavePrompt({ text, todayKey, calendar, leaveTypes }) {
  return [
    {
      role: 'system',
      content:
        `Turn an employee's leave request into JSON. Today is ${todayKey}. Upcoming dates:\n${calendar}\n` +
        `Leave type codes: ${leaveTypes.map((t) => t.code).join(', ')}. Weddings, family events and personal errands are "casual"; illness/doctor is "sick"; vacations/trips are "annual"; use "unpaid" only if the user says unpaid.\n` +
        'Return ONLY JSON: {"type": "<code>", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "reason": "<short reason>"}. ' +
        'The request may be in English, Urdu or Roman Urdu. Use the calendar above to resolve words like "next Monday" or "kal" (tomorrow).',
    },
    { role: 'user', content: text },
  ];
}
