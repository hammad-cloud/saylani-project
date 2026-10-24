import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/ui';

export default function NotFound() {
  return (
    <div className="card">
      <EmptyState
        title="Page not found"
        hint="The page does not exist or your role cannot open it."
        action={
          <Link to="/" className="btn-primary mt-2">
            Go to dashboard
          </Link>
        }
      />
    </div>
  );
}
