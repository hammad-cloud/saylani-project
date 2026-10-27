// The AI client cuts off one slow provider call and retries once, within the caller's overall budget.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.MONGO_URI ||= 'mongodb://127.0.0.1:27017/unused';
process.env.JWT_SECRET ||= 'test-secret';
process.env.AI_API_KEY = 'test-key';
process.env.AI_ATTEMPT_TIMEOUT_MS = '100';
const { chatCompletion } = await import('../src/modules/ai/llm.client.js');

const realFetch = globalThis.fetch;
let calls;

// Each entry is one provider call: 'hang' never answers (until aborted), otherwise the reply text.
function fakeProvider(script) {
  calls = 0;
  globalThis.fetch = (_url, { signal }) => {
    const step = script[calls++];
    if (step === 'hang') {
      // AbortSignal.timeout's timer does not keep Node alive (a real server's socket does), so hold a normal
      // timer while "hanging" or the test process can exit before the abort fires.
      const keepAlive = setTimeout(() => {}, 10_000);
      return new Promise((_resolve, reject) =>
        signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(signal.reason);
        })
      );
    }
    if (typeof step === 'number') return Promise.resolve(new Response('{"error":"provider says no"}', { status: step }));
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: step } }] }), { status: 200 }));
  };
}

beforeEach(() => (calls = 0));
afterEach(() => (globalThis.fetch = realFetch));

test('a fast answer is returned on the first attempt', async () => {
  fakeProvider(['hello']);
  assert.equal((await chatCompletion({ messages: [] })).content, 'hello');
  assert.equal(calls, 1);
});

test('a hanging call is cut off and retried once', async () => {
  fakeProvider(['hang', 'second try']);
  const started = Date.now();
  assert.equal((await chatCompletion({ messages: [] })).content, 'second try');
  assert.equal(calls, 2);
  assert.ok(Date.now() - started < 1000);
});

test('two hanging calls give up (the service turns this into the friendly fallback)', async () => {
  fakeProvider(['hang', 'hang', 'never reached']);
  await assert.rejects(chatCompletion({ messages: [] }), { name: 'TimeoutError' });
  assert.equal(calls, 2);
});

test('a 503 "high demand" reply is retried once', async () => {
  fakeProvider([503, 'after overload']);
  assert.equal((await chatCompletion({ messages: [] })).content, 'after overload');
  assert.equal(calls, 2);
});

test('a rate limit (429) is not retried and gives a friendly message', async () => {
  fakeProvider([429, 'never reached']);
  await assert.rejects(chatCompletion({ messages: [] }), /free-tier limit/);
  assert.equal(calls, 1);
});

test('a client error (400) is not retried', async () => {
  fakeProvider([400, 'never reached']);
  await assert.rejects(chatCompletion({ messages: [] }), /LLM 400/);
  assert.equal(calls, 1);
});

test("the caller's overall budget still wins: no retry once it is used up", async () => {
  fakeProvider(['hang', 'second try']);
  const overall = AbortSignal.timeout(50); // shorter than one attempt
  await assert.rejects(chatCompletion({ messages: [], signal: overall }));
  assert.equal(calls, 1);
});
