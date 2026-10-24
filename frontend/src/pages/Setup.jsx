import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import AuthShell from '../components/AuthShell';
import { Field, PasswordInput, SubmitButton } from '../components/ui';

export default function Setup({ onDone }) {
  const [form, setForm] = useState({ companyName: '', adminName: '', adminEmail: '', adminPassword: '' });
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/setup', form);
      await login(form.adminEmail, form.adminPassword);
      toast.success('Company created. Welcome!');
      onDone();
      navigate('/settings');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Set up your company" subtitle="First run: create the company and the Admin account. You can change everything later.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Company name">
          <input className="input" required minLength={2} value={form.companyName} onChange={set('companyName')} placeholder="Acme Pvt Ltd" />
        </Field>
        <Field label="Admin name">
          <input className="input" required minLength={2} value={form.adminName} onChange={set('adminName')} autoComplete="name" />
        </Field>
        <Field label="Admin email">
          <input className="input" type="email" required value={form.adminEmail} onChange={set('adminEmail')} autoComplete="email" />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <PasswordInput required minLength={8} value={form.adminPassword} onChange={set('adminPassword')} autoComplete="new-password" />
        </Field>
        <SubmitButton busy={busy} className="btn-primary w-full">
          Create company &amp; Admin account
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
