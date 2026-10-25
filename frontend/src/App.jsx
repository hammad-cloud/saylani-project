import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { api } from './api/client';
import { PageLoader } from './components/ui';
import AppLayout from './layouts/AppLayout';
import Setup from './pages/Setup';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';

// Pages load on demand so the login screen does not download the whole app.
const Dashboard = lazy(() => import('./pages/Dashboard'));
const CompanySettings = lazy(() => import('./pages/admin/CompanySettings'));
const Organization = lazy(() => import('./pages/admin/Organization'));
const UsersPage = lazy(() => import('./pages/admin/Users'));
const AuditLog = lazy(() => import('./pages/admin/AuditLog'));
const Employees = lazy(() => import('./pages/hr/Employees'));
const EmployeeProfile = lazy(() => import('./pages/hr/EmployeeProfile'));
const AttendanceBoard = lazy(() => import('./pages/hr/AttendanceBoard'));
const Corrections = lazy(() => import('./pages/hr/Corrections'));
const LeaveApprovals = lazy(() => import('./pages/hr/LeaveApprovals'));
const Payroll = lazy(() => import('./pages/hr/Payroll'));
const PayrollRun = lazy(() => import('./pages/hr/PayrollRun'));
const MyAttendance = lazy(() => import('./pages/employee/MyAttendance'));
const MyLeave = lazy(() => import('./pages/employee/MyLeave'));
const Payslips = lazy(() => import('./pages/employee/Payslips'));
const MyProfile = lazy(() => import('./pages/employee/MyProfile'));
const Announcements = lazy(() => import('./pages/shared/Announcements'));
const NotFound = lazy(() => import('./pages/shared/NotFound'));

// Client-side guard only shapes the UI; every API call is checked again on the server.
function RequireRole({ roles, children }) {
  const { user } = useAuth();
  return roles.includes(user.role) ? children : <Navigate to="/" replace />;
}

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  return <AppLayout />;
}

export default function App() {
  const [setupComplete, setSetupComplete] = useState(null);

  useEffect(() => {
    api
      .get('/setup/status')
      .then((r) => setSetupComplete(r.data.setupComplete))
      .catch(() => setSetupComplete(true));
  }, []);

  if (setupComplete === null) return <PageLoader />;
  if (!setupComplete)
    return (
      <Routes>
        <Route path="*" element={<Setup onDone={() => setSetupComplete(true)} />} />
      </Routes>
    );

  const A = ['admin'];
  const AH = ['admin', 'hr'];
  const SELF = ['hr', 'employee'];

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route element={<Protected />}>
          <Route index element={<Dashboard />} />
          <Route path="settings" element={<RequireRole roles={AH}><CompanySettings /></RequireRole>} />
          <Route path="org" element={<RequireRole roles={AH}><Organization /></RequireRole>} />
          <Route path="users" element={<RequireRole roles={A}><UsersPage /></RequireRole>} />
          <Route path="audit" element={<RequireRole roles={A}><AuditLog /></RequireRole>} />
          <Route path="employees" element={<RequireRole roles={AH}><Employees /></RequireRole>} />
          <Route path="employees/:id" element={<RequireRole roles={AH}><EmployeeProfile /></RequireRole>} />
          <Route path="attendance" element={<RequireRole roles={SELF}><MyAttendance /></RequireRole>} />
          <Route path="attendance/board" element={<RequireRole roles={AH}><AttendanceBoard /></RequireRole>} />
          <Route path="attendance/corrections" element={<RequireRole roles={AH}><Corrections /></RequireRole>} />
          <Route path="leave" element={<RequireRole roles={SELF}><MyLeave /></RequireRole>} />
          <Route path="leave/approvals" element={<RequireRole roles={AH}><LeaveApprovals /></RequireRole>} />
          <Route path="payroll" element={<RequireRole roles={AH}><Payroll /></RequireRole>} />
          <Route path="payroll/:id" element={<RequireRole roles={AH}><PayrollRun /></RequireRole>} />
          <Route path="payslips" element={<Payslips />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
