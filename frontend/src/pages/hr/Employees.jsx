import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileUp, Plus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api, downloadFile, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { Async, Badge, EmptyState, Modal, PageHeader, Pager, Spinner, fmtDate, money, useApi } from '../../components/ui';
import EmployeeForm from '../../components/EmployeeForm';
import TempPassword from '../../components/TempPassword';

const SAMPLE = 'code,name,email,phone,gender,department,designation,joinDate,basicSalary\nEMP010,Ali Khan,ali@example.com,03001234567,male,Engineering,Developer,2026-01-15,80000';

// CSV import: always a dry run first; the real import only runs when the dry run has no errors.
function CsvImport({ onDone }) {
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const readFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    file.text().then((t) => {
      setCsv(t);
      setResult(null);
    });
  };

  const run = async (dryRun) => {
    setBusy(true);
    try {
      const { data } = await api.post('/employees/import', { csv, dryRun });
      setResult(data);
      if (!dryRun) {
        toast.success(`${data.created.length} employee(s) imported`);
        onDone();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Columns: <code className="text-xs">code, name, email, phone, gender, department, designation, joinDate, basicSalary</code>. Department and designation must match existing names; dates are YYYY-MM-DD.
      </p>
      <input type="file" accept=".csv,text/csv" onChange={readFile} className="text-sm" aria-label="CSV file" />
      <textarea className="input h-32 font-mono text-xs" placeholder={SAMPLE} value={csv} onChange={(e) => (setCsv(e.target.value), setResult(null))} aria-label="CSV content" />
      <div className="flex gap-2">
        <button className="btn-secondary" disabled={!csv || busy} onClick={() => run(true)}>
          {busy && <Spinner className="h-4 w-4" />} Dry run
        </button>
        <button className="btn-primary" disabled={!result?.dryRun || result.errors.length > 0 || busy} onClick={() => run(false)}>
          Import {result?.validCount ?? ''} row(s)
        </button>
      </div>
      {result?.dryRun && (
        <div className="text-sm">
          <p>
            {result.total} row(s): <strong className="text-brand">{result.validCount} valid</strong>
            {result.errors.length > 0 && <strong className="text-red-600">, {result.errors.length} error(s)</strong>}
          </p>
          {result.errors.length > 0 && (
            <table className="table mt-2">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Field</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e, i) => (
                  <tr key={i}>
                    <td>{e.row}</td>
                    <td>{e.field}</td>
                    <td className="text-red-600">{e.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {result && !result.dryRun && (
        <div className="text-sm">
          <p className="mb-2 font-medium">Created logins (temporary passwords are shown only once):</p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-slate-100 p-2 text-xs dark:bg-slate-800">{result.created.map((c) => `${c.code}  ${c.email}  ${c.tempPassword ?? '(existing login)'}`).join('\n')}</pre>
        </div>
      )}
    </div>
  );
}

export default function Employees() {
  const { user } = useAuth();
  const isHr = user.role === 'hr';
  const [filter, setFilter] = useState({ search: '', department: '', status: '', page: 1 });
  const state = useApi(`/employees?${new URLSearchParams(filter)}`);
  const depts = useApi('/departments');
  const [modal, setModal] = useState(null); // 'new' | 'import'
  const [temp, setTemp] = useState(null);
  const set = (k) => (e) => setFilter({ ...filter, [k]: e.target.value, page: 1 });

  const exportCsv = () => downloadFile('/employees/export', 'employees.csv').catch((err) => toast.error(errorMessage(err)));

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={isHr ? 'Register employees, edit details, import or export CSV' : 'Company directory (HR manages employee records)'}
        actions={
          isHr && (
            <>
              <button className="btn-secondary" onClick={exportCsv}>
                <Download className="h-4 w-4" /> Export
              </button>
              <button className="btn-secondary" onClick={() => setModal('import')}>
                <FileUp className="h-4 w-4" /> Import CSV
              </button>
              <button className="btn-primary" onClick={() => setModal('new')}>
                <Plus className="h-4 w-4" /> Register employee
              </button>
            </>
          )
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="input max-w-xs" placeholder="Search name, email or code" value={filter.search} onChange={set('search')} aria-label="Search employees" />
        <select className="input w-auto" value={filter.department} onChange={set('department')} aria-label="Department">
          <option value="">All departments</option>
          {depts.data?.map((d) => (
            <option key={d._id} value={d._id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className="input w-auto" value={filter.status} onChange={set('status')} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="probation">Probation</option>
          <option value="exited">Exited</option>
        </select>
      </div>
      <Async state={state}>
        {(d) =>
          d.items.length === 0 ? (
            <div className="card">
              <EmptyState title="No employees found" hint={isHr ? 'Register the first employee to get started.' : undefined} icon={Users} />
            </div>
          ) : (
            <>
              <div className="card overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Employee</th>
                      <th>Department</th>
                      <th className="hidden md:table-cell">Designation</th>
                      <th className="hidden lg:table-cell">Joined</th>
                      <th className="hidden sm:table-cell">Basic</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.items.map((e) => (
                      <tr key={e._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td>
                          <Link to={`/employees/${e._id}`} className="font-medium hover:text-brand">
                            {e.name}
                          </Link>
                          <p className="text-xs text-slate-500">
                            {e.code} · {e.email}
                          </p>
                        </td>
                        <td>{e.department?.name}</td>
                        <td className="hidden md:table-cell">{e.designation?.name || '-'}</td>
                        <td className="hidden lg:table-cell">{fmtDate(e.joinDate)}</td>
                        <td className="hidden sm:table-cell">{money(e.basicSalary)}</td>
                        <td>
                          <Badge value={e.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-500">{d.total} employee(s)</p>
              <Pager page={d.page} pages={d.pages} onPage={(page) => setFilter({ ...filter, page })} />
            </>
          )
        }
      </Async>
      <Modal open={modal === 'new'} onClose={() => setModal(null)} title="Register employee" wide>
        <EmployeeForm
          onSaved={(data) => {
            setModal(null);
            state.reload();
            if (data.tempPassword) setTemp({ email: data.employee.email, password: data.tempPassword });
          }}
        />
      </Modal>
      <Modal open={modal === 'import'} onClose={() => setModal(null)} title="Import employees from CSV" wide>
        <CsvImport onDone={state.reload} />
      </Modal>
      <TempPassword value={temp} onClose={() => setTemp(null)} />
    </>
  );
}
