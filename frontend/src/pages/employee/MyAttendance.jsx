import { useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { Async, Badge, Field, Modal, PageHeader, SubmitButton, fmtDate, fmtTime, todayKey, useApi } from '../../components/ui';
import CheckInWidget from '../../components/CheckInWidget';
import AttendanceCalendar from '../../components/AttendanceCalendar';

function CorrectionForm({ onDone }) {
  const [form, setForm] = useState({ date: todayKey(), checkIn: '09:00', checkOut: '17:00', reason: '' });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Local wall-clock times on the corrected date, sent as instants.
      const at = (t) => new Date(`${form.date}T${t}`).toISOString();
      await api.post('/attendance/corrections', { date: form.date, checkIn: at(form.checkIn), checkOut: at(form.checkOut), reason: form.reason });
      toast.success('Correction requested. HR will review it.');
      onDone();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-3">
      <Field label="Date">
        <input className="input" type="date" required max={todayKey()} value={form.date} onChange={set('date')} />
      </Field>
      <Field label="Check-in">
        <input className="input" type="time" required value={form.checkIn} onChange={set('checkIn')} />
      </Field>
      <Field label="Check-out">
        <input className="input" type="time" required value={form.checkOut} onChange={set('checkOut')} />
      </Field>
      <div className="sm:col-span-3">
        <Field label="Reason">
          <textarea className="input" rows={2} required minLength={5} maxLength={300} value={form.reason} onChange={set('reason')} placeholder="e.g. Forgot to check out, was in a client meeting" />
        </Field>
      </div>
      <div className="sm:col-span-3">
        <SubmitButton busy={busy}>Send request</SubmitButton>
      </div>
    </form>
  );
}

export default function MyAttendance() {
  const corrections = useApi('/attendance/corrections');
  const [open, setOpen] = useState(false);
  const [calendarKey, setCalendarKey] = useState(0);

  return (
    <>
      <PageHeader
        title="My attendance"
        subtitle="Check in and out, see your month, and request corrections"
        actions={
          <button className="btn-secondary" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Request correction
          </button>
        }
      />
      <div className="space-y-4">
        <CheckInWidget onChange={() => setCalendarKey((k) => k + 1)} />
        <AttendanceCalendar key={calendarKey} />
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">My correction requests</h3>
          <Async state={corrections}>
            {(items) =>
              items.length === 0 ? (
                <p className="text-sm text-slate-500">No correction requests.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {items.map((c) => (
                    <li key={c._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        {fmtDate(c.date)} · {fmtTime(c.checkIn)} - {fmtTime(c.checkOut)} <span className="text-slate-500">"{c.reason}"</span>
                      </span>
                      <span className="text-right">
                        <Badge value={c.status} />
                        {c.comment && <span className="block text-xs text-slate-400">{c.comment}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )
            }
          </Async>
        </div>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title="Request attendance correction">
        <CorrectionForm
          onDone={() => {
            setOpen(false);
            corrections.reload();
          }}
        />
      </Modal>
    </>
  );
}
