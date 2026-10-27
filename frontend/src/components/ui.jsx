import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Eye, EyeOff, Inbox, Loader2, X } from 'lucide-react';
import { api, errorMessage } from '../api/client';

// GET with loading / error / reload: keeps every page's loading, empty and error states consistent.
export function useApi(url, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.get(url);
      setData(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, error, reload: load, setData };
}

export const Spinner = ({ className = 'h-5 w-5' }) => <Loader2 className={`animate-spin text-brand dark:text-sky-300 ${className}`} aria-label="Loading" />;

export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center" role="status">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="card flex flex-col items-center gap-3 p-8 text-center" role="alert">
      <AlertTriangle className="h-8 w-8 text-danger" />
      <p className="text-sm text-slate-600 dark:text-slate-400">{message}</p>
      {onRetry && (
        <button className="btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, icon: Icon = Inbox, action }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="h-9 w-9 text-slate-300 dark:text-slate-600" />
      <p className="font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {hint && <p className="max-w-sm text-sm text-slate-500">{hint}</p>}
      {action}
    </div>
  );
}

// Renders loading / error / content for a useApi result.
// Placeholder blocks shaped like a page (stat row + panel) while data loads.
export function Skeleton() {
  const block = 'animate-shimmer rounded-xl bg-slate-200/70 dark:bg-slate-800';
  return (
    <div className="space-y-4" role="status" aria-label="Loading">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`h-24 ${block}`} />
        ))}
      </div>
      <div className={`h-64 ${block}`} />
    </div>
  );
}

export function Async({ state, children }) {
  if (state.loading && !state.data) return <Skeleton />;
  if (state.error) return <ErrorState message={state.error} onRetry={state.reload} />;
  if (!state.data) return null;
  return children(state.data);
}

export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-navy dark:text-white">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

// Icon badge colour per tone; the value itself stays dark so numbers read first.
const TONES = {
  teal: 'bg-teal-50 text-teal-700 dark:bg-teal/15 dark:text-teal',
  orange: 'bg-warning/10 text-warning dark:bg-warning/20',
  purple: 'bg-brand-50 text-brand dark:bg-brand/25 dark:text-sky-300',
  navy: 'bg-navy/[0.07] text-navy dark:bg-white/10 dark:text-white',
  red: 'bg-danger/10 text-danger dark:bg-danger/20 dark:text-red-300',
};

export function StatCard({ label, value, hint, tone = 'teal', icon: Icon }) {
  return (
    <div className="card flex items-start gap-3 p-4 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(20,43,74,0.08)]">
      {Icon && (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
          <Icon className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-xs leading-snug font-semibold tracking-wide text-muted uppercase">{label}</p>
        <p className="mt-1 text-2xl font-bold text-navy tabular-nums dark:text-white">{value ?? '-'}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

// Status badges always show their text, so colour is never the only signal.
const OK = 'bg-success/10 text-success ring-success/20 dark:bg-success/20 dark:text-green-300';
const WARN = 'bg-warning/10 text-warning ring-warning/25 dark:bg-warning/20 dark:text-amber-300';
const BAD = 'bg-danger/10 text-danger ring-danger/20 dark:bg-danger/20 dark:text-red-300';
const INFO = 'bg-brand-50 text-brand ring-brand/15 dark:bg-brand/25 dark:text-sky-300';
const BADGE = {
  present: OK,
  approved: OK,
  active: OK,
  finalized: OK,
  late: WARN,
  pending: WARN,
  probation: WARN,
  draft: WARN,
  half_day: WARN,
  missing_checkout: WARN,
  medium: WARN,
  absent: BAD,
  rejected: BAD,
  exited: BAD,
  inactive: BAD,
  high: BAD,
  on_leave: INFO,
};

export function Badge({ value, children }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap capitalize ring-1 ring-inset ${BADGE[value] || 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'}`}>
      {children || String(value).replace(/_/g, ' ')}
    </span>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  // Portalled to <body>: the page wrapper's enter animation uses a transform, which would otherwise
  // trap this "fixed" overlay inside the page box (cut off on short pages and small screens).
  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card max-h-[92vh] w-full animate-pop overflow-y-auto rounded-b-none p-5 sm:rounded-xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function SubmitButton({ busy, children, className = 'btn-primary' }) {
  return (
    <button type="submit" className={className} disabled={busy}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export const money = (n) => `PKR ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '-');
export const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '-');
export const todayKey = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const monthStartKey = () => `${todayKey().slice(0, 8)}01`;

export function Pager({ page, pages, onPage }) {
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-center gap-3 text-sm">
      <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

// Password field with a show/hide toggle; extra props go to the <input>.
export function PasswordInput(props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className="input pr-10" />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}
