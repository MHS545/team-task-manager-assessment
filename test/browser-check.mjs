import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { createApp } from '../server/app.js';
import { getConfig } from '../server/config.js';
import { memoryStore } from './memory-store.js';

// UI integration only: runs real React + Express with an isolated test database.
const config = getConfig({ NODE_ENV: 'test', SESSION_SECRET: 'browser-check-'.repeat(5) });
const { app } = createApp({ store: memoryStore(), config, disableRateLimit: true });
const server = await new Promise((resolve) => {
  const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
});
const origin = 'http://127.0.0.1:' + server.address().port;
config.origins.push(origin);
let browser;
const failures = [];
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (error) => failures.push(error.message));
  await page.goto(origin);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByLabel('Full name').fill('Browser Owner');
  await page.getByLabel('Email address').fill('browser-owner@example.com');
  await page.getByLabel('Password', { exact: true }).fill('Browser test password 123');
  await page.getByRole('button', { name: 'Create your account', exact: true }).click();
  await page.getByRole('heading', { name: 'Workspace overview.' }).waitFor();
  await page.getByRole('button', { name: 'New team', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Team name').fill('Product Studio');
  await dialog.getByLabel('Description (optional)').fill('A team for thoughtful work.');
  await dialog.getByRole('button', { name: 'Create team', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Create task', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Task title').fill('Ship the dashboard');
  await dialog.getByLabel('Description', { exact: true }).fill('Check task interactions.');
  await dialog.getByLabel('Assign to').selectOption({ label: 'Browser Owner' });
  await dialog.getByLabel('Status', { exact: true }).selectOption('in_progress');
  await dialog.getByLabel('Due date (optional)').fill('2020-01-01');
  await dialog.getByRole('button', { name: 'Create task', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Ship the dashboard', exact: true }).waitFor();
  await page.getByLabel('Search tasks').fill('nothing matches');
  await page.getByRole('heading', { name: 'No tasks match this view.' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Ship the dashboard', exact: true }).click();
  await page.getByRole('button', { name: 'Reopen Ship the dashboard', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Ship the dashboard', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('Task title').fill('Polish the dashboard');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Polish the dashboard', exact: true }).waitFor();
  await page.getByLabel('Filter by priority').selectOption('high');
  await page.getByRole('heading', { name: 'No tasks match this view.' }).waitFor();
  await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
  await page.getByLabel('Filter by assignee').selectOption({ label: 'Browser Owner' });
  await page.getByRole('button', { name: 'Polish the dashboard', exact: true }).waitFor();
  await mkdir('.artifacts', { recursive: true });
  await page.screenshot({ path: '.artifacts/dashboard-desktop.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Desktop page should not overflow horizontally',
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page
    .getByRole('navigation', { name: 'Workspace navigation' })
    .getByRole('button', { name: /^Teams/ })
    .click();
  await page.getByRole('heading', { name: 'Your teams.' }).waitFor();
  await page.getByRole('button', { name: 'Members', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Invite by email', exact: true }).click();
  await dialog.getByLabel('Email address').fill('future@example.com');
  await dialog.getByRole('button', { name: 'Create invitation', exact: true }).click();
  await dialog.getByRole('status').waitFor();
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.screenshot({ path: '.artifacts/teams-mobile.png', fullPage: true });
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    'Mobile page should not overflow horizontally',
  );
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('heading', { name: 'Welcome back.' }).waitFor();
  await page.screenshot({ path: '.artifacts/signin-mobile.png', fullPage: true });
  assert.deepEqual(failures, [], 'Browser must have no unhandled errors');
  console.log(
    'Chrome UI integration passed: registration, teams, task create/edit/complete, filters, invitation stub, responsive layouts, logout.',
  );
  console.log(
    'Screenshots saved in .artifacts/. Database was an isolated test double, not Firestore.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
