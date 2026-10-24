import { useState } from 'react';
import { toast } from 'sonner';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Field, PageHeader, SubmitButton, useApi } from '../../components/ui';
import AnnouncementsFeed from '../../components/AnnouncementsFeed';

export default function Announcements() {
  const { user } = useAuth();
  const canPost = user.role !== 'employee';
  const state = useApi('/announcements');
  const [form, setForm] = useState({ title: '', body: '' });
  const [busy, setBusy] = useState(false);

  const post = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post('/announcements', form);
      toast.success('Announcement posted and everyone notified');
      setForm({ title: '', body: '' });
      state.reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Announcements" subtitle={canPost ? 'Post news for everyone; it shows on all dashboards' : 'Company news'} />
      <div className={`grid gap-4 ${canPost ? 'lg:grid-cols-2' : ''}`}>
        {canPost && (
          <form onSubmit={post} className="card h-fit space-y-4 p-4">
            <h3 className="font-semibold">New announcement</h3>
            <Field label="Title">
              <input className="input" required minLength={3} maxLength={120} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Message">
              <textarea className="input" rows={5} required minLength={3} maxLength={2000} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </Field>
            <SubmitButton busy={busy}>Post</SubmitButton>
          </form>
        )}
        <Async state={state}>{(items) => <AnnouncementsFeed items={items} />}</Async>
      </div>
    </>
  );
}
