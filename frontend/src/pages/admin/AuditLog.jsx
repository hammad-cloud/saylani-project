import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { Async, Badge, EmptyState, PageHeader, Pager, useApi } from '../../components/ui';

const ENTITIES = ['Employee', 'User', 'Leave', 'Attendance', 'AttendanceCorrection', 'PayrollRun', 'Setting', 'Department', 'Designation', 'LeaveType', 'Holiday', 'Announcement'];
const ACTIONS = ['create', 'update', 'delete', 'approve', 'reject', 'cancel', 'finalize', 'recompute', 'activate', 'deactivate', 'reset_password', 'enroll_face'];

function Json({ label, value }) {
  if (value == null) return null;
  return (
    <div className="min-w-0 flex-1">
      <p className="label">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-2 text-[11px] dark:bg-slate-800">{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

// Read-only: the API exposes no edit or delete, and the model refuses changes.
export default function AuditLog() {
  const [filter, setFilter] = useState({ entity: '', action: '', page: 1 });
  const state = useApi(`/audit-logs?${new URLSearchParams(filter)}`);
  const [open, setOpen] = useState(null);
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value, page: 1 });

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every important action with actor and before/after data. Entries cannot be changed or deleted." />
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-auto" value={filter.entity} onChange={set('entity')} aria-label="Entity">
          <option value="">All entities</option>
          {ENTITIES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
        <select className="input w-auto" value={filter.action} onChange={set('action')} aria-label="Action">
          <option value="">All actions</option>
          {ACTIONS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </div>
      <Async state={state}>
        {(d) =>
          d.items.length === 0 ? (
            <div className="card">
              <EmptyState title="No audit entries" icon={ScrollText} />
            </div>
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th>When</th>
                      <th>Actor</th>
                      <th>Action</th>
                      <th>Entity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((a) => (
                      <Fragment key={a._id}>
                        <tr className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setOpen(open === a._id ? null : a._id)}>
                          <td className="w-6">{open === a._id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                          <td className="whitespace-nowrap">{new Date(a.createdAt).toLocaleString()}</td>
                          <td>
                            {a.actor?.name || 'System'} <span className="text-xs text-slate-400">{a.actor?.role}</span>
                          </td>
                          <td>
                            <Badge value={a.action} />
                          </td>
                          <td>{a.entity}</td>
                        </tr>
                        {open === a._id && (
                          <tr>
                            <td colSpan={5}>
                              <div className="flex flex-col gap-3 md:flex-row">
                                <Json label="Before" value={a.before} />
                                <Json label="After" value={a.after} />
                                {a.before == null && a.after == null && <p className="text-sm text-slate-500">No data snapshot for this action.</p>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={d.page} pages={d.pages} onPage={(page) => setFilter({ ...filter, page })} />
            </>
          )
        }
      </Async>
    </>
  );
}

