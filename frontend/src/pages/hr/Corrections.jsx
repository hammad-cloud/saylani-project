import { useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, PageHeader, fmtDate, fmtTime, useApi } from '../../components/ui';
import ReviewDialog from '../../components/ReviewDialog';

export default function Corrections() {
  const { user } = useAuth();
  const canReview = user.role === 'hr';
  const [status, setStatus] = useState('pending');
  const state = useApi(`/attendance/corrections?status=${status}`);
  const [selected, setSelected] = useState(null);

  return (
    <>
      <PageHeader
        title="Attendance corrections"
        subtitle={canReview ? 'Approve or reject correction requests. Approval rewrites the day with the corrected times.' : 'View only: HR reviews corrections'}
        actions={
          <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="">All</option>
          </select>
        }
      />
      <div className="card overflow-x-auto">
        <Async state={state}>
          {(items) =>
            items.length === 0 ? (
              <EmptyState title="No correction requests" icon={ClipboardCheck} />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Date</th>
                    <th>Requested times</th>
                    <th className="hidden md:table-cell">Reason</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((c) => (
                    <tr key={c._id}>
                      <td>
                        {c.employee?.name} <span className="text-xs text-slate-400">{c.employee?.code}</span>
                      </td>
                      <td>{fmtDate(c.date)}</td>
                      <td>
                        {fmtTime(c.checkIn)} - {fmtTime(c.checkOut)}
                      </td>
                      <td className="hidden max-w-xs truncate md:table-cell" title={c.reason}>
                        {c.reason}
                      </td>
                      <td>
                        <Badge value={c.status} />
                        {c.comment && <p className="text-xs text-slate-400">{c.comment}</p>}
                      </td>
                      <td className="text-right">
                        {canReview && c.status === 'pending' && (
                          <button className="btn-primary btn-sm" onClick={() => setSelected(c)}>
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
      <ReviewDialog item={selected} url={`/attendance/corrections/${selected?._id}`} title="Review correction" onClose={() => setSelected(null)} onDone={state.reload}>
        {selected && (
          <>
            <p>
              <strong>{selected.employee?.name}</strong> · {fmtDate(selected.date)}
            </p>
            <p>
              Check-in {fmtTime(selected.checkIn)}, check-out {fmtTime(selected.checkOut)}
            </p>
            <p className="text-slate-500">"{selected.reason}"</p>
          </>
        )}
      </ReviewDialog>
    </>
  );
}
