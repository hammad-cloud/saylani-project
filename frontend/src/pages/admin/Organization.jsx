import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, Field, Modal, PageHeader, SubmitButton, fmtDate, useApi } from '../../components/ui';

// One config per org list (M2): Admin manages, HR views.
const SECTIONS = {
  departments: { title: 'Departments', url: '/departments', fields: [{ key: 'name', label: 'Name' }] },
  designations: { title: 'Designations', url: '/designations', fields: [{ key: 'name', label: 'Name' }] },
  leaveTypes: {
    title: 'Leave types',
    url: '/leave-types',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code', hint: 'Lowercase, e.g. casual, sick, annual, unpaid' },
      { key: 'yearlyQuota', label: 'Yearly quota (days)', type: 'number', hint: 'Leave empty for unlimited' },
      { key: 'paid', label: 'Paid leave', type: 'checkbox' },
    ],
    toBody: (f) => ({ ...f, yearlyQuota: f.yearlyQuota === '' || f.yearlyQuota == null ? null : Number(f.yearlyQuota), paid: Boolean(f.paid) }),
    render: (t) => (
      <>
        <span className="font-medium">{t.name}</span> <span className="text-xs text-slate-400">{t.code}</span>
        <span className="ml-auto flex gap-1">
          <Badge value="quota">{t.yearlyQuota == null ? 'unlimited' : `${t.yearlyQuota} days/yr`}</Badge>
          <Badge value={t.paid ? 'active' : 'rejected'}>{t.paid ? 'paid' : 'unpaid'}</Badge>
        </span>
      </>
    ),
  },
  holidays: {
    title: 'Public holidays',
    url: '/holidays',
    fields: [
      { key: 'name', label: 'Name' },
      { key: 'date', label: 'Date', type: 'date' },
    ],
    toForm: (h) => ({ name: h.name, date: h.date?.slice(0, 10) }),
    render: (h) => (
      <>
        <span className="font-medium">{h.name}</span>
        <span className="ml-auto text-sm text-slate-500">{fmtDate(h.date)}</span>
      </>
    ),
  },
};

function Section({ config, canEdit }) {
  const state = useApi(config.url);
  const [editing, setEditing] = useState(null); // {} for new, doc for edit
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);

  const open = (doc) => {
    setEditing(doc);
    setForm(doc._id ? (config.toForm ? config.toForm(doc) : Object.fromEntries(config.fields.map((f) => [f.key, doc[f.key] ?? '']))) : { paid: true });
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = config.toBody ? config.toBody(form) : form;
      if (editing._id) await api.put(`${config.url}/${editing._id}`, body);
      else await api.post(config.url, body);
      toast.success('Saved');
      setEditing(null);
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (doc) => {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      await api.delete(`${config.url}/${doc._id}`);
      toast.success('Deleted');
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">{config.title}</h2>
        {canEdit && (
          <button className="btn-primary btn-sm" onClick={() => open({})}>
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
      <Async state={state}>
        {(items) =>
          items.length === 0 ? (
            <EmptyState title={`No ${config.title.toLowerCase()} yet`} hint={canEdit ? 'Add the first one.' : 'Admin has not added any yet.'} />
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((doc) => (
                <li key={doc._id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  {config.render ? config.render(doc) : <span className="mr-auto font-medium">{doc.name}</span>}
                  {canEdit && (
                    <span className="flex gap-1">
                      <button className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => open(doc)} aria-label={`Edit ${doc.name}`}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button className="rounded p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30" onClick={() => remove(doc)} aria-label={`Delete ${doc.name}`}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )
        }
      </Async>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title={`${editing?._id ? 'Edit' : 'Add'} ${config.title.toLowerCase()}`}>
        <form onSubmit={save} className="space-y-4">
          {config.fields.map((f) =>
            f.type === 'checkbox' ? (
              <label key={f.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(form[f.key])} onChange={(e) => setForm({ ...form, [f.key]: e.target.checked })} /> {f.label}
              </label>
            ) : (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <input
                  className="input"
                  type={f.type || 'text'}
                  required={f.type !== 'number'}
                  min={f.type === 'number' ? 0 : undefined}
                  value={form[f.key] ?? ''}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
              </Field>
            )
          )}
          <SubmitButton busy={busy}>Save</SubmitButton>
        </form>
      </Modal>
    </div>
  );
}

export default function Organization() {
  const { user } = useAuth();
  const canEdit = user.role === 'admin';
  return (
    <>
      <PageHeader title="Organization" subtitle={canEdit ? 'Departments, designations, leave types and holidays' : 'View only: Admin manages these lists'} />
      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(SECTIONS).map(([key, config]) => (
          <Section key={key} config={config} canEdit={canEdit} />
        ))}
      </div>
    </>
  );
}
