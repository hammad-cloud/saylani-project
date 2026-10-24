import { z } from 'zod';
import { AiLog } from '../../models/AiLog.js';
import { LeaveType } from '../../models/LeaveType.js';
import { ApiError } from '../../utils/ApiError.js';
import { env } from '../../config/env.js';
import { dayFromKey, toDayKey } from '../../utils/dates.js';
import { selfEmployeeId } from '../../utils/scope.js';
import { getSettings } from '../settings/settings.service.js';
import { getBalances, workingDaysBetween } from '../leave/leave.service.js';
import { chatCompletion } from './llm.client.js';
import { toolDefinitions, runTool } from './ai.tools.js';
import { chatSystemPrompt, renderPolicy, summaryPrompt, smartLeavePrompt } from './ai.prompts.js';

const TIMEOUT_MS = 15000;
const MAX_TOOL_ROUNDS = 4;
const FALLBACK = 'The assistant is not available right now. Please try again in a moment, or use the dashboard and forms directly.';

async function enforceRateLimit(user) {
  const count = await AiLog.countDocuments({ user: user._id, createdAt: { $gte: new Date(Date.now() - 3600000) } });
  if (count >= env.aiHourlyLimit) throw new ApiError(429, `AI limit reached (${env.aiHourlyLimit} requests per hour). Please try again later.`);
}

// Runs fn with a 15 s budget and logs every call to ai_logs.
async function withLog(user, feature, input, fn) {
  await enforceRateLimit(user);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const log = { user: user._id, feature, input: String(input).slice(0, 4000), tools: [] };
  try {
    const result = await fn(controller.signal, log);
    await AiLog.create({ ...log, output: JSON.stringify(result).slice(0, 4000), latencyMs: Date.now() - started });
    return result;
  } catch (err) {
    await AiLog.create({ ...log, ok: false, error: String(err.message).slice(0, 500), latencyMs: Date.now() - started });
    if (err instanceof ApiError) throw err;
    console.error('AI error:', err.message);
    throw new ApiError(503, controller.signal.aborted ? 'The assistant took too long to answer. Please try again.' : FALLBACK);
  } finally {
    clearTimeout(timer);
  }
}

/* ---------- Chat with tools ---------- */

const MAX_HISTORY = 10;

export function chat(user, history) {
  const question = history.at(-1)?.content || '';
  return withLog(user, 'chat', question, async (signal, log) => {
    const [settings, leaveTypes] = await Promise.all([getSettings(), LeaveType.find()]);
    const messages = [
      { role: 'system', content: chatSystemPrompt({ user, settings, policy: renderPolicy(settings, leaveTypes), todayKey: toDayKey(new Date()) }) },
      ...history.slice(-MAX_HISTORY).map((m) => ({ role: m.role, content: m.content })),
    ];
    const tools = toolDefinitions(user.role);

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const msg = await chatCompletion({ messages, tools: round < MAX_TOOL_ROUNDS ? tools : undefined, signal });
      if (!msg?.tool_calls?.length) return { answer: msg?.content?.trim() || "I don't know.", tools: log.tools.map((t) => t.name) };

      messages.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        let args = {};
        try {
          args = JSON.parse(call.function.arguments || '{}') || {};
        } catch {
          /* model sent bad JSON: run with defaults */
        }
        log.tools.push({ name: call.function.name, args });
        let result;
        try {
          result = await runTool(user, call.function.name, args);
        } catch (err) {
          result = { error: err instanceof ApiError ? err.message : 'Tool failed' };
        }
        messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result).slice(0, 12000) });
      }
    }
    return { answer: FALLBACK, tools: log.tools.map((t) => t.name) };
  });
}

/* ---------- JSON output with validation + one retry ---------- */

async function completeJson(messages, schema, signal) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await chatCompletion({ messages, json: true, signal });
    try {
      const raw = (msg?.content || '').replace(/^```(json)?|```$/g, '').trim();
      return schema.parse(JSON.parse(raw));
    } catch {
      messages = [...messages, { role: 'assistant', content: msg?.content || '' }, { role: 'user', content: 'That was not valid. Reply with ONLY the JSON object in the exact format requested.' }];
    }
  }
  throw new ApiError(502, 'The AI returned an invalid answer. Please use the normal form.');
}

const summarySchema = z.object({ bullets: z.array(z.string().min(3).max(300)).min(1).max(6) });

export function summarize(user, kpis) {
  return withLog(user, 'summary', JSON.stringify(kpis).slice(0, 500), async (signal) => {
    const { bullets } = await completeJson(summaryPrompt(kpis), summarySchema, signal);
    return { bullets: bullets.slice(0, 5) };
  });
}

/* ---------- Smart leave: sentence -> validated, pre-filled form (never saved) ---------- */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function smartLeave(user, text) {
  selfEmployeeId(user);
  return withLog(user, 'smart_leave', text, async (signal) => {
    const leaveTypes = await LeaveType.find();
    const todayKey = toDayKey(new Date());
    const calendar = Array.from({ length: 28 }, (_, i) => {
      const d = new Date(dayFromKey(todayKey).getTime() + i * 86400000);
      return `${d.toISOString().slice(0, 10)} ${DAY_NAMES[d.getUTCDay()]}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`;
    }).join('\n');

    const schema = z
      .object({
        type: z.string().transform((s) => s.toLowerCase()).pipe(z.enum(leaveTypes.map((t) => t.code))),
        start: z.string().date(),
        end: z.string().date(),
        reason: z.string().max(300).default(''),
      })
      .refine((v) => v.end >= v.start && v.start >= todayKey, 'Dates must be today or later, end on/after start');

    const parsed = await completeJson(smartLeavePrompt({ text, todayKey, calendar, leaveTypes }), schema, signal);
    const type = leaveTypes.find((t) => t.code === parsed.type);
    const days = await workingDaysBetween(dayFromKey(parsed.start), dayFromKey(parsed.end));
    const balance = (await getBalances(user.employee)).find((b) => b.leaveType.code === type.code);

    return {
      form: { leaveType: type._id, leaveTypeCode: type.code, leaveTypeName: type.name, start: parsed.start, end: parsed.end, reason: parsed.reason },
      workingDays: days,
      remaining: balance?.remaining ?? null,
    };
  });
}
