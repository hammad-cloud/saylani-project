import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, EmptyState, Field, Modal, PageHeader, SubmitButton, useApi } from '../../components/ui';
import { Employee360 } from '../hr/EmployeeProfile';

// Employees may edit only phone and address; everything else is HR's.
function ContactForm({ employee, onSaved }) {
  const [form, setForm] = useState({ phone: employee.phone || '', address: employee.address || '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch('/employees/me', form);
      toast.success('Profile updated');
      onSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Phone">
        <input className="input" maxLength={20} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
      </Field>
      <Field label="Address">
        <textarea className="input" rows={2} maxLength={200} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      </Field>
      <SubmitButton busy={busy}>Save</SubmitButton>
    </form>
  );
}

export default function MyProfile() {
  const { user } = useAuth();
  const state = useApi(user.employee ? '/employees/me' : null);
  const [editing, setEditing] = useState(false);

  return (
    <>
      <PageHeader title="My profile" />
      {!user.employee ? (
        <div className="card">
          <EmptyState title="No employee profile" hint="This login is not linked to an employee record." />
        </div>
      ) : (
        <Async state={state}>
          {(d) => (
            <>
              <Employee360
                data={d}
                actions={
                  ['hr', 'employee'].includes(user.role) && (
                    <button className="btn-secondary btn-sm" onClick={() => setEditing(true)}>
                      <Pencil className="h-3.5 w-3.5" /> Edit phone & address
                    </button>
                  )
                }
              />
              <Modal open={editing} onClose={() => setEditing(false)} title="Edit contact details">
                <ContactForm
                  employee={d.employee}
                  onSaved={() => {
                    setEditing(false);
                    state.reload();
                  }}
                />
              </Modal>
            </>
          )}
        </Async>
      )}
    </>
  );
}
