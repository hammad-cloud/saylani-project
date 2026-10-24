import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Async, Badge, fmtTime, useApi } from './ui';

// Same status families as the badges (ui.jsx); the legend below names each status in text.
const CELL = {
  present: 'bg-success/10 text-success dark:bg-success/20 dark:text-green-300',
  late: 'bg-warning/10 text-warning dark:bg-warning/20 dark:text-amber-300',
  half_day: 'bg-warning/15 text-warning dark:bg-warning/25 dark:text-amber-300',
  missing_checkout: 'bg-warning/15 text-warning dark:bg-warning/25 dark:text-amber-300',
  absent: 'bg-danger/10 text-danger dark:bg-danger/20 dark:text-red-300',
  on_leave: 'bg-brand-50 text-brand dark:bg-brand/25 dark:text-sky-300',
  holiday: 'bg-teal-50 text-teal-700 dark:bg-teal/15 dark:text-teal',
};
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Month calendar of day statuses computed on the server; employeeId is only sent by Admin/HR.
export default function AttendanceCalendar({ employeeId }) {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const state = useApi(`/attendance/calendar?year=${ym.year}&month=${ym.month}${employeeId ? `&employee=${employeeId}` : ''}`);

  const shift = (n) => {
    const d = new Date(ym.year, ym.month - 1 + n, 1);
    setYm({ year: d.getFullYear(), month: d.getMonth() + 1 });
  };
  const label = new Date(ym.year, ym.month - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button className="btn-secondary btn-sm" onClick={() => shift(-1)} aria-label="Previous month">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h3 className="font-semibold">{label}</h3>
        <button className="btn-secondary btn-sm" onClick={() => shift(1)} aria-label="Next month">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <Async state={state}>
        {(d) => (
          <>
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-400 uppercase">
              {WEEKDAYS.map((w) => (
                <div key={w}>{w}</div>
              ))}
            </div>
            <div className="mt-1 grid grid-cols-7 gap-1">
              {Array.from({ length: new Date(Date.UTC(ym.year, ym.month - 1, 1)).getUTCDay() }, (_, i) => (
                <div key={`pad${i}`} />
              ))}
              {d.days.map((day) => (
                <div
                  key={day.date}
                  title={`${day.date}: ${day.status.replace(/_/g, ' ')}${day.checkIn ? ` · ${fmtTime(day.checkIn)}-${fmtTime(day.checkOut)}` : ''}`}
                  className={`flex aspect-square flex-col items-center justify-center rounded-md text-xs sm:aspect-auto sm:h-14 ${CELL[day.status] || 'bg-slate-50 text-slate-400 dark:bg-slate-800/50'}`}
                >
                  <span className="font-semibold">{Number(day.date.slice(8))}</span>
                  {day.checkIn && <span className="hidden text-[10px] sm:block">{fmtTime(day.checkIn)}</span>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              {['present', 'late', 'half_day', 'missing_checkout', 'absent', 'on_leave'].map((k) => (
                <Badge key={k} value={k}>
                  {k.replace(/_/g, ' ')}: {d.summary[k]}
                </Badge>
              ))}
              <Badge value="hours">{d.summary.hours} h worked</Badge>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
