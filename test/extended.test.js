import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { mkdir, writeFile } from 'node:fs/promises';
import supertest from 'supertest';
import { createApp } from '../server/app.js';
import { getConfig } from '../server/config.js';
import { memoryStore } from './memory-store.js';

const password = 'Audit password 2026!';
function fixture(rateLimit = false) {
  const store = memoryStore();
  const runtime = createApp({
    store,
    config: getConfig({
      NODE_ENV: 'test',
      SESSION_SECRET: 'extended-audit-secret-'.repeat(3),
      APP_ORIGIN: 'http://localhost:5173',
    }),
    disableRateLimit: !rateLimit,
  });
  return { ...runtime, store };
}
async function actor(app, name, email, secret = password) {
  const agent = supertest.agent(app);
  const first = await agent.get('/api/auth/csrf').expect(200);
  const registered = await agent
    .post('/api/auth/register')
    .set('X-CSRF-Token', first.body.csrfToken)
    .send({ name, email, password: secret })
    .expect(201);
  let csrf = registered.body.csrfToken;
  return {
    agent,
    user: registered.body.user,
    send(method, path, body) {
      return agent[method]('/api' + path)
        .set('X-CSRF-Token', csrf)
        .send(body);
    },
    setCsrf(value) {
      csrf = value;
    },
  };
}
async function parallel(count, concurrency, operation) {
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < count) {
        const index = next++;
        await operation(index);
      }
    }),
  );
}

test('request validation and security boundaries', async (t) => {
  const { app } = fixture();
  const owner = await actor(app, 'Audit Owner', 'validation@example.com');
  const team = (await owner.send('post', '/teams', { name: 'Validation team' }).expect(201)).body
    .team;
  const invalidTasks = [
    ['empty title', { title: '' }],
    ['whitespace title', { title: '   ' }],
    ['oversized title', { title: 'x'.repeat(161) }],
    ['numeric title', { title: 123 }],
    ['null title', { title: null }],
    ['oversized description', { description: 'x'.repeat(3001) }],
    ['invalid assignee', { assigneeId: 'not-a-uuid' }],
    ['assignee array', { assigneeId: [] }],
    ['invalid status', { status: 'admin' }],
    ['invalid priority', { priority: 'urgent' }],
    ['invalid month', { dueDate: '2026-13-01' }],
    ['invalid day', { dueDate: '2026-04-31' }],
    ['invalid leap day', { dueDate: '2025-02-29' }],
    ['invalid date format', { dueDate: '20/10/2026' }],
    ['invalid date type', { dueDate: 20261020 }],
    ['creator injection', { creatorId: randomUUID() }],
    ['id injection', { id: randomUUID() }],
    ['timestamp injection', { createdAt: '2020' }],
    ['role injection', { role: 'admin' }],
    ['object instead of team ID', { teamId: { $ne: null } }],
    ['array title', { title: ['hello'] }],
  ];
  for (const [name, fields] of invalidTasks)
    await t.test('reject ' + name, () =>
      owner.send('post', '/tasks', { teamId: team.id, title: 'Valid task', ...fields }).expect(400),
    );
  for (const path of [
    '/tasks?status=bad',
    '/tasks?teamId=bad',
    '/tasks?assigneeId=bad',
    '/tasks?status=todo&status=done',
    '/tasks?search=' + 'x'.repeat(161),
    '/tasks?unexpected=true',
  ])
    await t.test('reject query ' + path.slice(0, 65), () => owner.send('get', path).expect(400));
  for (const method of ['post', 'patch', 'delete'])
    await t.test('require CSRF for ' + method, () =>
      owner.agent[method]('/api/teams/' + team.id)
        .send({ name: 'Changed' })
        .expect(403),
    );
  await t.test('reject disallowed request origin', () =>
    owner
      .send('post', '/teams', { name: 'Origin attack' })
      .set('Origin', 'https://malicious.example')
      .expect(403),
  );
  await t.test('reject malformed JSON', () =>
    owner
      .send('post', '/tasks')
      .set('Content-Type', 'application/json')
      .send('{"title":')
      .expect(400),
  );
  await t.test('limit request body size', () =>
    owner.send('post', '/tasks', { title: 'x'.repeat(40000) }).expect(413),
  );
  await t.test('reject prototype injection', () =>
    owner
      .send('post', '/tasks')
      .set('Content-Type', 'application/json')
      .send('{"teamId":"' + team.id + '","title":"safe","__proto__":{"admin":true}}')
      .expect(400),
  );
  await t.test('sanitize nested HTML and active content', async () => {
    const task = (
      await owner
        .send('post', '/tasks', {
          teamId: team.id,
          title: '<img src=x onerror=alert(1)>Safe title',
          description: '<svg onload=alert(1)>Hello</svg><script>bad()</script>',
        })
        .expect(201)
    ).body.task;
    assert.equal(task.title, 'Safe title');
    assert.equal(task.description, 'Hello');
  });
  await t.test('accept valid leap day and preserve fields on partial update', async () => {
    const task = (
      await owner
        .send('post', '/tasks', {
          teamId: team.id,
          title: 'Leap task',
          dueDate: '2028-02-29',
          priority: 'high',
          status: 'in_progress',
          assigneeId: owner.user.id,
        })
        .expect(201)
    ).body.task;
    const changed = (
      await owner.send('patch', '/tasks/' + task.id, { title: 'Renamed' }).expect(200)
    ).body.task;
    for (const key of [
      'teamId',
      'dueDate',
      'priority',
      'status',
      'assigneeId',
      'creatorId',
      'createdAt',
    ])
      assert.equal(changed[key], task[key]);
  });
  await t.test('responses never return password hashes or internal errors', async () => {
    const me = await owner.send('get', '/auth/me').expect(200);
    assert.deepEqual(Object.keys(me.body.user).sort(), ['email', 'id', 'name']);
    const broken = fixture();
    broken.store.query = async () => {
      throw new Error('DO_NOT_EXPOSE_DATABASE_PASSWORD');
    };
    const user = await actor(broken.app, 'Error User', 'errors@example.com');
    const response = await user.send('get', '/teams').expect(500);
    assert.ok(!JSON.stringify(response.body).includes('DO_NOT_EXPOSE'));
    assert.match(response.headers['cache-control'], /no-store/);
  });
  await t.test('security headers and no private caching', async () => {
    const response = await owner.send('get', '/tasks').expect(200);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN');
    assert.match(response.headers['cache-control'], /no-store/);
  });
});

