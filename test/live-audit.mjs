// Explicit, low-volume production smoke test. Heavy load belongs in extended.test.js.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!process.argv.includes('--run-live'))
  throw new Error('Pass --run-live to create temporary audit records.');
const origin = 'https://team-task-manager-eta-two.vercel.app';
const projectId = 'team-task-manager-ac816';
const run = 'audit-' + Date.now() + '-' + randomBytes(3).toString('hex');
const password = randomBytes(24).toString('base64url');
const cleanupApp = initializeApp({ projectId, credential: applicationDefault() }, 'audit-cleanup');
const db = getFirestore(cleanupApp);
const users = [],
  createdDocs = [],
  actors = [],
  checks = [],
  browserErrors = [];
let browser,
  requestCount = 0,
  runError,
  cleanupError;
function track(collection, id) {
  assert.match(id, /^[a-f0-9-]{36}$/);
  createdDocs.push({ collection, id });
}
async function check(name, fn) {
  await fn();
  checks.push({ name, passed: true });
  console.log('LIVE_CHECK passed: ' + name);
}
async function api(actor, method, path, body, expected = 200) {
  assert.ok(++requestCount <= 100, 'Explicit live API request cap exceeded');
  const result = await actor.context.request.fetch(origin + '/api' + path, {
    method: method.toUpperCase(),
    headers: method === 'get' ? {} : { 'X-CSRF-Token': actor.csrf, Origin: origin },
    ...(body === undefined ? {} : { data: body }),
  });
  assert.equal(result.status(), expected, method + ' ' + path + ' returned unexpected status');
  return expected === 204 ? null : result.json();
}
async function register(role) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const actor = { context, csrf: '', email: run + '-' + role.toLowerCase() + '@example.com' };
  actors.push(actor);
  actor.csrf = (await api(actor, 'get', '/auth/csrf')).csrfToken;
  const result = await api(
    actor,
    'post',
    '/auth/register',
    { name: 'Audit ' + role, email: actor.email, password },
    201,
  );
  actor.user = result.user;
  actor.csrf = result.csrfToken;
  users.push({ id: result.user.id, email: actor.email });
  assert.equal(result.user.email, actor.email);
  assert.equal(result.user.passwordHash, undefined);
  return actor;
}
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const owner = await register('Owner'),
    member = await register('Member'),
    outsider = await register('Outsider');
  checks.push({
    name: 'Three unique temporary accounts registered through live API',
    passed: true,
  });
  const page = await owner.context.newPage();
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await check('Live browser login, password hashing and session reload', async () => {
    await api(owner, 'post', '/auth/logout', undefined, 204);
    await page.goto(origin);
    await page.getByLabel('Email address').fill(owner.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
    await page.getByRole('heading', { name: 'Workspace overview.' }).waitFor();
    await page.reload();
    await page.getByRole('heading', { name: 'Workspace overview.' }).waitFor();
    owner.csrf = (await api(owner, 'get', '/auth/csrf')).csrfToken;
    assert.equal((await api(owner, 'get', '/auth/me')).user.id, owner.user.id);
  });
  let team, task, invite;
  await check('Live team create, rename, and membership', async () => {
    team = (
      await api(owner, 'post', '/teams', { name: run, description: 'Temporary audit data' }, 201)
    ).team;
    track('teams', team.id);
    await api(owner, 'patch', '/teams/' + team.id, {
      name: run + ' renamed',
      description: 'Temporary audit data',
    });
    await api(owner, 'post', '/teams/' + team.id + '/members', { email: member.email }, 201);
    assert.equal((await api(member, 'get', '/teams/' + team.id + '/members')).members.length, 2);
    await api(member, 'delete', '/teams/' + team.id, undefined, 403);
    await api(outsider, 'get', '/teams/' + team.id, undefined, 404);
  });
  await check('Live task CRUD, assignment, search and filters', async () => {
    task = (
      await api(
        owner,
        'post',
        '/tasks',
        {
          teamId: team.id,
          title: run + ' task',
          description: 'Searchable audit description',
          assigneeId: member.user.id,
          status: 'in_progress',
          priority: 'high',
          dueDate: '2020-01-01',
        },
        201,
      )
    ).task;
    track('tasks', task.id);
    assert.equal(
      (
        await api(
          member,
          'get',
          '/tasks?teamId=' +
            team.id +
            '&assigneeId=' +
            member.user.id +
            '&status=in_progress&search=Searchable',
        )
      ).tasks.length,
      1,
    );
    await api(outsider, 'get', '/tasks/' + task.id, undefined, 404);
    await api(outsider, 'patch', '/tasks/' + task.id, { title: 'Forbidden' }, 404);
    await api(outsider, 'delete', '/tasks/' + task.id, undefined, 404);
    const changed = (
      await api(member, 'patch', '/tasks/' + task.id, { title: run + ' updated', status: 'todo' })
    ).task;
    assert.equal(changed.priority, 'high');
    assert.equal(changed.assigneeId, member.user.id);
  });
  await check('Live reminders, completion, and member removal safety', async () => {
    assert.ok((await api(member, 'get', '/reminders')).tasks.some((x) => x.id === task.id));
    await api(owner, 'delete', '/teams/' + team.id + '/members/' + member.user.id, undefined, 409);
    await api(member, 'patch', '/tasks/' + task.id, { status: 'done' });
    assert.ok(!(await api(member, 'get', '/reminders')).tasks.some((x) => x.id === task.id));
    await api(owner, 'patch', '/tasks/' + task.id, { assigneeId: null });
    await api(owner, 'delete', '/teams/' + team.id + '/members/' + member.user.id, undefined, 204);
    await api(member, 'get', '/tasks/' + task.id, undefined, 404);
  });
  await check(
    'Live invitation stub, duplicate protection and recipient-only acceptance',
    async () => {
      invite = (
        await api(owner, 'post', '/teams/' + team.id + '/invitations', { email: member.email }, 201)
      ).invitation;
      track('invitations', invite.id);
      assert.equal(invite.delivery, 'stubbed');
      await api(owner, 'post', '/teams/' + team.id + '/invitations', { email: member.email }, 409);
      assert.ok(
        (await api(member, 'get', '/invitations')).invitations.some((x) => x.id === invite.id),
      );
      await api(outsider, 'post', '/invitations/' + invite.id + '/accept', {}, 404);
      await api(member, 'post', '/invitations/' + invite.id + '/accept', {}, 204);
      assert.equal((await api(member, 'get', '/tasks/' + task.id)).task.id, task.id);
    },
  );
  await check('Live dashboard renders cloud records and remains responsive', async () => {
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await page.getByRole('button', { name: run + ' updated', exact: true }).waitFor();
    await page.getByLabel('Search tasks').fill('no matching audit task');
    await page.getByRole('heading', { name: 'No tasks match this view.' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await mkdir('.artifacts', { recursive: true });
    await page.screenshot({ path: '.artifacts/live-desktop.png', fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    await page.screenshot({ path: '.artifacts/live-mobile.png', fullPage: true });
  });
  await check('Live CSRF protection and secure cookies', async () => {
    const rejected = await owner.context.request.post(origin + '/api/teams', {
      data: { name: 'Rejected audit request' },
    });
    assert.equal(rejected.status(), 403);
    const cookie = (await owner.context.cookies()).find((x) => x.name === 'teamspace.sid');
    assert.ok(cookie?.secure);
    assert.ok(cookie?.httpOnly);
    assert.equal(cookie.sameSite, 'Lax');
  });
  await check('Live task deletion, team deletion and signed-out guards', async () => {
    await api(owner, 'delete', '/tasks/' + task.id, undefined, 204);
    await api(member, 'get', '/tasks/' + task.id, undefined, 404);
    await api(owner, 'delete', '/teams/' + team.id, undefined, 204);
    await api(member, 'get', '/teams/' + team.id, undefined, 404);
    for (const actor of actors) {
      await api(actor, 'post', '/auth/logout', undefined, 204);
      await api(actor, 'get', '/tasks', undefined, 401);
    }
  });
  assert.deepEqual(browserErrors, []);
  checks.push({ name: 'No unhandled live browser errors', passed: true });
} catch (error) {
  runError = error;
  console.error('Live audit failed: ' + error.message);
} finally {
  // Only identities and IDs created by this run can be removed. Existing application data is never queried or deleted.
  try {
    const allowedUsers = new Set(users.map((x) => x.id));
    for (const actor of actors) {
      if (actor.user) {
        try {
          const csrf = await actor.context.request.get(origin + '/api/auth/csrf');
          const token = (await csrf.json()).csrfToken;
          await actor.context.request.post(origin + '/api/auth/logout', {
            headers: { 'X-CSRF-Token': token, Origin: origin },
          });
        } catch {}
      }
    }
    const batch = db.batch();
    let removed = 0;
    for (const entry of createdDocs) {
      assert.ok(['teams', 'tasks', 'invitations'].includes(entry.collection));
      const ref = db.collection(entry.collection).doc(entry.id);
      const snapshot = await ref.get();
      if (snapshot.exists) {
        const data = snapshot.data();
        assert.ok(
          allowedUsers.has(data.creatorId || data.invitedBy),
          'Refusing cleanup outside audit owner scope',
        );
        batch.delete(ref);
        removed++;
      }
    }
    for (const user of users) {
      assert.ok(user.email.startsWith(run + '-') && user.email.endsWith('@example.com'));
      const ref = db.collection('users').doc(user.id);
      const snapshot = await ref.get();
      assert.equal(snapshot.data()?.email, user.email, 'Refusing to delete an unexpected account');
      batch.delete(ref);
      removed++;
      const emailRef = db
        .collection('emails')
        .doc(createHash('sha256').update(user.email).digest('hex'));
      const emailSnapshot = await emailRef.get();
      assert.equal(emailSnapshot.data()?.userId, user.id);
      batch.delete(emailRef);
      removed++;
    }
    if (removed) {
      await batch.commit();
      for (const user of users)
        assert.equal((await db.collection('users').doc(user.id).get()).exists, false);
    }
    checks.push({
      name: 'Temporary audit records removed without touching existing data',
      passed: true,
    });
  } catch (error) {
    cleanupError = error;
    console.error('Audit cleanup requires attention: ' + error.message);
  }
  await mkdir('.artifacts', { recursive: true });
  await writeFile(
    '.artifacts/live-audit-results.json',
    JSON.stringify(
      {
        run,
        origin,
        checks,
        explicitApiRequests: requestCount,
        browserErrors,
        error: runError?.message || null,
        cleanupError: cleanupError?.message || null,
        ...(cleanupError ? { cleanupManifest: { users, createdDocs } } : {}),
      },
      null,
      2,
    ),
  );
  await browser?.close();
  await deleteApp(cleanupApp);
}
if (runError || cleanupError) process.exitCode = 1;
else
  console.log(
    'Live audit: ' +
      checks.length +
      ' checks passed; temporary records cleaned up; ' +
      requestCount +
      ' explicit API calls.',
  );
