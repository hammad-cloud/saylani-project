import { useState } from 'react';
import { KeyRound, Plus, Power } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, Field, Modal, PageHeader, SubmitButton, fmtDate, useApi } from '../../components/ui';
import TempPassword from '../../components/TempPassword';

export default function Users() {
  const { user: me } = useAuth();
  const [filter, setFilter] = useState({ role: '', search: '' });
  const state = useApi(`/users?${new URLSearchParams(filter)}`);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [temp, setTemp] = useState(null);

  const createHr = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/users/hr', form);
      setCreating(false);
      setForm({ name: '', email: '' });
      setTemp({ email: data.user.email, password: data.tempPassword });
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (u) => {
    try {
      await api.patch(`/users/${u._id}/status`, { isActive: !u.isActive });
      toast.success(u.isActive ? 'Login deactivated' : 'Login activated');
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const reset = async (u) => {
    if (!window.confirm(`Reset the password for ${u.email}?`)) return;
    try {
      const { data } = await api.post(`/users/${u._id}/reset-password`);
      setTemp({ email: data.user.email, password: data.tempPassword });
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title="Users & logins"
        subtitle="Create HR logins; deactivate or reset any login. Employee logins are created when HR registers an employee."
        actions={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> New HR login
          </button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name or email" value={filter.search} onChange={(e) => setFilter({ ...filter, search: e.target.value })} aria-label="Search users" />
        <select className="input w-auto" value={filter.role} onChange={(e) => setFilter({ ...filter, role: e.target.value })} aria-label="Role">
          <option value="">All roles</option>
          <option value="admin">Admin</option>
          <option value="hr">HR</option>
          <option value="employee">Employee</option>
        </select>
      </div>
      <div className="card overflow-x-auto">
        <Async state={state}>
          {(users) =>
            users.length === 0 ? (
              <EmptyState title="No users found" />
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="hidden md:table-cell">Created</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u._id}>
                      <td>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </td>
                      <td>
                        <Badge value={u.role}>{u.role === 'hr' ? 'HR' : u.role}</Badge>
                      </td>
                      <td>
                        <Badge value={u.isActive ? 'active' : 'inactive'} />
                        {u.mustChangePassword && <span className="ml-1 text-xs text-slate-400">temp password</span>}
                      </td>
                      <td className="hidden md:table-cell">{fmtDate(u.createdAt)}</td>
                      <td>
                        {u._id !== me._id && (
                          <div className="flex justify-end gap-1">
                            <button className="btn-secondary btn-sm" onClick={() => reset(u)}>
                              <KeyRound className="h-3.5 w-3.5" /> Reset
                            </button>
                            <button className={`btn-sm ${u.isActive ? 'btn-danger' : 'btn-primary'}`} onClick={() => toggle(u)}>
                              <Power className="h-3.5 w-3.5" /> {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
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
      <Modal open={creating} onClose={() => setCreating(false)} title="New HR login">
        <form onSubmit={createHr} className="space-y-4">
          <Field label="Name">
            <input className="input" required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Email">
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </Field>
          <SubmitButton busy={busy}>Create login</SubmitButton>
        </form>
      </Modal>
      <TempPassword value={temp} onClose={() => setTemp(null)} />
    </>
  );
}
