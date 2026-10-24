import { useState } from 'react';
import { Inbox, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, PageHeader, fmtDate, useApi } from '../../components/ui';
import ReviewDialog from '../../components/ReviewDialog';

export default function LeaveApprovals() {
  const { user } = useAuth();
  const canReview = user.role === 'hr';
  const [status, setStatus] = useState('pending');
  const state = useApi(`/leaves?status=${status}`);
  const [selected, setSelected] = useState(null);

  return (
    <>
      <PageHeader
        title={canReview ? 'Leave approvals' : 'Leave requests'}
        subtitle={canReview ? 'Approve or reject with a comment. Balances and overlaps are re-checked on approval.' : 'View only: HR approves leave'}
        actions={
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="cancelled">Cancelled</option>
            <option value="">All</option>
          </select>
        }
      />
      <div className="card overflow-x-auto">
        <Async state={state}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState title="Inbox is empty" hint="New requests appear here." icon={Inbox} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Days</th>
                    <th className="hidden md:table-cell">Reason</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((l) => (
                    <tr key={l._id}>
                      <td>
                        <p className="font-medium">{l.employee?.name}</p>
                        <p className="text-xs text-slate-500">{l.employee?.department?.name}</p>
                      </td>
                      <td>
                        {l.leaveType?.name}
                        {l.viaAi && <Sparkles className="ml-1 inline h-3 w-3 text-ai" aria-label="Filled by AI" />}
                      </td>
                      <td className="whitespace-nowrap">
                        {fmtDate(l.start)} - {fmtDate(l.end)}
                      </td>
                      <td>{l.days}</td>
                      <td className="hidden max-w-xs truncate md:table-cell" title={l.reason}>
                        {l.reason || '-'}
                      </td>
                      <td>
                        <Badge value={l.status} />
                        {l.comment && <p className="text-xs text-slate-400">{l.comment}</p>}
                      </td>
                      <td className="text-right">
                        {canReview && l.status === 'pending' && String(l.employee?._id) !== String(user.employee) && (
                          <button className="btn-primary btn-sm" onClick={() => setSelected(l)}>
                            Review
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </Async>
      </div>
      <ReviewDialog item={selected} url={`/leaves/${selected?._id}`} title="Review leave request" onClose={() => setSelected(null)} onDone={state.reload}>
        {selected && (
          <>
            <p>
              <strong>{selected.employee?.name}</strong> requests {selected.days} working day(s) of <strong>{selected.leaveType?.name}</strong> leave
            </p>
            <p>
              {fmtDate(selected.start)} to {fmtDate(selected.end)}
            </p>
            {selected.reason && <p className="text-slate-500">"{selected.reason}"</p>}
          </>
        )}
      </ReviewDialog>
    </>
  );
}
