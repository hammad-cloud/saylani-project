import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, X, Wrench } from 'lucide-react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

const SUGGESTIONS = {
  admin: ['How many active employees are in each department?', 'What is the payroll cost this month?', 'Who is on leave today?'],
  hr: ['Who came late most often this month?', "What is this month's attendance rate?", 'Who is on leave today?'],
  employee: ['How many sick leaves do I have left this year?', 'How many times was I late this month?', 'What happens if I come in after 9:15?'],
};

// Renders **bold** and line breaks from the model's plain-text answers, nothing else (no HTML injection).
function Text({ value }) {
  return value.split('\n').map((line, i) => (
    <p key={i} className={line.trim() ? '' : 'h-2'}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => (part.startsWith('**') ? <strong key={j}>{part.slice(2, -2)}</strong> : part))}
    </p>
  ));
}

export default function AiChat({ open, onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' }); // newer browsers return a Promise here; effects must not return it
  }, [messages, busy]);

  const send = async (text) => {
    const content = (text ?? input).trim();
    if (!content || busy) return;
    const next = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { data } = await api.post('/ai/chat', { messages: next.filter((m) => !m.error).map(({ role, content }) => ({ role, content })) });
      setMessages([...next, { role: 'assistant', content: data.answer, tools: data.tools }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: errorMessage(err), error: true }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30" onClick={onClose}>
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()} aria-label="AI assistant">
        <div className="flex items-center justify-between bg-ai px-4 py-3 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            <div>
              <p className="font-semibold">HR Assistant</p>
              <p className="text-xs opacity-80">Answers from live company data · your access only</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close assistant">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">Ask about attendance, leave, payroll or company policy. Roman Urdu bhi chalegi.</p>
              {SUGGESTIONS[user.role].map((s) => (
                <button key={s} onClick={() => send(s)} className="block w-full rounded-lg border border-ai/20 bg-ai-50 px-3 py-2 text-left text-sm text-ai hover:border-ai/50 dark:bg-ai/15 dark:text-teal">
                  {s}
                </button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] space-y-1 rounded-2xl px-3.5 py-2.5 text-sm ${
                  m.role === 'user' ? 'rounded-br-sm bg-navy text-white' : m.error ? 'rounded-bl-sm bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'rounded-bl-sm bg-slate-100 dark:bg-slate-800'
                }`}
              >
                <Text value={m.content} />
                {m.role === 'assistant' && !m.error && (
                  <p className="flex items-center gap-1 pt-1 text-[10px] text-slate-400">
                    <Sparkles className="h-3 w-3" /> AI-generated
                    {m.tools?.length > 0 && (
                      <>
                        {' · '}
                        <Wrench className="h-3 w-3" /> {m.tools.join(', ')}
                      </>
                    )}
                  </p>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <div className="flex gap-1 px-2" role="status" aria-label="Assistant is thinking">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-ai" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2 border-t border-slate-200 p-3 dark:border-slate-800"
        >
          <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question..." maxLength={2000} aria-label="Message" autoFocus />
          <button className="btn-ai" disabled={busy || !input.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </button>
        </form>
      </aside>
    </div>
  );
}
