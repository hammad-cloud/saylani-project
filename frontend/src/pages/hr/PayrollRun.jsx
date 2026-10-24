import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Download, Lock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, PageHeader, StatCard, money, useApi } from '../../components/ui';
import { downloadPayslip, periodLabel } from './EmployeeProfile';

export default function PayrollRun() {
  const { id } = useParams();
  const { user } = useAuth();
  const state = useApi(`/payroll/runs/${id}`);
  const [busy, setBusy] = useState(false);

  const act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const finalize = (run) => {
    if (!window.confirm(`Finalize ${periodLabel(run)}? The month is locked and employees can download payslips. This cannot be undone.`)) return;
    act(() => api.post(`/payroll/runs/${id}/finalize`), 'Payroll finalized and locked');
  };
  const recompute = (run) => act(() => api.post('/payroll/runs', { year: run.year, month: run.month }), 'Draft recomputed from latest attendance and leave');

  return (
    <Async state={state}>
      {({ run, payslips }) => (
        <>
          <PageHeader
            title={`Payroll · ${periodLabel(run)}`}
            subtitle={`${run.workingDays} working days · ${run.status === 'finalized' ? `finalized ${new Date(run.finalizedAt).toLocaleDateString()}, locked` : 'draft'}`}
            actions={
              <>
                <Link to="/payroll" className="btn-secondary">
                  <ArrowLeft className="h-4 w-4" /> Back
                </Link>
                {run.status === 'draft' && user.role === 'hr' && (
                  <button className="btn-secondary" disabled={busy} onClick={() => recompute(run)}>
                    <RefreshCw className="h-4 w-4" /> Recompute
                  </button>
                )}
                {run.status === 'draft' && user.role === 'admin' && (
                  <button className="btn-primary" disabled={busy} onClick={() => finalize(run)}>
                    <Lock className="h-4 w-4" /> Finalize
                  </button>
                )}
              </>
            }
          />
          <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Employees" value={run.totals.employees} tone="navy" />
            <StatCard label="Gross" value={money(run.totals.gross)} tone="purple" />
            <StatCard label="Deductions + tax" value={money(run.totals.deductions + run.totals.tax)} tone="red" />
            <StatCard label="Net" value={money(run.totals.net)} />
          </div>
          <div className="card overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th className="hidden lg:table-cell">Department</th>
                  <th className="hidden md:table-cell">Attendance</th>
                  <th className="hidden sm:table-cell">Gross</th>
                  <th className="hidden sm:table-cell">Deduction</th>
                  <th className="hidden sm:table-cell">Tax</th>
                  <th>Net</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {payslips.map((p) => (
                  <tr key={p._id}>
                    <td>
                      <p className="font-medium">{p.employee?.name}</p>
                      <p className="text-xs text-slate-500">{p.employee?.code}</p>
                    </td>
                    <td className="hidden lg:table-cell">{p.department?.name}</td>
                    <td className="hidden text-xs md:table-cell">
                      {p.attendance.employedDays}/{p.attendance.workingDays} days · {p.attendance.absent} absent · {p.attendance.unpaidLeave} unpaid · {p.attendance.halfDays} half
                      {p.attendance.latePenaltyDays > 0 && <Badge value="late">{p.attendance.latePenaltyDays}d late penalty</Badge>}
                    </td>
                    <td className="hidden sm:table-cell">{money(p.proratedGross)}</td>
                    <td className="hidden sm:table-cell">{money(p.attendanceDeduction)}</td>
                    <td className="hidden sm:table-cell">{money(p.tax)}</td>
                    <td className="font-semibold">{money(p.net)}</td>
                    <td>
                      <button className="btn-secondary btn-sm" onClick={() => downloadPayslip(p)} aria-label={`Download payslip for ${p.employee?.name}`}>
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Async>
  );
}
