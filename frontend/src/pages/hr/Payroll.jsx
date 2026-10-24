import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, PageHeader, SubmitButton, money, useApi } from '../../components/ui';
import { periodLabel } from './EmployeeProfile';

export default function Payroll() {
  const { user } = useAuth();
  const isHr = user.role === 'hr';
  const state = useApi('/payroll/runs');
  const navigate = useNavigate();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [busy, setBusy] = useState(false);

  const generate = async (e) => {
    e.preventDefault();
    const [year, month] = period.split('-').map(Number);
    setBusy(true);
    try {
      const { data } = await api.post('/payroll/runs', { year, month });
      toast.success('Draft ready for review');
      navigate(`/payroll/${data._id}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle={isHr ? 'Prepare the monthly draft from attendance and leave; Admin finalizes it.' : 'Review drafts prepared by HR and finalize to lock the month.'}
        actions={
          isHr && (
            <form onSubmit={generate} className="flex items-end gap-2">
              <label>
                <span className="label">Month</span>
                <input type="month" className="input py-1.5" required value={period} onChange={(e) => setPeriod(e.target.value)} />
              </label>
              <SubmitButton busy={busy}>
                <Play className="h-4 w-4" /> Create / recompute draft
              </SubmitButton>
            </form>
          )
        }
      />
      <div className="card overflow-x-auto">
        <Async state={state}>
          {(runs) =>
            runs.length === 0 ? (
              <EmptyState title="No payroll runs yet" hint={isHr ? 'Pick a month and create the first draft.' : 'HR has not prepared a draft yet.'} icon={Wallet} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Status</th>
                    <th className="hidden sm:table-cell">Employees</th>
                    <th className="hidden md:table-cell">Gross</th>
                    <th className="hidden md:table-cell">Tax</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r._id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => navigate(`/payroll/${r._id}`)}>
                      <td className="font-medium text-brand">{periodLabel(r)}</td>
                      <td>
                        <Badge value={r.status} />
                      </td>
                      <td className="hidden sm:table-cell">{r.totals?.employees}</td>
                      <td className="hidden md:table-cell">{money(r.totals?.gross)}</td>
                      <td className="hidden md:table-cell">{money(r.totals?.tax)}</td>
                      <td className="font-semibold">{money(r.totals?.net)}</td>
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
