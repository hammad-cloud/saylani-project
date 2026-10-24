import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, Moon, Sparkles, Sun, X, KeyRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MENU } from '../config/menu';
import { api } from '../api/client';
import AiChat from '../components/AiChat';

function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.theme = dark ? 'dark' : 'light';
    } catch {
      /* storage blocked: theme just won't persist */
    }
  }, [dark]);
  return [dark, setDark];
}

function Notifications() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ items: [], unread: 0 });
  const navigate = useNavigate();

  const load = () => api.get('/notifications').then((r) => setData(r.data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const toggle = async () => {
    setOpen(!open);
    if (!open && data.unread) {
      await api.post('/notifications/read-all').catch(() => {});
      setTimeout(load, 1500);
    }
  };

  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={`Notifications (${data.unread} unread)`}>
        <Bell className="h-5 w-5" />
        {data.unread > 0 && <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{data.unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto p-2">
          {data.items.length === 0 && <p className="p-4 text-center text-sm text-slate-500">No notifications yet</p>}
          {data.items.map((n) => (
            <button
              key={n._id}
              onClick={() => {
                setOpen(false);
                if (n.link) navigate(n.link);
              }}
              className={`block w-full rounded-lg p-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 ${n.read ? '' : 'border-l-2 border-teal bg-brand-50 dark:bg-brand/10'}`}
            >
              <p className="text-sm font-medium">{n.title}</p>
              {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{n.body}</p>}
              <p className="mt-1 text-[10px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const [dark, setDark] = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const items = MENU[user.role].filter((i) => !i.employeeOnly || user.employee);

  return (
    <div className="flex min-h-screen">
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-navy text-slate-300 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 dark:bg-navy-900 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/10 px-5">
          <div className="flex items-center gap-2.5">
            <img src="/icon.svg" alt="" className="h-9 w-9 rounded-lg ring-1 ring-white/15" />
            <div>
              <p className="text-base leading-tight font-bold text-white">HCM Lite</p>
              <p className="text-[10px] font-semibold tracking-wider text-teal uppercase">{user.role === 'hr' ? 'HR' : user.role} workspace</p>
            </div>
          </div>
          <button className="rounded p-1 text-slate-300 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {items.map((item, i) =>
            item.section ? (
              <p key={i} className="px-3 pt-5 pb-1.5 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                {item.section}
              </p>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/' || item.to === '/attendance' || item.to === '/leave'}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-white/10 text-white before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r before:bg-teal'
                      : 'hover:bg-white/5 hover:text-white'
                  }`
                }
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </NavLink>
            )
          )}
        </nav>
        <div className="border-t border-white/10 p-3">
          <div className="mt-1 flex gap-1">
            <button onClick={() => navigate('/change-password')} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium hover:bg-white/5 hover:text-white">
              <KeyRound className="h-3.5 w-3.5" /> Password
            </button>
            <button onClick={logout} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium hover:bg-white/5 hover:text-red-300">
              <LogOut className="h-3.5 w-3.5" /> Log out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-2 border-b border-line bg-white px-4 sm:px-6 dark:border-slate-800 dark:bg-slate-900">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden dark:hover:bg-slate-800" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <button onClick={() => setChatOpen(true)} className="btn-ai btn-sm">
            <Sparkles className="h-4 w-4" /> <span className="hidden sm:inline">Ask assistant</span>
          </button>
          <Notifications />
          <button onClick={() => setDark(!dark)} className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Toggle dark mode">
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <div className="ml-1 flex items-center gap-2.5 border-l border-line pl-3 dark:border-slate-700">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-navy text-sm font-bold text-white ring-2 ring-teal/40 dark:bg-brand" aria-hidden="true">
              {user.name
                .split(' ')
                .map((w) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase()}
            </span>
            <div className="hidden leading-tight sm:block">
              <p className="max-w-40 truncate text-sm font-semibold text-ink dark:text-white">{user.name}</p>
              <p className="text-xs text-muted capitalize">{user.role === 'hr' ? 'HR' : user.role}</p>
            </div>
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          <div key={location.pathname} className="animate-page">
            <Outlet />
          </div>
        </main>
      </div>

      <AiChat open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
