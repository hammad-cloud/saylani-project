import { ShieldCheck, Users, UserRound } from 'lucide-react';

// Who the product serves; descriptive only (setup always creates the Admin, logins decide the role).
const ROLES = [
  { icon: ShieldCheck, name: 'Admin', text: 'Company setup, logins, payroll sign-off, audit log' },
  { icon: Users, name: 'HR', text: 'Employees, attendance, leave approvals, payroll drafts' },
  { icon: UserRound, name: 'Employee', text: 'Check-in, leave, payslips, personal dashboard' },
];

// Split-screen frame for setup / login / change-password.
export default function AuthShell({ title, subtitle, children }) {
  return (
    <div className="grid min-h-screen bg-page lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] dark:bg-slate-950">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-navy via-navy to-brand p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        {/* Subtle grid texture instead of large colour shapes */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }}
          aria-hidden="true"
        />
        <div className="relative flex items-center gap-3">
          <img src="/icon.svg" alt="" className="h-10 w-10 rounded-lg ring-1 ring-white/20" />
          <div>
            <p className="text-lg leading-tight font-bold">HCM Lite</p>
            <p className="text-xs text-slate-300">Human Capital Management</p>
          </div>
        </div>

        <div className="relative max-w-lg animate-page">
          <span className="mb-5 block h-1 w-12 rounded-full bg-teal" aria-hidden="true" />
          <h2 className="text-4xl leading-[1.15] font-bold xl:text-[2.75rem]">People operations, with an assistant built in.</h2>
          <p className="mt-5 text-base leading-relaxed text-slate-300">
            Attendance, leave, payroll and analytics in one place. Every number comes from what your team records in the app.
          </p>
          <ul className="mt-10 space-y-3" aria-label="Who uses HCM Lite">
            {ROLES.map(({ icon: Icon, name, text }) => (
              <li key={name} className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-teal" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold">{name}</p>
                  <p className="text-sm text-slate-300">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-slate-400">Saylani Hackathon · HCM Lite</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/icon.svg" alt="" className="h-10 w-10 rounded-lg" />
            <div>
              <p className="text-lg leading-tight font-bold text-navy dark:text-white">HCM Lite</p>
              <p className="text-xs text-muted">Human Capital Management</p>
            </div>
          </div>
          <div className="card animate-pop p-6 shadow-[0_8px_24px_rgba(20,43,74,0.06)] sm:p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-navy dark:text-white">{title}</h1>
              {subtitle && <p className="mt-1.5 text-sm leading-relaxed text-muted">{subtitle}</p>}
            </div>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
