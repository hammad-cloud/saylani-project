import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { Spinner } from './ui';

// Sends the KPI JSON currently on screen; the model may only use those numbers.
export default function AiSummary({ kpis }) {
  const [state, setState] = useState({ bullets: null, error: null, busy: false });

  const run = async () => {
    setState({ bullets: null, error: null, busy: true });
    try {
      const { data } = await api.post('/ai/summary', { kpis });
      setState({ bullets: data.bullets, error: null, busy: false });
    } catch (err) {
      setState({ bullets: null, error: errorMessage(err), busy: false });
    }
  };

  return (
    <div className="card border-l-4 border-l-teal p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-navy dark:text-white">
          <Sparkles className="h-4 w-4" /> AI summary
        </h3>
        <button className="btn-ai btn-sm" onClick={run} disabled={state.busy || !kpis}>
          {state.busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <Sparkles className="h-3.5 w-3.5" />} Summarize
        </button>
      </div>
      {!state.bullets && !state.error && !state.busy && <p className="mt-2 text-sm text-slate-500">Get 3-5 insights from the numbers on this dashboard and the current filters.</p>}
      {state.busy && <p className="mt-2 text-sm text-slate-500">Reading the numbers...</p>}
      {state.error && <p className="mt-2 text-sm text-red-600">{state.error}</p>}
      {state.bullets && (
        <>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm">
            {state.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-slate-400">AI-generated from the dashboard numbers</p>
        </>
      )}
    </div>
  );
}
