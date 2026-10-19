import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import supertest from 'supertest';
import { createApp } from '../server/app.js';
import { getConfig } from '../server/config.js';
import { memoryStore } from './memory-store.js';

test('assessment authentication, teams, tasks, and security integration', async (t) => {
  const store = memoryStore();
  const config = getConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: 'a'.repeat(48),
    APP_ORIGIN: 'http://localhost:5173',
  });
  const { app, service } = createApp({ store, config, disableRateLimit: true });
  async function actor(name, email) {
    const agent = supertest.agent(app);
    let csrf = (await agent.get('/api/auth/csrf').expect(200)).body.csrfToken;
    const registration = await agent
      .post('/api/auth/register')
      .set('X-CSRF-Token', csrf)
      .send({ name, email, password: 'correct horse 123' })
      .expect(201);
    csrf = registration.body.csrfToken;
    return {
      agent,
      user: registration.body.user,
      registration,
      send(method, path, body, expected) {
        return agent[method]('/api' + path)
          .set('X-CSRF-Token', csrf)
          .send(body)
          .expect(expected);
      },
    };
  }
  const owner = await actor('Team Owner', 'owner@example.com');
  const member = await actor('Team Member', 'member@example.com');
  const outsider = await actor('Other Team', 'outsider@example.com');
  let team, task;

  await t.test('anonymous callers cannot access any workspace endpoint', async () => {
    for (const path of ['/teams', '/tasks', '/invitations', '/reminders', '/not-a-route']) {
      await supertest(app)
        .get('/api' + path)
        .expect(401);
    }
  });
  await t.test(
    'HTTP-only cookies, password hashing, duplicate email prevention, and CSRF',
    async () => {
      assert.match(owner.registration.headers['set-cookie'].join(';'), /HttpOnly/);
      assert.match(owner.registration.headers['set-cookie'].join(';'), /SameSite=Lax/);
      assert.equal(owner.user.passwordHash, undefined);
      const stored = await service.user(owner.user.id);
      assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
      assert.ok(await bcrypt.compare('correct horse 123', stored.passwordHash));
      await owner.send(
        'post',
        '/auth/register',
        { name: 'Duplicate', email: 'OWNER@EXAMPLE.COM', password: 'correct horse 123' },
        409,
      );
      await owner.agent.post('/api/teams').send({ name: 'Attack' }).expect(403);
      await owner.agent
        .post('/api/teams')
        .set('X-CSRF-Token', 'x'.repeat(64))
        .send({ name: 'Attack' })
        .expect(403);
      await owner.send('post', '/teams', { name: 'Allowed' }, 201);
    },
  );
  await t.test('create and edit a team; sanitize HTML; reject unknown properties', async () => {
    team = (
      await owner.send(
        'post',
        '/teams',
        { name: '<b>Product</b>', description: '<script>alert(1)</script>A good team' },
        201,
      )
    ).body.team;
    assert.equal(team.name, 'Product');
    assert.equal(team.description, 'A good team');
    await owner.send(
      'patch',
      '/teams/' + team.id,
      { name: 'Product & Design', description: 'Ship good work.' },
      200,
    );
    await owner.send('post', '/teams', { name: 'Bad', creatorId: outsider.user.id }, 400);
    await outsider.send('get', '/teams/' + team.id, undefined, 404);
    await owner.send('get', '/teams/not-a-uuid', undefined, 400);
  });
  await t.test('only creators manage members and membership is validated', async () => {
    await owner.send('post', '/teams/' + team.id + '/members', { email: member.user.email }, 201);
    await owner.send('post', '/teams/' + team.id + '/members', { email: member.user.email }, 409);
    await member.send('patch', '/teams/' + team.id, { name: 'Takeover', description: '' }, 403);
    await member.send('delete', '/teams/' + team.id, undefined, 403);
    await member.send(
      'post',
      '/teams/' + team.id + '/members',
      { email: outsider.user.email },
      403,
    );
    const members = (await owner.send('get', '/teams/' + team.id + '/members', undefined, 200)).body
      .members;
    assert.equal(members.length, 2);
    assert.ok(members.every((user) => !user.passwordHash));
    await owner.send('delete', '/teams/' + team.id + '/members/' + owner.user.id, undefined, 400);
  });
  await t.test('create, assign, validate, and filter tasks; block cross-team access', async () => {
    await owner.send(
      'post',
      '/tasks',
      { teamId: team.id, title: 'Invalid assignee', assigneeId: outsider.user.id },
      400,
    );
    await owner.send(
      'post',
      '/tasks',
      { teamId: team.id, title: 'Invalid date', dueDate: '2026-02-30' },
      400,
    );
    await owner.send('post', '/tasks', { teamId: team.id, title: '<script>bad</script>' }, 400);
    task = (
      await owner.send(
        'post',
        '/tasks',
        {
          teamId: team.id,
          title: '<b>Ship dashboard</b>',
          description: 'Make it clear',
          assigneeId: member.user.id,
          dueDate: '2020-01-01',
          status: 'in_progress',
          priority: 'high',
        },
        201,
      )
    ).body.task;
    assert.equal(task.title, 'Ship dashboard');
    const filtered = await member.send(
      'get',
      '/tasks?teamId=' +
        team.id +
        '&assigneeId=' +
        member.user.id +
        '&search=dashboard&status=in_progress',
      undefined,
      200,
    );
    assert.equal(filtered.body.tasks.length, 1);
    await outsider.send('get', '/tasks/' + task.id, undefined, 404);
    await outsider.send('get', '/tasks?teamId=' + team.id, undefined, 404);
    await outsider.send('patch', '/tasks/' + task.id, { title: 'Stolen' }, 404);
    await outsider.send('delete', '/tasks/' + task.id, undefined, 404);
    await owner.send('patch', '/tasks/' + task.id, { teamId: randomUUID() }, 400);
    await owner.send('patch', '/tasks/' + task.id, {}, 400);
    await member.send('get', '/tasks?status=invalid', undefined, 400);
  });
  await t.test('login-only reminders and member removal safety', async () => {
    const reminders = (await member.send('get', '/reminders', undefined, 200)).body.tasks;
    assert.equal(reminders.length, 1);
    await owner.send('delete', '/teams/' + team.id + '/members/' + member.user.id, undefined, 409);
    await member.send('patch', '/tasks/' + task.id, { status: 'done' }, 200);
    assert.equal((await member.send('get', '/reminders', undefined, 200)).body.tasks.length, 0);
    await owner.send('patch', '/tasks/' + task.id, { assigneeId: null }, 200);
    await owner.send('delete', '/teams/' + team.id + '/members/' + member.user.id, undefined, 204);
    await member.send('get', '/tasks/' + task.id, undefined, 404);
  });
  await t.test(
    'invitation stub supports pending, recipient-only acceptance, and duplicates',
    async () => {
      const result = await owner.send(
        'post',
        '/teams/' + team.id + '/invitations',
        { email: member.user.email },
        201,
      );
      assert.equal(result.body.invitation.delivery, 'stubbed');
      const invitation = result.body.invitation;
      await owner.send(
        'post',
        '/teams/' + team.id + '/invitations',
        { email: member.user.email },
        409,
      );
      assert.equal(
        (await member.send('get', '/invitations', undefined, 200)).body.invitations.length,
        1,
      );
      await outsider.send('post', '/invitations/' + invitation.id + '/accept', {}, 404);
      await member.send('post', '/invitations/' + invitation.id + '/accept', {}, 204);
      await member.send('post', '/invitations/' + invitation.id + '/accept', {}, 404);
      await member.send('get', '/tasks/' + task.id, undefined, 200);
    },
  );
  await t.test('delete a task and atomically make deleted teams inaccessible', async () => {
    await owner.send('delete', '/tasks/' + task.id, undefined, 204);
    await owner.send('get', '/tasks/' + task.id, undefined, 404);
    const retained = (
      await member.send('post', '/tasks', { teamId: team.id, title: 'Team retained record' }, 201)
    ).body.task;
    await owner.send('delete', '/teams/' + team.id, undefined, 204);
    await member.send('get', '/tasks/' + retained.id, undefined, 404);
    await member.send('post', '/tasks', { teamId: team.id, title: 'Write after deletion' }, 404);
    assert.ok(
      !(await member.send('get', '/tasks', undefined, 200)).body.tasks.some(
        (task) => task.id === retained.id,
      ),
    );
  });
  await t.test('login failure, origin protection, session regeneration, and logout', async () => {
    const agent = supertest.agent(app);
    const first = await agent.get('/api/auth/csrf').expect(200);
    const csrf = first.body.csrfToken;
    await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: owner.user.email, password: 'wrong' })
      .expect(401);
    await agent
      .post('/api/auth/login')
      .set('Origin', 'https://attacker.example')
      .set('X-CSRF-Token', csrf)
      .send({ email: owner.user.email, password: 'correct horse 123' })
      .expect(403);
    const signedIn = await agent
      .post('/api/auth/login')
      .set('X-CSRF-Token', csrf)
      .send({ email: ' OWNER@EXAMPLE.COM ', password: 'correct horse 123' })
      .expect(200);
    assert.notEqual(signedIn.body.csrfToken, csrf);
    assert.notEqual(
      first.headers['set-cookie'][0].split(';')[0],
      signedIn.headers['set-cookie'][0].split(';')[0],
    );
    await agent.post('/api/auth/logout').set('X-CSRF-Token', signedIn.body.csrfToken).expect(204);
    await agent.get('/api/auth/me').expect(401);
    await agent.get('/api/tasks').expect(401);
  });
});

