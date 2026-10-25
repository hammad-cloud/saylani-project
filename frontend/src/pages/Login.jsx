import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';
import { Field, PasswordInput, SubmitButton } from '../components/ui';

export default function Login() {
  const { user, login } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  // Fetch the dashboard code while the user types, so it opens instantly after sign-in.
  useEffect(() => {
    import('./Dashboard');
  }, []);

  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await login(form.email, form.password);
      navigate(u.mustChangePassword ? '/change-password' : '/');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Sign in" subtitle="Use the login your Admin or HR gave you.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email">
          <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} autoComplete="current-password" />
        </Field>
        <SubmitButton busy={busy} className="btn-primary w-full">
          Sign in
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
