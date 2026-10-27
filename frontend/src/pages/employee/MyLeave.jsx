import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { Async, Badge, EmptyState, Field, PageHeader, Spinner, SubmitButton, fmtDate, todayKey, useApi } from '../../components/ui';

const EMPTY = { leaveType: '', start: '', end: '', reason: '' };

// Smart leave: the AI only fills the form; nothing is saved until the employee presses Apply.
function SmartLeave({ onFill }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/ai/smart-leave', { text });
      onFill(data);
    } catch (err) {
      setError(`${errorMessage(err).replace(/([^.!?])$/, '$1.')} You can fill the form below yourself.`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={run} className="card border-l-4 border-l-teal p-4">
      <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy dark:text-white">
        <Sparkles className="h-4 w-4" /> Smart leave
      </h3>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="input flex-1"
          required
          minLength={3}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Need next Monday and Tuesday off for my sister's wedding"
          aria-label="Describe your leave"
        />
        <button className="btn-ai" disabled={busy}>
          {busy ? <Spinner className="h-4 w-4 text-white" /> : <Sparkles className="h-4 w-4" />} Fill form
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function MyLeave() {
  const balances = useApi('/leaves/balance');
  const history = useApi('/leaves');
  const [form, setForm] = useState(EMPTY);
  const [aiInfo, setAiInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setAiInfo(null);
  };

  const reload = () => {
    balances.reload();
    history.reload();
  };

  const apply = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/leaves', { ...form, reason: form.reason || undefined, viaAi: Boolean(aiInfo) });
      toast.success('Leave request sent to HR');
      setForm(EMPTY);
      setAiInfo(null);
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (l) => {
    if (!window.confirm('Cancel this leave request?')) return;
    try {
      await api.post(`/leaves/${l._id}/cancel`);
      toast.success('Leave cancelled');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="My leave" subtitle="Working days only: weekends and public holidays are skipped" />
      <div className="space-y-4">
        <Async state={balances}>
          {(list) => (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {list.map((b) => (
                <div key={b.leaveType._id} className="card p-4">
                  <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{b.leaveType.name}</p>
                  <p className="mt-1 text-2xl font-bold text-brand">{b.remaining ?? '∞'}</p>
                  <p className="text-xs text-slate-500">{b.quota == null ? 'unlimited' : `left of ${b.quota} · ${b.used} used${b.pending ? ` · ${b.pending} pending` : ''}`}</p>
                </div>
              ))}
            </div>
          )}
        </Async>

        <SmartLeave
          onFill={(data) => {
            setForm({ leaveType: data.form.leaveType, start: data.form.start, end: data.form.end, reason: data.form.reason || '' });
            setAiInfo(data);
          }}
        />

        <form onSubmit={apply} className="card grid gap-4 p-4 sm:grid-cols-2">
          <h3 className="font-semibold sm:col-span-2">Apply for leave</h3>
          {aiInfo && (
            <p className="rounded-lg bg-ai-50 p-3 text-sm text-teal-700 sm:col-span-2 dark:bg-ai/15 dark:text-teal">
              <Sparkles className="mr-1 inline h-3.5 w-3.5" />
              AI-generated: {aiInfo.form.leaveTypeName} leave, {aiInfo.workingDays} working day(s){aiInfo.remaining != null && `, ${aiInfo.remaining} day(s) left`}. Check the details, then press Apply.
            </p>
          )}
          <Field label="Leave type">
            <select className="input" required value={form.leaveType} onChange={set('leaveType')}>
              <option value="">Choose...</option>
              {balances.data?.map((b) => (
                <option key={b.leaveType._id} value={b.leaveType._id}>
                  {b.leaveType.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reason (optional)">
            <input className="input" maxLength={300} value={form.reason} onChange={set('reason')} />
          </Field>
          <Field label="From">
            <input className="input" type="date" required min={todayKey()} value={form.start} onChange={set('start')} />
          </Field>
          <Field label="To">
            <input className="input" type="date" required min={form.start || todayKey()} value={form.end} onChange={set('end')} />
          </Field>
          <div className="sm:col-span-2">
            <SubmitButton busy={busy}>Apply</SubmitButton>
          </div>
        </form>

        <div className="card overflow-x-auto">
          <h3 className="p-4 pb-0 font-semibold">History</h3>
          <Async state={history}>
            {(items) =>
              items.length === 0 ? (
                <EmptyState title="No leave requests yet" />
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Dates</th>
                      <th>Days</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((l) => (
                      <tr key={l._id}>
                        <td>
                          {l.leaveType?.name}
                          {l.viaAi && <Sparkles className="ml-1 inline h-3 w-3 text-ai" aria-label="Filled by AI" />}
                        </td>
                        <td className="whitespace-nowrap">
                          {fmtDate(l.start)} - {fmtDate(l.end)}
                        </td>
                        <td>{l.days}</td>
                        <td>
                          <Badge value={l.status} />
                          {l.comment && <p className="text-xs text-slate-400">{l.comment}</p>}
                        </td>
                        <td className="text-right">
                          {(l.status === 'pending' || (l.status === 'approved' && l.start.slice(0, 10) > todayKey())) && (
                            <button className="btn-secondary btn-sm" onClick={() => cancel(l)}>
                              Cancel
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
      </div>
    </>
  );
}
