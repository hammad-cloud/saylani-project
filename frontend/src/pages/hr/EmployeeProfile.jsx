import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { downloadFile, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, Modal, PageHeader, StatCard, fmtDate, money, useApi } from '../../components/ui';
import EmployeeForm from '../../components/EmployeeForm';
import AttendanceCalendar from '../../components/AttendanceCalendar';

export const periodLabel = (p) => new Date(Date.UTC(p.year, p.month - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export const downloadPayslip = (p, code) =>
  downloadFile(`/payroll/payslips/${p._id}/pdf`, `payslip-${code || p.employee?.code}-${p.year}-${String(p.month).padStart(2, '0')}.pdf`).catch((err) => toast.error(errorMessage(err)));

// Employee 360: profile, this month's attendance, leave, payslips. Also used as "My profile" body.
export function Employee360({ data, actions }) {
  const { employee: e, attendanceThisMonth: a, leaveBalances, recentLeaves, payslips } = data;
  const gross = e.basicSalary * 1.5;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-start justify-between gap-4 p-5">
        <div>
          <h2 className="text-xl font-bold">{e.name}</h2>
          <p className="text-sm text-slate-500">
            {e.code} · {e.designation?.name || 'No designation'} · {e.department?.name}
          </p>
          <div className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
            <p>Email: {e.email}</p>
            <p>Phone: {e.phone || '-'}</p>
            <p>Joined: {fmtDate(e.joinDate)}</p>
            {e.exitDate && <p>Exited: {fmtDate(e.exitDate)}</p>}
            <p className="sm:col-span-2">Address: {e.address || '-'}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Badge value={e.status} />
          {actions}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Basic / gross" value={money(e.basicSalary)} hint={`gross ${money(gross)}`} tone="purple" />
        <StatCard label="Present this month" value={a.present + a.late + a.missing_checkout} hint={`${a.workingDays} working days so far`} />
        <StatCard label="Late this month" value={a.late} tone="orange" />
        <StatCard label="Absent this month" value={a.absent} tone="red" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">Leave balance</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Quota</th>
                <th>Used</th>
                <th>Pending</th>
                <th>Left</th>
              </tr>
            </thead>
            <tbody>
              {leaveBalances.map((b) => (
                <tr key={b.leaveType._id}>
                  <td>{b.leaveType.name}</td>
                  <td>{b.quota ?? '∞'}</td>
                  <td>{b.used}</td>
                  <td>{b.pending}</td>
                  <td className="font-semibold">{b.remaining ?? '∞'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 className="mt-5 mb-2 font-semibold">Recent leave</h3>
          {recentLeaves.length === 0 ? (
            <p className="text-sm text-slate-500">No leave requests yet.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {recentLeaves.map((l) => (
                <li key={l._id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {l.leaveType?.name} · {fmtDate(l.start)} to {fmtDate(l.end)} ({l.days}d)
                  </span>
                  <Badge value={l.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">Payslips</h3>
          {payslips.length === 0 ? (
            <p className="text-sm text-slate-500">No payslips yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {payslips.map((p) => (
                <li key={p._id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    {periodLabel(p)} · net <strong>{money(p.net)}</strong> {!p.finalized && <Badge value="draft" />}
                  </span>
                  <button className="btn-secondary btn-sm" onClick={() => downloadPayslip(p, e.code)}>
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EmployeeProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const state = useApi(`/employees/${id}`);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <PageHeader
        title="Employee 360"
        actions={
          <Link to="/employees" className="btn-secondary">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        }
      />
      <Async state={state}>
        {(d) => (
          <div className="space-y-4">
            <Employee360
              data={d}
              actions={
                user.role === 'hr' && String(d.employee._id) !== String(user.employee) && (
                  <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                )
              }
            />
            <AttendanceCalendar employeeId={id} />
            <Modal open={editing} onClose={() => setEditing(false)} title="Edit employee" wide>
              <EmployeeForm
                employee={d.employee}
                onSaved={() => {
                  setEditing(false);
                  state.reload();
                }}
              />
            </Modal>
          </div>
        )}
      </Async>
    </>
  );
}
