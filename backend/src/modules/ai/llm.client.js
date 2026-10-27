import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

// One slow model call is cut off after this and retried once: free-tier latency is spiky (most calls take
// 1-5 s, some hang for 30 s+), so a fresh attempt is usually faster than waiting. A 5xx "high demand"
// reply is retried once too. Rate limits (429) are not retried: that would only burn more quota.
// The caller's overall budget (signal) still applies on top.
const ATTEMPT_TIMEOUT_MS = Number(process.env.AI_ATTEMPT_TIMEOUT_MS) || 15000;
const ATTEMPTS = 2;

// Any OpenAI-compatible chat-completions API with tool calling (Groq, Gemini, OpenRouter, OpenAI...).
// The key lives only here on the server; the browser never talks to the provider.
export async function chatCompletion({ messages, tools, json = false, signal }) {
  if (!env.aiApiKey) throw new ApiError(503, 'AI is not configured on the server (AI_API_KEY)');

  for (let attempt = 1; ; attempt++) {
    const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(ATTEMPT_TIMEOUT_MS)].filter(Boolean));
    try {
      return await request({ messages, tools, json, signal: attemptSignal });
    } catch (err) {
      // Worth one more try: this call hung, or the provider said it is briefly overloaded (5xx).
      const transient = (err?.name === 'TimeoutError' && !signal?.aborted) || err?.providerStatus >= 500;
      if (!transient || attempt >= ATTEMPTS) throw err;
      console.warn(`AI call failed (${err.providerStatus || 'timeout'}), retrying (attempt ${attempt + 1})`);
    }
  }
}

async function request({ messages, tools, json, signal }) {
  const res = await fetch(`${env.aiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.aiApiKey}` },
    body: JSON.stringify({
      model: env.aiModel,
      messages,
      temperature: 0.1,
      ...(tools?.length && { tools, tool_choice: 'auto' }),
      ...(json && { response_format: { type: 'json_object' } }),
    }),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 429) {
      const wait = Math.ceil(Number(res.headers.get('retry-after')) || Number(text.match(/try again in ([\d.]+)s/)?.[1]) || 20);
      throw new ApiError(429, `The AI provider is busy (free-tier limit). Please try again in about ${wait} seconds.`);
    }
    throw Object.assign(new Error(`LLM ${res.status}: ${text.slice(0, 300)}`), { providerStatus: res.status });
  }
  const data = await res.json();
  return data.choices?.[0]?.message;
}
