import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { api, errorMessage } from '../api/client';
import { Field, Modal } from './ui';

// Mirrors the server rule: never your own request; HR reviews everyone, Admin only HR staff.
export const canReview = (user, requester) =>
  String(requester?._id) !== String(user.employee) && (user.role === 'hr' || (user.role === 'admin' && requester?.user?.role === 'hr'));

// Approve / reject with an optional comment; shared by leave and attendance-correction inboxes.
export default function ReviewDialog({ item, url, title, children, onClose, onDone }) {
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);

  const review = async (approve) => {
    setBusy(true);
    try {
      await api.patch(url, { approve, ...(comment.trim() && { comment: comment.trim() }) });
      toast.success(approve ? 'Approved' : 'Rejected');
      setComment('');
      onDone();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(item)} onClose={onClose} title={title}>
      {item && (
        <div className="space-y-4">
          <div className="space-y-1 text-sm">{children}</div>
          <Field label="Comment (optional)">
            <textarea className="input" rows={2} maxLength={300} value={comment} onChange={(e) => setComment(e.target.value)} />
          </Field>
          <div className="flex gap-2">
            <button className="btn-primary flex-1" disabled={busy} onClick={() => review(true)}>
              <Check className="h-4 w-4" /> Approve
            </button>
            <button className="btn-danger flex-1" disabled={busy} onClick={() => review(false)}>
              <X className="h-4 w-4" /> Reject
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
