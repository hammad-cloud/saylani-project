import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';
import { Field, PageLoader, PasswordInput, SubmitButton } from '../components/ui';

export default function ChangePassword() {
  const { user, setUser, loading, logout } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  const forced = user.mustChangePassword;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword !== form.confirm) return toast.error('New passwords do not match');
    setBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setUser(data.user);
      toast.success('Password changed');
      navigate('/');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title={forced ? 'Choose your password' : 'Change password'}
      subtitle={forced ? `Welcome, ${user.name}. You signed in with a temporary password; please set your own to continue.` : 'Enter your current password and a new one.'}
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label={forced ? 'Temporary password' : 'Current password'}>
          <PasswordInput required value={form.currentPassword} onChange={set('currentPassword')} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters">
          <PasswordInput required minLength={8} value={form.newPassword} onChange={set('newPassword')} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password">
          <PasswordInput required minLength={8} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
        </Field>
        <SubmitButton busy={busy} className="btn-primary w-full">
          Save password
        </SubmitButton>
        <button type="button" className="btn-secondary w-full" onClick={forced ? logout : () => navigate(-1)}>
          {forced ? 'Log out' : 'Cancel'}
        </button>
      </form>
    </AuthShell>
  );
}
