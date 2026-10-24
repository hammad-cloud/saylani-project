import { useState } from 'react';
import { Check, Crosshair } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Field, PageHeader, SubmitButton, useApi } from '../../components/ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SettingsForm({ initial, canEdit, onSaved }) {
  const [form, setForm] = useState(() => ({
    companyName: initial.companyName,
    officeStart: initial.officeStart,
    graceMinutes: initial.graceMinutes,
    halfDayHours: initial.halfDayHours,
    weekend: initial.weekend,
    lat: initial.officeLocation?.lat ?? '',
    lng: initial.officeLocation?.lng ?? '',
    radiusMeters: initial.radiusMeters,
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleDay = (d) => setForm({ ...form, weekend: form.weekend.includes(d) ? form.weekend.filter((x) => x !== d) : [...form.weekend, d].sort() });

  const useMyLocation = () =>
    navigator.geolocation?.getCurrentPosition(
      (p) => setForm((f) => ({ ...f, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) })),
      () => toast.error('Could not read your location'),
      { enableHighAccuracy: true }
    );

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        companyName: form.companyName,
        officeStart: form.officeStart,
        graceMinutes: Number(form.graceMinutes),
        halfDayHours: Number(form.halfDayHours),
        weekend: form.weekend,
        radiusMeters: Number(form.radiusMeters),
        ...(form.lat !== '' && form.lng !== '' && { officeLocation: { lat: Number(form.lat), lng: Number(form.lng) } }),
      };
      const { data } = await api.put('/settings', body);
      toast.success('Settings saved. New rules apply to new records.');
      onSaved(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card space-y-6 p-5">
      <fieldset disabled={!canEdit} className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <h2 className="font-semibold sm:col-span-2">Company</h2>
          <Field label="Company name">
            <input className="input" required minLength={2} value={form.companyName} onChange={set('companyName')} />
          </Field>
        </section>
        <section className="grid gap-4 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Office hours</h2>
          <Field label="Office start">
            <input className="input" type="time" required value={form.officeStart} onChange={set('officeStart')} />
          </Field>
          <Field label="Grace time (minutes)" hint="Late after start + grace">
            <input className="input" type="number" min={0} max={240} required value={form.graceMinutes} onChange={set('graceMinutes')} />
          </Field>
          <Field label="Half day under (hours)">
            <input className="input" type="number" min={0} max={24} step={0.5} required value={form.halfDayHours} onChange={set('halfDayHours')} />
          </Field>
          <div className="sm:col-span-3">
            <span className="label">Weekend days</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((d, i) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => toggleDay(i)}
                  aria-pressed={form.weekend.includes(i)}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors ${
                    form.weekend.includes(i)
                      ? 'border-teal bg-teal-50 text-teal-700 dark:bg-teal/15 dark:text-teal'
                      : 'border-slate-300 text-ink hover:border-slate-400 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {form.weekend.includes(i) && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {d}
                </button>
              ))}
            </div>
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-3">
          <h2 className="font-semibold sm:col-span-3">Office location (camera check-in)</h2>
          <Field label="Latitude">
            <input className="input" type="number" step="any" min={-90} max={90} value={form.lat} onChange={set('lat')} />
          </Field>
          <Field label="Longitude">
            <input className="input" type="number" step="any" min={-180} max={180} value={form.lng} onChange={set('lng')} />
          </Field>
          <Field label="Radius (metres)">
            <input className="input" type="number" min={10} max={10000} required value={form.radiusMeters} onChange={set('radiusMeters')} />
          </Field>
          {canEdit && (
            <div className="sm:col-span-3">
              <button type="button" className="btn-secondary btn-sm" onClick={useMyLocation}>
                <Crosshair className="h-3.5 w-3.5" /> Use my current location
              </button>
            </div>
          )}
        </section>
      </fieldset>
      {canEdit ? (
        <SubmitButton busy={busy}>Save settings</SubmitButton>
      ) : (
        <p className="text-sm text-slate-500">Only Admin can change company settings.</p>
      )}
    </form>
  );
}

export default function CompanySettings() {
  const { user } = useAuth();
  const state = useApi('/settings');

  return (
    <>
      <PageHeader title="Company settings" subtitle="Office hours, attendance rules and office location. Changes apply to new records only." />
      <Async state={state}>{(s) => <SettingsForm key={s.updatedAt} initial={s} canEdit={user.role === 'admin'} onSaved={state.setData} />}</Async>
    </>
  );
}
