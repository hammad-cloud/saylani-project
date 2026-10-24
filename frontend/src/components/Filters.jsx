import { useApi } from './ui';

// Date range + department filter shared by dashboards; every number is recomputed on the server.
export default function Filters({ value, onChange, showDepartment = true }) {
  const depts = useApi(showDepartment ? '/departments' : null);
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });

  return (
    <div className="flex flex-wrap items-end gap-2">
      <label>
        <span className="label">From</span>
        <input type="date" className="input py-1.5" value={value.from} onChange={set('from')} max={value.to} />
      </label>
      <label>
        <span className="label">To</span>
        <input type="date" className="input py-1.5" value={value.to} onChange={set('to')} min={value.from} />
      </label>
      {showDepartment && (
        <label>
          <span className="label">Department</span>
          <select className="input py-1.5" value={value.department} onChange={set('department')}>
            <option value="">All departments</option>
            {depts.data?.map((d) => (
              <option key={d._id} value={d._id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export const toQuery = (f) => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
