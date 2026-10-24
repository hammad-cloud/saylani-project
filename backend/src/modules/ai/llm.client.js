import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';

// Any OpenAI-compatible chat-completions API with tool calling (Groq, Gemini, OpenRouter, OpenAI...).
// The key lives only here on the server; the browser never talks to the provider.
export async function chatCompletion({ messages, tools, json = false, signal }) {
  if (!env.aiApiKey) throw new ApiError(503, 'AI is not configured on the server (AI_API_KEY)');

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
    throw new Error(`LLM ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message;
}
