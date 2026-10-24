import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, PageHeader, money, useApi } from '../../components/ui';
import { downloadPayslip, periodLabel } from '../hr/EmployeeProfile';

// Employees see only their own finalized payslips (enforced on the server); Admin/HR see all.
export default function Payslips() {
  const { user } = useAuth();
  const own = user.role === 'employee';
  const [mine, setMine] = useState(own);
  const [year, setYear] = useState('');
  const state = useApi(`/payroll/payslips?${new URLSearchParams({ ...(year && { year }), ...(mine && !own && { employee: user.employee }) })}`);

  return (
    <>
      <PageHeader
        title={own || mine ? 'My payslips' : 'Payslips'}
        subtitle="Download any payslip as PDF"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!own && user.employee && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Only mine
              </label>
            )}
            <input className="input w-28" type="number" min={2000} max={2100} placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year" />
          </div>
        }
      />
      <div className="card overflow-x-auto">
        <Async state={state}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState title="No payslips yet" hint={own ? 'Payslips appear here once Admin finalizes the month.' : undefined} icon={FileText} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    {!own && <th>Employee</th>}
                    <th className="hidden sm:table-cell">Gross</th>
                    <th className="hidden sm:table-cell">Deductions + tax</th>
                    <th>Net</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((p) => (
                    <tr key={p._id}>
                      <td className="font-medium">
                        {periodLabel(p)} {!p.finalized && <Badge value="draft" />}
                      </td>
                      {!own && (
                        <td>
                          {p.employee?.name} <span className="text-xs text-slate-400">{p.employee?.code}</span>
                        </td>
                      )}
                      <td className="hidden sm:table-cell">{money(p.proratedGross)}</td>
                      <td className="hidden sm:table-cell">{money(p.attendanceDeduction + p.tax)}</td>
                      <td className="font-semibold">{money(p.net)}</td>
                      <td className="text-right">
                        <button className="btn-secondary btn-sm" onClick={() => downloadPayslip(p)}>
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Async>
      </div>
    </>
  );
}
