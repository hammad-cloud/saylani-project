import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, UserCheck, Plane, Clock, Inbox, TrendingDown, Wallet, Banknote, Activity, CalendarDays, FileText, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Async, Badge, EmptyState, PageHeader, StatCard, fmtDate, money, monthStartKey, todayKey, useApi } from '../components/ui';
import Filters, { toQuery } from '../components/Filters';
import AiSummary from '../components/AiSummary';
import { ChartCard, Donut, SimpleBar, TrendLine } from '../components/charts';
import CheckInWidget from '../components/CheckInWidget';
import AnnouncementsFeed from '../components/AnnouncementsFeed';

function useFilters() {
  return useState({ from: monthStartKey(), to: todayKey(), department: '' });
}

function Insights({ insights }) {
  if (!insights) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <AlertTriangle className="h-4 w-4 text-accent" /> Absence anomalies
        </h3>
        {insights.anomalies.length === 0 ? (
          <p className="text-sm text-slate-500">No unusual absence patterns in this period.</p>
        ) : (
          <ul className="space-y-2">
            {insights.anomalies.map((a) => (
              <li key={a.code} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{a.name}</strong> <span className="text-slate-500">({a.code})</span>
                </span>
                <span className="text-xs text-slate-500">{a.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <TrendingDown className="h-4 w-4 text-red-500" /> Attrition risk
        </h3>
        {insights.attritionRisk.length === 0 ? (
          <p className="text-sm text-slate-500">Nobody shows elevated risk signals.</p>
        ) : (
          <ul className="space-y-2">
            {insights.attritionRisk.map((r) => (
              <li key={r.code} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  <strong>{r.name}</strong> <span className="text-xs text-slate-500">{r.factors.join(', ')}</span>
                </span>
                <Badge value={r.level}>
                  {r.level} · {r.score}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function HrDashboard() {
  const [filters, setFilters] = useFilters();
  const state = useApi(`/analytics/hr?${toQuery(filters)}`);

  return (
    <>
      <PageHeader title="HR dashboard" subtitle="Live numbers from attendance, leave and approvals" actions={<Filters value={filters} onChange={setFilters} />} />
      <Async state={state}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard label="Headcount" value={d.kpis.headcount} icon={Users} tone="navy" />
              <StatCard label="Present today" value={d.kpis.presentToday} icon={UserCheck} />
              <StatCard label="On leave today" value={d.kpis.onLeaveToday} icon={Plane} tone="orange" />
              <StatCard label="Late today" value={d.kpis.lateToday} icon={Clock} tone="purple" />
              <StatCard label="Pending approvals" value={d.kpis.pendingApprovals} icon={Inbox} tone="red" />
              <StatCard label="Attendance rate" value={`${d.kpis.attendanceRate}%`} icon={Activity} hint="selected period" />
            </div>
            <AiSummary kpis={{ filters, ...d.kpis, absenteeismByDepartment: d.absenteeismByDepartment, leaveByType: d.leaveByType, topLateComers: d.topLateComers, onLeaveToday: d.onLeaveToday }} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Attendance trend" empty={!d.attendanceTrend.length}>
                <TrendLine data={d.attendanceTrend} x="date" y="rate" name="Attendance" unit="%" />
              </ChartCard>
              <ChartCard title="Absenteeism & late % by department" empty={!d.absenteeismByDepartment.length}>
                <SimpleBar
                  data={d.absenteeismByDepartment}
                  x="department"
                  bars={[
                    { key: 'absenteeism', name: 'Absenteeism %', color: '#c0392b' },
                    { key: 'latePercent', name: 'Late %', color: '#b7791f' },
                  ]}
                />
              </ChartCard>
              <ChartCard title="Leave by type (approved days)" empty={!d.leaveByType.some((t) => t.days)}>
                <SimpleBar data={d.leaveByType} x="leaveType" bars={[{ key: 'days', name: 'Days' }]} />
              </ChartCard>
              <div className="card p-4">
                <h3 className="mb-3 font-semibold">Top 5 late-comers</h3>
                {d.topLateComers.length === 0 ? (
                  <EmptyState title="No late arrivals" hint="Nobody was late in this period." icon={Clock} />
                ) : (
                  <ol className="space-y-2">
                    {d.topLateComers.map((l, i) => (
                      <li key={l.employeeId} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ai-50 text-xs font-bold text-ai dark:bg-ai/20">{i + 1}</span>
                        <Link to={`/employees/${l.employeeId}`} className="flex-1 text-sm font-medium hover:text-brand">
                          {l.name} <span className="text-slate-400">({l.code})</span>
                        </Link>
                        <Badge value="late">{l.lateCount}× late</Badge>
                      </li>
                    ))}
                  </ol>
                )}
                <h3 className="mt-6 mb-2 font-semibold">On leave today</h3>
                {d.onLeaveToday.length === 0 ? (
                  <p className="text-sm text-slate-500">Everyone is in today.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.onLeaveToday.map((l) => (
                      <li key={l.code} className="flex justify-between">
                        <span>{l.name}</span>
                        <span className="text-slate-500">
                          {l.type} · until {fmtDate(l.until)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <Insights insights={d.insights} />
          </div>
        )}
      </Async>
    </>
  );
}

function AdminDashboard() {
  const [filters, setFilters] = useFilters();
  const state = useApi(`/analytics/admin?${toQuery(filters)}`);

  return (
    <>
      <PageHeader title="Company dashboard" subtitle="Headcount, attrition and payroll across the company" actions={<Filters value={filters} onChange={setFilters} />} />
      <Async state={state}>
        {(d) => (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Headcount" value={d.kpis.headcount} icon={Users} tone="navy" />
              <StatCard label="Attrition YTD" value={`${d.kpis.attritionYtd}%`} hint={`${d.kpis.exitsYtd} exit(s) this year`} icon={TrendingDown} tone="red" />
              <StatCard label="Payroll cost" value={money(d.kpis.payrollCost)} hint="gross, selected period" icon={Wallet} tone="purple" />
              <StatCard label="Average salary" value={money(d.kpis.averageSalary)} hint="monthly gross" icon={Banknote} tone="orange" />
            </div>
            <AiSummary kpis={{ filters, ...d.kpis, headcountByDepartment: d.headcountByDepartment, payrollByDepartment: d.payrollByDepartment, demographics: d.demographics }} />
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Headcount by department" empty={!d.headcountByDepartment.length}>
                <SimpleBar data={d.headcountByDepartment} x="department" bars={[{ key: 'count', name: 'Employees' }]} />
              </ChartCard>
              <ChartCard title="Payroll cost by department" empty={!d.payrollByDepartment.length}>
                <SimpleBar
                  data={d.payrollByDepartment}
                  x="department"
                  bars={[
                    { key: 'gross', name: 'Gross', color: '#1f4e79' },
                    { key: 'net', name: 'Net', color: '#14b8a6' },
                  ]}
                  format={(v) => `${Math.round(v / 1000)}k`}
                />
              </ChartCard>
              <ChartCard title="Gender" empty={!Object.keys(d.demographics.gender).length}>
                <Donut data={Object.entries(d.demographics.gender).map(([name, value]) => ({ name, value }))} />
              </ChartCard>
              <ChartCard title="Tenure" empty={!Object.values(d.demographics.tenure).some(Boolean)}>
                <SimpleBar data={Object.entries(d.demographics.tenure).map(([name, value]) => ({ name, value }))} x="name" bars={[{ key: 'value', name: 'Employees', color: '#1f4e79' }]} />
              </ChartCard>
            </div>
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="font-semibold">Audit feed</h3>
                <Link to="/audit" className="text-sm text-brand hover:underline">
                  View all
                </Link>
              </div>
              {d.auditFeed.length === 0 ? (
                <p className="text-sm text-slate-500">No activity yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {d.auditFeed.map((a) => (
                    <li key={a._id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                      <span>
                        <strong>{a.actor?.name || 'System'}</strong> <Badge value={a.action} /> {a.entity}
                      </span>
                      <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Async>
    </>
  );
}

function EmployeeDashboard() {
  const { user } = useAuth();
  const state = useApi('/analytics/me');

  return (
    <>
      <PageHeader title={`Hi, ${user.name.split(' ')[0]}`} subtitle="Your day at a glance" />
      <Async state={state}>
        {(d) => (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-4 lg:col-span-2">
              <CheckInWidget onChange={state.reload} />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Hours this week" value={`${d.hoursThisWeek}h`} hint={`of ${d.weeklyTarget}h`} icon={Clock} />
                <StatCard label="Late this month" value={d.lateThisMonth} icon={AlertTriangle} tone="orange" />
                <StatCard label="Absent this month" value={d.absentThisMonth} icon={CalendarDays} tone="red" />
                <StatCard label="Last payslip" value={d.lastPayslip ? money(d.lastPayslip.net) : '-'} hint={d.lastPayslip ? `${d.lastPayslip.year}-${String(d.lastPayslip.month).padStart(2, '0')} net` : 'none yet'} icon={FileText} tone="purple" />
              </div>
              <div className="card p-4">
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-medium">Weekly hours</span>
                  <span className="text-slate-500">
                    {d.hoursThisWeek} / {d.weeklyTarget} h
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={d.hoursThisWeek} aria-valuemax={d.weeklyTarget}>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (d.hoursThisWeek / d.weeklyTarget) * 100)}%` }} />
                </div>
              </div>
              <div className="card p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-semibold">Leave balance</h3>
                  <Link to="/leave" className="text-sm text-brand hover:underline">
                    Apply for leave
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {d.leaveBalances.map((b) => (
                    <div key={b.leaveType._id} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800">
                      <p className="text-xs text-slate-500">{b.leaveType.name}</p>
                      <p className="text-xl font-bold text-navy dark:text-white">{b.remaining ?? '∞'}</p>
                      <p className="text-[10px] text-slate-400">{b.quota == null ? 'unlimited' : `of ${b.quota} left`}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <AnnouncementsFeed items={d.announcements} />
          </div>
        )}
      </Async>
    </>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  if (user.role === 'admin') return <AdminDashboard />;
  if (user.role === 'hr') return <HrDashboard />;
  return <EmployeeDashboard />;
}
