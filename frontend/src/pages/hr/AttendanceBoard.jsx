import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck } from 'lucide-react';
import { Async, Badge, EmptyState, PageHeader, fmtTime, todayKey, useApi } from '../../components/ui';

export default function AttendanceBoard() {
  const [filter, setFilter] = useState({ date: todayKey(), department: '' });
  const state = useApi(`/attendance/board?${new URLSearchParams(filter)}`);
  const depts = useApi('/departments');
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value });

  return (
    <>
      <PageHeader
        title="Daily attendance board"
        subtitle="Every current employee's status for the day, computed on the server"
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <label>
              <span className="label">Date</span>
              <input type="date" className="input py-1.5" value={filter.date} max={todayKey()} onChange={set('date')} />
            </label>
            <label>
              <span className="label">Department</span>
              <select className="input py-1.5" value={filter.department} onChange={set('department')}>
                <option value="">All departments</option>
                {depts.data?.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        }
      />
      <Async state={state}>
        {(d) => (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {Object.entries(d.counts).map(([status, n]) => (
                <Badge key={status} value={status}>
                  {status.replace(/_/g, ' ')}: {n}
                </Badge>
              ))}
            </div>
            <div className="card overflow-x-auto">
              {d.rows.length === 0 ? (
                <EmptyState title="No employees for this day" icon={CalendarCheck} />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th className="hidden sm:table-cell">Department</th>
                      <th>Status</th>
                      <th>In</th>
                      <th>Out</th>
                      <th className="hidden md:table-cell">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.rows.map((r) => (
                      <tr key={r.employee._id}>
                        <td>
                          <Link to={`/employees/${r.employee._id}`} className="font-medium hover:text-brand">
                            {r.employee.name}
                          </Link>
                          <p className="text-xs text-slate-500">{r.employee.code}</p>
                        </td>
                        <td className="hidden sm:table-cell">{r.employee.department}</td>
                        <td>
                          <Badge value={r.status} />
                          {r.leaveType && <span className="ml-1 text-xs text-slate-400">{r.leaveType}</span>}
                        </td>
                        <td>{fmtTime(r.checkIn)}</td>
                        <td>{fmtTime(r.checkOut)}</td>
                        <td className="hidden md:table-cell">{r.source || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </Async>
    </>
  );
}