test('production fails closed without required secrets and PostgreSQL', () => {
  assert.throws(() => getConfig({ NODE_ENV: 'production' }), /DATABASE_URL/);
  assert.throws(
    () => getConfig({ NODE_ENV: 'production', DATABASE_URL: 'postgres://example' }),
    /SESSION_SECRET/,
  );
  assert.throws(
    () =>
      getConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://example',
        SESSION_SECRET: 'a'.repeat(48),
        APP_ORIGIN: 'http://example.com',
      }),
    /HTTPS/,
  );
});

test('registration is atomic when the same email is registered concurrently', async () => {
  const { service } = createApp({
    store: memoryStore(),
    config: getConfig({ NODE_ENV: 'test' }),
    disableRateLimit: true,
  });
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      service.register({
        name: 'Concurrent User',
        email: 'same@example.com',
        password: 'a secure password',
      }),
    ),
  );
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
});

test('authentication endpoints are rate limited', async () => {
  const { app } = createApp({ store: memoryStore(), config: getConfig({ NODE_ENV: 'test' }) });
  const agent = supertest.agent(app);
  const csrf = (await agent.get('/api/auth/csrf')).body.csrfToken;
  for (let index = 0; index < 30; index++)
    await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({}).expect(400);
  await agent.post('/api/auth/login').set('X-CSRF-Token', csrf).send({}).expect(429);
});

test('production cookies are Secure, HTTP-only, and SameSite=Lax', async () => {
  const config = getConfig({
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://unused-test-only',
    SESSION_SECRET: 'production-test-'.repeat(4),
    APP_ORIGIN: 'https://teamspace.example',
  });
  const { default: session } = await import('express-session');
  const { app } = createApp({
    store: memoryStore(),
    config,
    sessionStore: new session.MemoryStore(),
    disableRateLimit: true,
  });
  const first = await supertest(app)
    .get('/api/auth/csrf')
    .set('X-Forwarded-Proto', 'https')
    .expect(200);
  const response = await supertest(app)
    .post('/api/auth/register')
    .set('X-Forwarded-Proto', 'https')
    .set('Origin', 'https://teamspace.example')
    .set('Cookie', first.headers['set-cookie'][0].split(';')[0])
    .set('X-CSRF-Token', first.body.csrfToken)
    .send({ name: 'Secure Cookie', email: 'secure@example.com', password: 'secure password 123' })
    .expect(201);
  const cookie = response.headers['set-cookie'].join(';');
  assert.match(cookie, /; Secure/);
  assert.match(cookie, /; HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
});
