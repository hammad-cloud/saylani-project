import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from './ui';

// Shown once after a login is created or reset; the server never returns it again.
export default function TempPassword({ value, onClose }) {
  const copy = () => navigator.clipboard?.writeText(`Email: ${value.email}\nTemporary password: ${value.password}`).then(() => toast.success('Copied'));
  return (
    <Modal open={Boolean(value)} onClose={onClose} title="Login created">
      {value && (
        <div className="space-y-3 text-sm">
          <p>Share these details with the user. They must change the password at first sign-in.</p>
          <div className="rounded-lg bg-slate-100 p-3 font-mono dark:bg-slate-800">
            <p>Email: {value.email}</p>
            <p>Temporary password: {value.password}</p>
          </div>
          <p className="text-xs text-slate-500">This password will not be shown again.</p>
          <button className="btn-secondary btn-sm" onClick={copy}>
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
      )}
    </Modal>
  );
}
