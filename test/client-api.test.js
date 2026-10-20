import test from 'node:test';
import assert from 'node:assert/strict';
let moduleId = 0;
async function setup(t, handler) {
  const originalFetch = globalThis.fetch,
    originalWindow = globalThis.window;
  const events = [];
  globalThis.window = {
    dispatchEvent(event) {
      events.push(event.type);
    },
  };
  globalThis.fetch = handler;
  t.after(() => {
    globalThis.fetch = originalFetch;
    globalThis.window = originalWindow;
  });
  return { ...(await import('../client/src/api.js?audit=' + moduleId++)), events };
}
const response = (status, body) => ({
  status,
  ok: status >= 200 && status < 300,
  async json() {
    if (body === undefined) throw new Error('Not JSON');
    return body;
  },
});
test('client deduplicates simultaneous CSRF requests', async (t) => {
  let calls = 0;
  const api = await setup(t, async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 10));
    return response(200, { csrfToken: 'a'.repeat(64) });
  });
  await Promise.all(Array.from({ length: 20 }, () => api.request('/auth/csrf')));
  assert.equal(calls, 1);
});
test('client obtains CSRF before mutations and sends same-origin cookies', async (t) => {
  const calls = [];
  const api = await setup(t, async (path, options) => {
    calls.push({ path, options });
    return path.endsWith('/csrf')
      ? response(200, { csrfToken: 'a'.repeat(64) })
      : response(201, { team: { id: 'test' } });
  });
  await api.request('/teams', { method: 'POST', body: { name: 'Team' } });
  assert.deepEqual(
    calls.map((x) => x.path),
    ['/api/auth/csrf', '/api/teams'],
  );
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'a'.repeat(64));
  assert.equal(calls[1].options.credentials, 'same-origin');
  assert.equal(calls[1].options.body, JSON.stringify({ name: 'Team' }));
});
test('client rotates CSRF after login and reset fetches a new token', async (t) => {
  const tokens = [];
  let csrfCalls = 0;
  const api = await setup(t, async (path, options) => {
    if (path.endsWith('/csrf')) {
      csrfCalls++;
      return response(200, { csrfToken: 'a'.repeat(64) });
    }
    tokens.push(options.headers['X-CSRF-Token']);
    return response(200, path.endsWith('/login') ? { csrfToken: 'b'.repeat(64) } : {});
  });
  await api.request('/auth/login', { method: 'POST', body: {} });
  await api.request('/teams', { method: 'POST', body: {} });
  api.resetCsrf();
  await api.request('/teams', { method: 'POST', body: {} });
  assert.deepEqual(tokens, ['a'.repeat(64), 'b'.repeat(64), 'a'.repeat(64)]);
  assert.equal(csrfCalls, 2);
});
test('client handles no-content responses', async (t) => {
  const api = await setup(t, async () => response(204));
  assert.equal(await api.request('/anything'), null);
});
test('client preserves server validation details', async (t) => {
  const api = await setup(t, async () =>
    response(400, { message: 'Invalid fields', errors: { name: ['Required'] } }),
  );
  await assert.rejects(
    api.request('/teams'),
    (error) =>
      error.status === 400 &&
      error.message === 'Invalid fields' &&
      error.fields.name[0] === 'Required',
  );
});
test('client signals expiry for protected endpoints', async (t) => {
  const api = await setup(t, async () => response(401, { message: 'Please sign in' }));
  await assert.rejects(api.request('/tasks'));
  assert.deepEqual(api.events, ['session-expired']);
});
test('client does not treat bad login as an expired workspace session', async (t) => {
  const api = await setup(t, async () => response(401, {}));
  await assert.rejects(api.request('/auth/me'));
  assert.deepEqual(api.events, []);
});
test('client handles non-JSON server failures with a readable error', async (t) => {
  const api = await setup(t, async () => response(502));
  await assert.rejects(api.request('/tasks'), /Could not connect/);
});
test('client propagates network errors without reporting success', async (t) => {
  const api = await setup(t, async () => {
    throw new Error('Network unavailable');
  });
  await assert.rejects(api.request('/tasks'), /Network unavailable/);
});

// Exercise the real platform adapter separately from browser fetch mocks.
import express from 'express';
import supertest from 'supertest';
import { createVercelHandler } from '../server/vercel-handler.js';
test('Vercel adapter removes routing metadata and reparses actual task filters', async () => {
  const app = express();
  app.get('/api/tasks', (req, res) => res.json(req.query));
  const handler = createVercelHandler(app);
  const response = await supertest((req, res) => {
    req.query = { path: 'tasks', search: 'injected metadata' };
    handler(req, res);
  })
    .get('/api/tasks?path=tasks&search=design&status=todo')
    .expect(200);
  assert.deepEqual(response.body, { search: 'design', status: 'todo' });
});
test('Vercel adapter preserves duplicate and unexpected client filters for rejection', async () => {
  const app = express();
  app.get('/api/tasks', (req, res) => res.json(req.query));
  const response = await supertest(createVercelHandler(app))
    .get('/api/tasks?path=tasks&status=todo&status=done&unexpected=true')
    .expect(200);
  assert.deepEqual(response.body, { status: ['todo', 'done'], unexpected: 'true' });
});
test('Vercel adapter preserves HTTP methods and JSON bodies', async () => {
  const app = express();
  app.use(express.json());
  app.post('/api/tasks', (req, res) => res.json(req.body));
  const response = await supertest(createVercelHandler(app))
    .post('/api/tasks?path=tasks')
    .send({ title: 'Actual title' })
    .expect(200);
  assert.deepEqual(response.body, { title: 'Actual title' });
});