test('team roles, invitation lifecycle, reminders and concurrency', async (t) => {
  const { app, store, service } = fixture();
  const owner = await actor(app, 'Lifecycle Owner', 'lifecycle-owner@example.com');
  const member = await actor(app, 'Lifecycle Member', 'lifecycle-member@example.com');
  const outsider = await actor(app, 'Lifecycle Outsider', 'lifecycle-outsider@example.com');
  const team = (await owner.send('post', '/teams', { name: 'Lifecycle team' }).expect(201)).body
    .team;
  await owner
    .send('post', '/teams/' + team.id + '/members', { email: member.user.email })
    .expect(201);
  await t.test('team membership lists are isolated', async () => {
    assert.equal((await outsider.send('get', '/teams').expect(200)).body.teams.length, 0);
    await outsider.send('get', '/teams/' + team.id + '/members').expect(404);
    await outsider
      .send('post', '/teams/' + team.id + '/members', { email: outsider.user.email })
      .expect(404);
    await member.send('delete', '/teams/' + team.id + '/members/' + owner.user.id).expect(403);
    await member
      .send('post', '/teams/' + team.id + '/invitations', { email: outsider.user.email })
      .expect(403);
  });
  await t.test('concurrent duplicate members add exactly one member', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        owner.send('post', '/teams/' + team.id + '/members', { email: outsider.user.email }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 7);
    await owner.send('delete', '/teams/' + team.id + '/members/' + outsider.user.id).expect(204);
  });
  await t.test('concurrent invitations prevent duplicate pending records', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        owner.send('post', '/teams/' + team.id + '/invitations', { email: outsider.user.email }),
      ),
    );
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 7);
    const invite = results.find((r) => r.status === 201).body.invitation;
    await outsider.send('post', '/invitations/' + invite.id + '/decline', {}).expect(204);
    assert.equal(
      (await outsider.send('get', '/invitations').expect(200)).body.invitations.length,
      0,
    );
    await outsider.send('post', '/invitations/' + invite.id + '/accept', {}).expect(404);
    assert.equal((await outsider.send('get', '/teams').expect(200)).body.teams.length, 0);
  });
  await t.test('invitation sent before registration can be accepted afterwards', async () => {
    const invite = (
      await owner
        .send('post', '/teams/' + team.id + '/invitations', { email: 'future-user@example.com' })
        .expect(201)
    ).body.invitation;
    const future = await actor(app, 'Future Member', 'future-user@example.com');
    await future.send('post', '/invitations/' + invite.id + '/accept', {}).expect(204);
    assert.equal((await future.send('get', '/teams').expect(200)).body.teams.length, 1);
  });
  await t.test(
    'reminders include only assigned unfinished deadlines up to three days',
    async () => {
      const date = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
      for (const [title, dueDate, status, assigneeId] of [
        ['overdue', date(-1), 'todo', member.user.id],
        ['today', date(0), 'todo', member.user.id],
        ['three days', date(3), 'todo', member.user.id],
        ['four days', date(4), 'todo', member.user.id],
        ['done', date(0), 'done', member.user.id],
        ['undated', null, 'todo', member.user.id],
        ['other user', date(0), 'todo', owner.user.id],
      ]) {
        await owner
          .send('post', '/tasks', { teamId: team.id, title, dueDate, status, assigneeId })
          .expect(201);
      }
      assert.deepEqual(
        (await member.send('get', '/reminders').expect(200)).body.tasks.map((x) => x.title),
        ['overdue', 'today', 'three days'],
      );
    },
  );
  await t.test('concurrent edits to different fields do not overwrite each other', async () => {
    const task = (
      await owner.send('post', '/tasks', { teamId: team.id, title: 'Concurrent edit' }).expect(201)
    ).body.task;
    await Promise.all([
      owner.send('patch', '/tasks/' + task.id, { title: 'Edited title' }).expect(200),
      member.send('patch', '/tasks/' + task.id, { priority: 'high' }).expect(200),
    ]);
    const final = (await owner.send('get', '/tasks/' + task.id).expect(200)).body.task;
    assert.equal(final.title, 'Edited title');
    assert.equal(final.priority, 'high');
  });
  await t.test(
    'capacity limit is enforced for member addition and invitation acceptance',
    async () => {
      const full = await service.createTeam(owner.user.id, { name: 'Full team', description: '' });
      await store.transaction(async (tx) =>
        tx.set('teams', full.id, {
          ...full,
          memberIds: [owner.user.id, ...Array.from({ length: 49 }, () => randomUUID())],
        }),
      );
      await owner
        .send('post', '/teams/' + full.id + '/members', { email: outsider.user.email })
        .expect(409);
      const invite = (
        await owner
          .send('post', '/teams/' + full.id + '/invitations', { email: outsider.user.email })
          .expect(201)
      ).body.invitation;
      await outsider.send('post', '/invitations/' + invite.id + '/accept', {}).expect(409);
      await outsider.send('post', '/invitations/' + invite.id + '/decline', {}).expect(204);
    },
  );
  await t.test('deletion prevents concurrent and future task access', async () => {
    const results = await Promise.all([
      owner.send('delete', '/teams/' + team.id),
      ...Array.from({ length: 10 }, (_, i) =>
        member.send('post', '/tasks', { teamId: team.id, title: 'Race ' + i }),
      ),
    ]);
    assert.equal(results[0].status, 204);
    assert.ok(results.slice(1).every((r) => [201, 404].includes(r.status)));
    assert.equal((await member.send('get', '/tasks').expect(200)).body.tasks.length, 0);
    assert.equal((await member.send('get', '/invitations').expect(200)).body.invitations.length, 0);
  });
});

