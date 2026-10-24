import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Field, SubmitButton, useApi } from './ui';

const EMPTY = { code: '', name: '', email: '', phone: '', address: '', gender: '', department: '', designation: '', joinDate: '', exitDate: '', status: 'active', basicSalary: '' };

// Register (POST) or edit (PUT) an employee. Registering also creates their login on the server.
export default function EmployeeForm({ employee, onSaved }) {
  const depts = useApi('/departments');
  const desigs = useApi('/designations');
  const [form, setForm] = useState(() =>
    employee
      ? {
          ...EMPTY,
          ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, employee[k] ?? ''])),
          department: employee.department?._id || employee.department || '',
          designation: employee.designation?._id || employee.designation || '',
          joinDate: employee.joinDate?.slice(0, 10) || '',
          exitDate: employee.exitDate?.slice(0, 10) || '',
        }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    // Empty optional fields are left out so the API's validation stays strict for real values.
    const body = Object.fromEntries(Object.entries({ ...form, basicSalary: Number(form.basicSalary) }).filter(([, v]) => v !== ''));
    try {
      const { data } = employee ? await api.put(`/employees/${employee._id}`, body) : await api.post('/employees', body);
      toast.success(employee ? 'Employee updated' : 'Employee registered');
      onSaved(data);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const noDepts = depts.data && depts.data.length === 0;
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {noDepts && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 sm:col-span-2 dark:bg-amber-900/30 dark:text-amber-200">Admin must add a department before employees can be registered.</p>}
      <Field label="Employee code">
        <input className="input" required maxLength={20} value={form.code} onChange={set('code')} placeholder="EMP001" />
      </Field>
      <Field label="Full name">
        <input className="input" required minLength={2} value={form.name} onChange={set('name')} />
      </Field>
      <Field label="Email" hint={employee ? undefined : 'Their login email'}>
        <input className="input" type="email" required value={form.email} onChange={set('email')} />
      </Field>
      <Field label="Phone">
        <input className="input" value={form.phone} onChange={set('phone')} maxLength={20} />
      </Field>
      <Field label="Department">
        <select className="input" required value={form.department} onChange={set('department')}>
          <option value="">Choose...</option>
          {depts.data?.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Designation">
        <select className="input" value={form.designation} onChange={set('designation')}>
          <option value="">None</option>
          {desigs.data?.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gender">
        <select className="input" value={form.gender} onChange={set('gender')}>
          <option value="">Not specified</option>
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Basic salary (PKR / month)" hint="Gross = 1.5 × basic">
        <input className="input" type="number" min={1} required value={form.basicSalary} onChange={set('basicSalary')} />
      </Field>
      <Field label="Join date">
        <input className="input" type="date" required value={form.joinDate} onChange={set('joinDate')} />
      </Field>
      <Field label="Status">
        <select className="input" value={form.status} onChange={set('status')}>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="exited">Exited</option>
        </select>
      </Field>
      {(employee || form.status === 'exited') && (
        <Field label="Exit date">
          <input className="input" type="date" value={form.exitDate} onChange={set('exitDate')} min={form.joinDate} />
        </Field>
      )}
      <Field label="Address">
        <input className="input" value={form.address} onChange={set('address')} maxLength={200} />
      </Field>
      <div className="sm:col-span-2">
        <SubmitButton busy={busy}>{employee ? 'Save changes' : 'Register employee'}</SubmitButton>
      </div>
    </form>
  );
}
