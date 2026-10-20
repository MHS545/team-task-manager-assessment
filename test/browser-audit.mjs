import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { createApp } from '../server/app.js';
import { getConfig } from '../server/config.js';
import { memoryStore } from './memory-store.js';
const config = getConfig({ NODE_ENV: 'test', SESSION_SECRET: 'browser-audit-'.repeat(5) });
const { app, service } = createApp({ store: memoryStore(), config, disableRateLimit: true });
const password = 'Browser audit password 2026!';
const owner = await service.register({
  name: 'Audit Owner',
  email: 'browser-audit-owner@example.com',
  password,
});
const member = await service.register({
  name: 'Audit Member',
  email: 'browser-audit-member@example.com',
  password,
});
const team = await service.createTeam(owner.id, {
  name: 'Audit Design',
  description: 'Isolated browser audit',
});
const secondTeam = await service.createTeam(owner.id, {
  name: 'Audit Engineering',
  description: '',
});
await service.addMember(owner.id, team.id, member.email);
for (const [title, assigneeId, status, priority, teamId] of [
  ['Design review', member.id, 'todo', 'high', team.id],
  ['Completed design', owner.id, 'done', 'low', team.id],
  ['Engineering plan', owner.id, 'in_progress', 'medium', secondTeam.id],
])
  await service.createTask(owner.id, {
    title,
    assigneeId,
    status,
    priority,
    teamId,
    description: 'Audit fixture',
    dueDate: '2020-01-01',
  });
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const origin = 'http://127.0.0.1:' + server.address().port;
config.origins.push(origin);
let browser;
const checks = [],
  errors = [];
async function check(name, fn) {
  await fn();
  checks.push({ name, passed: true });
}
async function login(page, email) {
  await page.goto(origin);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in to your workspace' }).click();
  await page.getByRole('heading', { name: 'Workspace overview.' }).waitFor();
}
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  await check('Owner login and reload preserve authenticated session', async () => {
    await login(page, owner.email);
    await page.reload();
    await page.getByRole('heading', { name: 'Workspace overview.' }).waitFor();
    await expect(page.locator('tbody tr')).toHaveCount(3);
  });
  await check('Team filter shows only selected team records', async () => {
    await page.getByLabel('Filter by team').selectOption(team.id);
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await page.getByLabel('Filter by team').selectOption('');
  });
  await check('Assignee filter excludes other members tasks', async () => {
    await page.getByLabel('Filter by assignee').selectOption(member.id);
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Filter by assignee').selectOption('');
  });
  await check('Priority and search filters combine correctly', async () => {
    await page.getByLabel('Filter by priority').selectOption('high');
    await page.getByLabel('Search tasks').fill('Design');
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await page.getByLabel('Search tasks').fill('no such task');
    await page.getByRole('heading', { name: 'No tasks match this view.' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  });
  await check('Task dialog traps keyboard focus and Escape restores focus', async () => {
    const trigger = page.getByRole('button', { name: 'Create task', exact: true });
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const focusable = dialog.locator(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    );
    await focusable.first().focus();
    await page.keyboard.press('Shift+Tab');
    await expect(focusable.last()).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(focusable.first()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
  await check('Required task title prevents an empty form submission', async () => {
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
    assert.equal(
      await dialog.getByLabel('Task title').evaluate((el) => el.validity.valueMissing),
      true,
    );
    await page.keyboard.press('Escape');
  });
  await check('No page overflow at seven desktop, tablet and mobile widths', async () => {
    await mkdir('.artifacts', { recursive: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const width of [320, 360, 390, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await expect
        .poll(
          () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
          { message: 'Page overflow at width ' + width, timeout: 5000 },
        )
        .toBe(true)
        .catch(async (error) => {
          console.log(
            'LAYOUT ' +
              JSON.stringify(
                await page.evaluate(() => ({
                  viewport: innerWidth,
                  root: document.documentElement.scrollWidth,
                  body: document.body.scrollWidth,
                  elements: [...document.querySelectorAll('body *')]
                    .filter((el) => {
                      const r = el.getBoundingClientRect();
                      return (
                        r.width > 0 &&
                        (r.right > innerWidth + 1 || el.scrollWidth > el.clientWidth + 2)
                      );
                    })
                    .slice(0, 30)
                    .map((el) => ({
                      tag: el.tagName,
                      class: typeof el.className === 'string' ? el.className : 'svg',
                      left: Math.round(el.getBoundingClientRect().left),
                      right: Math.round(el.getBoundingClientRect().right),
                      width: Math.round(el.getBoundingClientRect().width),
                      scroll: el.scrollWidth,
                      client: el.clientWidth,
                      overflow: getComputedStyle(el).overflowX,
                      position: getComputedStyle(el).position,
                    })),
                })),
              ),
          );
          throw error;
        });
      await page.screenshot({ path: '.artifacts/audit-width-' + width + '.png', fullPage: true });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
  });
  await check('Member sees only their team and no creator management controls', async () => {
    const memberContext = await browser.newContext();
    const memberPage = await memberContext.newPage();
    memberPage.on('pageerror', (error) => errors.push(error.message));
    await login(memberPage, member.email);
    await expect(memberPage.locator('tbody tr')).toHaveCount(2);
    await memberPage
      .getByRole('navigation', { name: 'Workspace navigation' })
      .getByRole('button', { name: /^Teams/ })
      .click();
    await memberPage.getByRole('heading', { name: 'Your teams.' }).waitFor();
    await expect(
      memberPage.getByRole('button', { name: 'Delete ' + team.name, exact: true }),
    ).toHaveCount(0);
    await expect(
      memberPage.getByRole('button', { name: 'Edit ' + team.name, exact: true }),
    ).toHaveCount(0);
    await memberPage.getByRole('button', { name: 'Members', exact: true }).click();
    await expect(memberPage.getByRole('button', { name: 'Add member', exact: true })).toHaveCount(
      0,
    );
    await expect(
      memberPage.getByRole('button', { name: 'Invite by email', exact: true }),
    ).toHaveCount(0);
    await memberContext.close();
  });
  await check('Network failure shows retry controls and recovers', async () => {
    await page.route('**/api/tasks', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Temporary audit outage' }),
      }),
    );
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Temporary audit outage' }).waitFor();
    await page.unroute('**/api/tasks');
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.load-error')).toHaveCount(0);
  });
  await check('Expired session returns user to sign-in', async () => {
    await page.route('**/api/tasks', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Please sign in to continue.' }),
      }),
    );
    await page.getByRole('button', { name: 'Refresh workspace', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  });
  assert.deepEqual(errors, [], 'No unhandled browser JavaScript errors');
  checks.push({ name: 'No unhandled browser JavaScript errors', passed: true });
  await writeFile(
    '.artifacts/browser-audit-results.json',
    JSON.stringify({ environment: 'isolated local data', checks, errors }, null, 2),
  );
  console.log(
    'Extended Chrome audit: ' + checks.length + ' checks passed; 7 viewport screenshots saved.',
  );
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
  await mkdir('.artifacts', { recursive: true });
  await writeFile(
    '.artifacts/browser-audit-results.json',
    JSON.stringify({ checks, error: error.message }, null, 2),
  );
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