test('authentication edge cases and replay protection', async (t) => {
  const { app } = fixture();
  const owner = await actor(app, 'Auth Owner', 'auth-owner@example.com', 'x'.repeat(72));
  await t.test('reject passwords exceeding bcrypt byte limit during registration', async () => {
    await owner
      .send('post', '/auth/register', {
        name: 'Too Long',
        email: 'toolong@example.com',
        password: 'x'.repeat(73),
      })
      .expect(400);
    await owner
      .send('post', '/auth/register', {
        name: 'Unicode',
        email: 'unicode@example.com',
        password: '😀'.repeat(19),
      })
      .expect(400);
  });
  await t.test('reject overlong login instead of authenticating a truncated password', () =>
    owner
      .send('post', '/auth/login', { email: owner.user.email, password: 'x'.repeat(72) + 'extra' })
      .expect(400),
  );
  await t.test('reject session cookies with forged signatures', () =>
    supertest(app)
      .get('/api/auth/me')
      .set('Cookie', 'teamspace.sid=s%3Aforged.invalid')
      .expect(401),
  );
  await t.test('a logged-out cookie and its CSRF token cannot be replayed', async () => {
    const login = await owner
      .send('post', '/auth/login', { email: owner.user.email, password: 'x'.repeat(72) })
      .expect(200);
    owner.setCsrf(login.body.csrfToken);
    const oldCookie = login.headers['set-cookie'][0].split(';')[0];
    await owner.send('post', '/auth/logout').expect(204);
    await supertest(app).get('/api/auth/me').set('Cookie', oldCookie).expect(401);
    await supertest(app)
      .post('/api/teams')
      .set('Cookie', oldCookie)
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ name: 'Replay attack' })
      .expect(403);
  });
});

