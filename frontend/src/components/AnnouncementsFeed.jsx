import { Megaphone } from 'lucide-react';
import { EmptyState } from './ui';

export default function AnnouncementsFeed({ items }) {
  return (
    <div className="card p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Megaphone className="h-4 w-4 text-accent" /> Announcements
      </h3>
      {!items?.length ? (
        <EmptyState title="Nothing announced yet" icon={Megaphone} />
      ) : (
        <ul className="space-y-4">
          {items.map((a) => (
            <li key={a._id} className="border-l-2 border-accent pl-3">
              <p className="font-medium">{a.title}</p>
              <p className="mt-0.5 text-sm whitespace-pre-line text-slate-600 dark:text-slate-400">{a.body}</p>
              <p className="mt-1 text-xs text-slate-400">
                {a.author?.name} · {new Date(a.createdAt).toLocaleDateString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