test(
  'bounded local load: 2000 task requests, 20 concurrent workers, no cloud services',
  { timeout: 180000 },
  async (t) => {
    const { app } = fixture();
    const server = await new Promise((resolve) => {
      const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
    });
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const owner = await actor(server, 'Load Owner', 'load@example.com');
    const team = (await owner.send('post', '/teams', { name: 'Isolated local load' }).expect(201))
      .body.team;
    const count = 500,
      concurrency = 20,
      ids = [],
      latencies = [];
    const start = performance.now();
    async function timed(operation) {
      const before = performance.now();
      const value = await operation();
      latencies.push(performance.now() - before);
      return value;
    }
    await parallel(count, concurrency, async (i) => {
      ids[i] = (
        await timed(() =>
          owner
            .send('post', '/tasks', {
              teamId: team.id,
              title: 'Load task ' + i,
              priority: i % 2 ? 'high' : 'low',
              assigneeId: owner.user.id,
            })
            .expect(201),
        )
      ).body.task.id;
    });
    assert.equal(new Set(ids).size, count);
    await parallel(count, concurrency, async (i) => {
      const result = await timed(() => owner.send('get', '/tasks/' + ids[i]).expect(200));
      assert.equal(result.body.task.title, 'Load task ' + i);
    });
    await parallel(count, concurrency, async (i) => {
      await timed(() => owner.send('patch', '/tasks/' + ids[i], { status: 'done' }).expect(200));
    });
    const tasks = (await owner.send('get', '/tasks?teamId=' + team.id + '&status=done').expect(200))
      .body.tasks;
    assert.equal(tasks.length, count);
    await parallel(count, concurrency, async (i) => {
      await timed(() => owner.send('delete', '/tasks/' + ids[i]).expect(204));
    });
    assert.equal((await owner.send('get', '/tasks').expect(200)).body.tasks.length, 0);
    const elapsedMs = performance.now() - start;
    latencies.sort((a, b) => a - b);
    const result = {
      environment: 'isolated in-memory store; not a cloud capacity benchmark',
      operations: latencies.length,
      concurrency,
      taskCount: count,
      elapsedMs: Math.round(elapsedMs),
      requestsPerSecond: Math.round(latencies.length / (elapsedMs / 1000)),
      p50Ms: Math.round(latencies[Math.floor(latencies.length * 0.5)]),
      p95Ms: Math.round(latencies[Math.floor(latencies.length * 0.95)]),
      p99Ms: Math.round(latencies[Math.floor(latencies.length * 0.99)]),
      failedRequests: 0,
    };
    await mkdir('.artifacts', { recursive: true });
    await writeFile('.artifacts/load-results.json', JSON.stringify(result, null, 2));
    console.log('LOCAL_LOAD_RESULT ' + JSON.stringify(result));
  },
);
