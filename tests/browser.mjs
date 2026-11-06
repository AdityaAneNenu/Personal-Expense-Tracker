import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';
import Papa from 'papaparse';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-spendwise';
process.env.FIREBASE_DATABASE_ID = '(default)';
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST, 'Run npm run test:browser to start the isolated Firebase emulators.');
const apiPort = Number(process.env.BROWSER_API_PORT || 3002);
const webPort = Number(process.env.BROWSER_WEB_PORT || 5174);
const targetUrl = `http://localhost:${webPort}`;
const apiUrl = `http://127.0.0.1:${apiPort}`;
const artifacts = path.join(root, 'docs/screenshots');
await mkdir(artifacts, { recursive: true });
await mkdir(path.join(root, 'test-results'), { recursive: true });
const { firebaseAuth, firestore, usersCollection, closeFirebase } = await import('../server/src/config/firebase.js');
const email = `browser-${randomUUID()}@example.test`;
const googleEmail = `browser-google-${randomUUID()}@example.test`;
const password = `Browser9!${randomUUID()}`;
const children = [];
const checks = [];
const errors = [];
let browser;
let page;
const check = name => { checks.push(name); console.log(`PASS ${name}`); };

function start(args, env) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  children.push(child);
  return { child, log: () => log };
}
async function ready(url, processInfo) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) throw new Error(`Server exited: ${processInfo.log()}`);
    try { if ((await fetch(url)).ok) return; } catch { /* Start-up retry. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Server unavailable: ${url}\n${processInfo.log()}`);
}
async function assertPortUnused(url) {
  try { await fetch(url, { signal: AbortSignal.timeout(800) }); }
  catch { return; }
  throw new Error(`A server is already running at ${url}; refusing to test an unverified instance. Change BROWSER_API_PORT/BROWSER_WEB_PORT.`);
}
async function navigate(route, heading) {
  await page.goto(`${targetUrl}${route}`);
  await page.getByRole('heading', { name: heading, exact: true }).waitFor();
}
async function assertReadable(selectors) {
  const results = await page.evaluate(selectors => {
    const parse = color => color.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
    const luminance = color => {
      const linear = color.slice(0, 3).map(value => { const channel = value / 255; return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4; });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    return selectors.map(selector => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('Missing contrast sample: ' + selector);
      const style = getComputedStyle(element);
      let parent = element;
      let background;
      while (parent) {
        background = parse(getComputedStyle(parent).backgroundColor);
        if (background.length < 4 || background[3] > 0) break;
        parent = parent.parentElement;
      }
      const a = luminance(parse(style.color));
      const b = luminance(background);
      return { selector, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  }, selectors);
  for (const result of results) assert.ok(result.ratio >= 4.5, result.selector + ' text contrast is ' + result.ratio.toFixed(2));
}

async function api(endpoint, options = {}) {
  return page.evaluate(async ({ endpoint, options }) => {
    const { request } = await import('/src/lib/api.js');
    return request(endpoint, options);
  }, { endpoint, options });
}

try {
  await assertPortUnused(`${apiUrl}/api/health`);
  await assertPortUnused(targetUrl);
  const backend = start(['server/src/index.js'], { NODE_ENV: 'test', PORT: String(apiPort), CLIENT_ORIGIN: targetUrl });
  await ready(`${apiUrl}/api/health`, backend);
  const frontend = start(['node_modules/vite/bin/vite.js', 'client', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], { NODE_ENV: 'development', API_PROXY_TARGET: apiUrl, VITE_USE_FIREBASE_EMULATORS: 'true', VITE_FIREBASE_API_KEY: 'demo-key', VITE_FIREBASE_AUTH_DOMAIN: 'demo-spendwise.firebaseapp.com', VITE_FIREBASE_PROJECT_ID: 'demo-spendwise', VITE_FIREBASE_APP_ID: '1:123456789:web:demo', VITE_FIREBASE_AUTH_EMULATOR_URL: `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}` });
  await ready(targetUrl, frontend);
  browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' || process.env.CI === 'true' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'dark' });
  // The emulator widget's optional fonts/Material assets must not delay its own event handlers.
  await context.route(/^https:\/\/(?:unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  // Hold React's entry point to verify the saved/system theme is painted first.
  let releaseEntry;
  const entryGate = new Promise(resolve => { releaseEntry = resolve; });
  const holdEntry = async route => { await entryGate; await route.continue(); };
  await page.route('**/src/main.jsx', holdEntry, { times: 1 });
  try {
    await page.goto(targetUrl + '/register', { waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.evaluate(() => document.querySelector('#root')?.childElementCount || 0), 0);
  } finally { releaseEntry(); }
  await page.getByRole('heading', { name: 'Create your account', exact: true }).waitFor();
  check('System dark mode is applied before React renders');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.reload();
  await page.getByRole('heading', { name: 'Create your account', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
  assert.equal(await page.evaluate(() => localStorage.getItem('spendwise-theme')), 'light');
  check('Explicit theme preference survives reload and overrides the device theme');

  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByText('Enter a name between 2 and 100 characters.', { exact: true }).waitFor();
  await page.getByLabel('Full name', { exact: true }).fill('Aarav Sharma');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByText('No expenses this month', { exact: true }).waitFor();
  check('Registration, form validation, authenticated dashboard and empty states');
  const signedInProfile = (await api('/auth/me')).data;
  await page.reload();
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  assert.equal((await api('/auth/me')).data.id, signedInProfile.id);
  assert.equal(await page.evaluate(() => fetch('/api/transactions').then(response => response.status)), 401);
  check('Firebase sign-in survives reload; financial APIs require a bearer token');

  const current = new Date();
  const year = current.getFullYear();
  const month = current.getMonth() + 1;
  const date = `${year}-${String(month).padStart(2, '0')}-12`;
  async function addTransaction(type, amount, category, description) {
    await navigate('/transactions/new', 'Add transaction');
    await page.getByRole('button', { name: type, exact: true }).click();
    await page.getByLabel('Amount (₹)', { exact: true }).fill(String(amount));
    await page.getByLabel('Transaction date', { exact: true }).fill(date);
    await page.getByLabel('Category', { exact: true }).selectOption({ label: category });
    await page.getByLabel('Description', { exact: true }).fill(description);
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
    await page.waitForURL('**/transactions');
    await page.getByRole('link', { name: description, exact: true }).waitFor();
  }
  await addTransaction('Income', 20000, 'Salary', 'Browser salary');
  await navigate('/budgets', 'Budgets');
  await page.getByRole('button', { name: 'Create budget', exact: true }).click();
  await page.getByLabel('Monthly limit (₹)', { exact: true }).fill('10000');
  await page.getByRole('dialog').getByRole('button', { name: 'Create budget', exact: true }).click();
  await page.getByRole('heading', { name: 'Overall budget', exact: true }).waitFor();
  await addTransaction('Expense', 7500, 'Food and groceries', 'Browser groceries');
  check('Income and expense creation; overall budget creation');

  await navigate('/dashboard', 'Dashboard');
  await page.getByRole('region', { name: 'Monthly summary' }).getByText('₹12,500.00', { exact: true }).waitFor();
  const summary = (await api(`/dashboard/summary?month=${month}&year=${year}`)).data;
  assert.equal(summary.income, 20000);
  assert.equal(summary.expenses, 7500);
  assert.equal(summary.net_savings, 12500);
  assert.equal(summary.overall_budget.status, 'WARNING');
  assert.equal(summary.overall_budget.utilization, 75);
  assert.equal(summary.category_breakdown[0].amount, 7500);
  assert.equal(await page.getByRole('img', { name: /Bar chart comparing/ }).count(), 1);
  assert.equal(await page.getByRole('img', { name: /Expense distribution/ }).count(), 1);
  assert.equal(await page.getByRole('img', { name: /Line chart/ }).count(), 1);
  check('Dashboard INR totals, budget utilization and all three real-data charts');

  await navigate('/alerts', 'Alerts');
  await page.getByText('75% threshold', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mark as read', exact: true }).click();
  await page.getByText('Read', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  await page.getByText('You’re all caught up', { exact: true }).waitFor();
  check('75% alert generation, mark as read and unread filter');

  await navigate('/transactions', 'Transactions');
  await page.getByRole('link', { name: 'Edit Browser groceries', exact: true }).click();
  await page.getByLabel('Amount (₹)', { exact: true }).fill('9200');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForURL('**/transactions');
  await navigate('/alerts', 'Alerts');
  await page.getByText('90% threshold', { exact: true }).waitFor();
  const alerts = (await api('/alerts')).data;
  assert.equal(alerts.length, 2);
  assert.ok(alerts.every(alert => alert.current_utilization === 92));
  check('Transaction editing updates totals and creates a distinct 90% alert');

  await navigate('/transactions', 'Transactions');
  await page.getByLabel('Search descriptions').fill('groceries');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByText('1 transaction in this view', { exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Browser salary', exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).click();
  await page.getByRole('link', { name: 'Browser salary', exact: true }).waitFor();
  check('Transaction search and reset affect actual results');

  await navigate('/categories', 'Categories');
  await page.getByRole('button', { name: 'Add category', exact: true }).click();
  await page.getByLabel('Category name').fill('Weekend plans');
  await page.getByRole('button', { name: 'Create category', exact: true }).click();
  await page.getByRole('heading', { name: 'Weekend plans', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Edit Weekend plans', exact: true }).click();
  await page.getByLabel('Category name').fill('Weekend outings');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('heading', { name: 'Weekend outings', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Delete Weekend outings', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('heading', { name: 'Weekend outings', exact: true }).waitFor({ state: 'detached' });
  check('Custom category creation, editing and confirmed deletion');

  // Add deterministic showcase data only to this isolated test account.
  const categoryRows = (await api('/categories')).data;
  const categoryId = name => categoryRows.find(category => category.name === name).id;
  for (let offset = 5; offset >= 0; offset--) {
    const period = new Date(year, month - 1 - offset, 1);
    const periodDate = `${period.getFullYear()}-${String(period.getMonth() + 1).padStart(2, '0')}`;
    for (const [category, type, amount, description, day] of [
      ['Salary', 'INCOME', 38000 + offset * 1700, 'Monthly salary', '01'],
      ['Accommodation', 'EXPENSE', 10500, 'Monthly rent', '03'],
      ['Transport', 'EXPENSE', 1650 + offset * 50, 'Metro pass', '06'],
      ['Utilities', 'EXPENSE', 1800, 'Internet and electricity', '09'],
      ['Shopping', 'EXPENSE', 3200 + offset * 80, 'Everyday essentials', '17'],
      ['Entertainment', 'EXPENSE', 1200, 'Weekend with friends', '20'],
    ]) await api('/transactions', { method: 'POST', body: { category_id: categoryId(category), type, amount, description, payment_method: 'UPI', transaction_date: `${periodDate}-${day}` } });
  }
  const budget = (await api(`/budgets?month=${month}&year=${year}`)).data[0];
  await api(`/budgets/${budget.id}`, { method: 'PUT', body: { category_id: null, amount: 35000, month, year } });
  await api('/budgets', { method: 'POST', body: { category_id: categoryId('Food and groceries'), amount: 10000, month, year } });
  await navigate('/dashboard', 'Dashboard');
  await page.getByRole('img', { name: /Expense distribution/ }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  // Chromium may omit fixed-sidebar descendants in full-page captures. A normal
  // viewport capture matches the actual visible application.
  await page.screenshot({ path: path.join(artifacts, 'dashboard-desktop.png'), fullPage: false });

  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await assertReadable(['.panel', '.theme-toggle', '.nav-link.active', '.button.primary', '.status-badge', '.comparison-direction.is-positive', '.comparison-direction.is-negative', '.comparison-note']);
  await page.locator('.recharts-bar-rectangle').first().hover();
  await page.locator('.recharts-tooltip-wrapper').first().waitFor({ state: 'visible' });
  await assertReadable(['.recharts-default-tooltip']);
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(artifacts, 'dashboard-dark-desktop.png'), fullPage: false });
  for (const width of [320, 375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    if (width === 375) await page.screenshot({ path: path.join(artifacts, 'dashboard-dark-mobile.png'), fullPage: true });
  }
  check('Dark dashboard, chart tooltip and key controls have readable contrast and fit 320-1440px');
  await page.setViewportSize({ width: 375, height: 900 });
  for (const [route, title] of [['/transactions', 'Transactions'], ['/transactions/new', 'Add transaction'], ['/categories', 'Categories'], ['/budgets', 'Budgets'], ['/reports', 'Reports'], ['/alerts', 'Alerts'], ['/profile', 'Your account']]) {
    await navigate(route, title);
    await page.getByRole('status').filter({ hasText: /Loading|Preparing/ }).waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    if (route === '/transactions/new') await assertReadable(['input', 'select', '.field label', '.button.primary']);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.getByText('System', { exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.getByRole('radio', { name: 'System', exact: true }).focus();
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.getByRole('radio', { name: 'Dark', exact: true }).isChecked(), true);
  check('Appearance settings follow device changes and support keyboard selection');
  await navigate('/budgets', 'Budgets');
  await page.getByRole('button', { name: 'Create budget', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await assertReadable(['.modal', '.modal input', '.modal select']);
  await page.screenshot({ path: path.join(artifacts, 'budget-dialog-dark.png'), fullPage: false });
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await navigate('/reports', 'Reports');
  await page.getByRole('img', { name: /Expense distribution/ }).waitFor();
  await page.screenshot({ path: path.join(artifacts, 'reports-dark.png'), fullPage: false });
  check('Dark mode covers every financial page and native form/dialog controls');
  await page.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await navigate('/dashboard', 'Dashboard');
  for (const width of [375, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
    const sizes = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(sizes.scroll <= sizes.width, `Horizontal page overflow at ${width}px: ${sizes.scroll}`);
    if (width === 375) {
      await page.screenshot({ path: path.join(artifacts, 'dashboard-mobile.png'), fullPage: true });
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Budgets', exact: true }).click();
      await page.getByRole('heading', { name: 'Budgets', exact: true }).waitFor();
      await navigate('/dashboard', 'Dashboard');
    }
  }
  check('Responsive dashboard at 375/768/1024/1440px and working mobile navigation');
  await page.setViewportSize({ width: 375, height: 900 });
  for (const [route, title] of [['/transactions', 'Transactions'], ['/transactions/new', 'Add transaction'], ['/categories', 'Categories'], ['/budgets', 'Budgets'], ['/reports', 'Reports'], ['/alerts', 'Alerts'], ['/profile', 'Your account']]) {
    await navigate(route, title);
    await page.getByRole('status').filter({ hasText: /Loading|Preparing/ }).waitFor({ state: 'detached' });
    await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  }
  await navigate('/budgets', 'Budgets');
  await page.getByRole('button', { name: 'Create budget', exact: true }).click();
  assert.ok(await page.getByRole('dialog').isVisible());
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.closest('dialog') !== null), true);
  await page.keyboard.press('Escape');
  await page.getByRole('dialog').waitFor({ state: 'detached' });
  check('All financial pages fit mobile; budget dialog keyboard focus and Escape work');
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [route, title, filename] of [['/transactions', 'Transactions', 'transactions.png'], ['/budgets', 'Budgets', 'budgets.png'], ['/reports', 'Reports', 'reports.png']]) {
    await navigate(route, title);
    await page.getByRole('status').filter({ hasText: /Loading|Preparing/ }).waitFor({ state: 'detached' });
    await page.screenshot({ path: path.join(artifacts, filename), fullPage: false });
  }
  await page.getByText('View monthly figures', { exact: true }).click();
  assert.ok(await page.getByRole('table', { name: 'Monthly income and expenses' }).isVisible());
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const download = await downloadPromise;
  assert.match(download.suggestedFilename(), /spendwise-report-\d{4}-\d{2}\.csv/);
  const csv = await readFile(await download.path(), 'utf8');
  assert.ok(csv.includes('Food and groceries') && csv.includes('Expenses (INR)'));
  await page.getByLabel('Month', { exact: true }).fill('2000-01');
  await page.getByText('No expenses this month', { exact: true }).waitFor();
  check('Reports, accessible data tables, CSV download and month filtering');

  await navigate('/transactions', 'Transactions');
  await page.getByLabel('Search descriptions').fill('Browser groceries');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByRole('button', { name: 'Delete Browser groceries', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByText('No transactions found', { exact: true }).waitFor();
  const finalSummary = (await api(`/dashboard/summary?month=${month}&year=${year}`)).data;
  assert.equal(finalSummary.expenses, 18350);
  assert.equal(finalSummary.overall_budget.status, 'NORMAL');
  const finalAlerts = (await api('/alerts')).data;
  assert.ok(finalAlerts.length > 0 && finalAlerts.every(alert => !alert.is_active));
  check('Confirmed transaction deletion recalculates totals and resolves historical alerts');

  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.waitForURL('**/login');
  if (await page.getByRole('button', { name: 'Dismiss notification', exact: true }).isVisible()) await page.getByRole('button', { name: 'Dismiss notification', exact: true }).click();
  await assertReadable(['.google-signin', '.auth-divider']);
  await page.screenshot({ path: path.join(artifacts, 'login.png'), fullPage: false });
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await assertReadable(['.auth-form-wrap', 'input', '.button.primary', '.theme-toggle', '.google-signin', '.auth-divider']);
  await page.screenshot({ path: path.join(artifacts, 'login-dark.png'), fullPage: false });
  await page.setViewportSize({ width: 320, height: 850 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({ path: path.join(artifacts, 'login-dark-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  check('Dark authentication screen and mobile theme toggle remain usable');
  await page.goto(`${targetUrl}/dashboard`);
  await page.waitForURL('**/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  check('Logout, protected route redirection and subsequent Firebase login');
  const secondTab = await context.newPage();
  await secondTab.goto(`${targetUrl}/dashboard`);
  await secondTab.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  assert.equal(await secondTab.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await secondTab.getByRole('button', { name: 'Switch to light mode', exact: true }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
  await page.getByRole('button', { name: 'Switch to dark mode', exact: true }).click();
  await secondTab.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  check('Theme preferences synchronize across tabs and survive sign-out/sign-in');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await secondTab.waitForURL('**/login');
  await secondTab.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  await secondTab.close();
  check('Firebase logout propagates to another browser tab');
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();

  async function openGooglePopup() {
    const opened = page.waitForEvent('popup');
    await page.getByRole('button', { name: 'Continue with Google', exact: true }).click();
    const popup = await opened;
    await popup.waitForLoadState('domcontentloaded');
    await popup.getByRole('button', { name: /Add new account/ }).waitFor();
    assert.equal(new URL(popup.url()).searchParams.get('providerId'), 'google.com');
    return popup;
  }
  const cancelledPopup = await openGooglePopup();
  assert.equal(await page.getByRole('button', { name: 'Sign in', exact: true }).isDisabled(), true);
  await cancelledPopup.close();
  await page.getByRole('alert').filter({ hasText: 'Google sign-in was cancelled.' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Continue with Google', exact: true }).isEnabled(), true);
  check('Cancelling Google sign-in restores the form and allows retry');

  await navigate('/register', 'Create your account');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await page.screenshot({ path: path.join(artifacts, 'register-dark-mobile.png'), fullPage: true });
  const newGooglePopup = await openGooglePopup();
  await newGooglePopup.getByRole('button', { name: /Add new account/ }).click();
  // These IDs belong to the Firebase emulator's form, whose labels lack associations.
  await newGooglePopup.locator('#email-input').fill(googleEmail);
  await newGooglePopup.locator('#display-name-input').fill('Google Browser Member');
  await newGooglePopup.getByRole('button', { name: /Sign in with Google/ }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  const googleProfile = (await api('/auth/me')).data;
  assert.equal(googleProfile.name, 'Google Browser Member');
  assert.equal(googleProfile.email, googleEmail);
  assert.notEqual(googleProfile.id, signedInProfile.id);
  assert.ok((await firebaseAuth.getUser(googleProfile.id)).providerData.some(provider => provider.providerId === 'google.com'));
  assert.equal((await api(`/dashboard/summary?month=${month}&year=${year}`)).data.expenses, 0);
  await addTransaction('Expense', 125, 'Food and groceries', 'Google account lunch');
  await page.reload();
  await page.getByRole('heading', { name: 'Transactions', exact: true }).waitFor();
  assert.equal((await api('/auth/me')).data.id, googleProfile.id);
  await page.getByRole('link', { name: 'Google account lunch', exact: true }).waitFor();
  check('Google registration creates a verified profile, saves expenses and survives reload');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.waitForURL('**/login');
  const returningGooglePopup = await openGooglePopup();
  await returningGooglePopup.getByText(googleEmail, { exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  assert.equal((await api('/auth/me')).data.id, googleProfile.id);
  assert.equal((await api(`/dashboard/summary?month=${month}&year=${year}`)).data.expenses, 125);
  check('Returning Google sign-in opens the same account and saved records');

  await api('/budgets', { method: 'POST', body: { category_id: null, amount: 1000, month, year } });
  await navigate('/transactions/new', 'Add transaction');
  await page.getByRole('link', { name: 'Import from CSV', exact: true }).click();
  await page.getByRole('heading', { name: 'Import from CSV', exact: true }).waitFor();
  const templateDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download template', exact: true }).click();
  const template = await templateDownload;
  assert.equal(template.suggestedFilename(), 'spendwise-expenses-template.csv');
  assert.ok((await readFile(await template.path(), 'utf8')).includes('Education'));
  const csvDate = day => `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  const importCsv = Papa.unparse([
    ['Date', 'Description', 'Amount', 'Category', 'Payment method'],
    [csvDate(5), 'University course, semester 1', '600.00', '', 'UPI'],
    [csvDate(6), 'Metro ticket', '80', 'Transport', 'Cash'],
    [csvDate(6), 'Metro ticket', '80', 'Transport', 'Cash'],
    [csvDate(7), 'Unclear purchase', '45.50', '', 'UPI'],
    [`31/02/${year}`, 'Bad date', '10', 'Food and groceries', 'Cash'],
    [csvDate(8), 'Weekly groceries', '200', 'Food and groceries', 'UPI'],
    [csvDate(12), 'Google account lunch', '125', 'Food and groceries', 'UPI'],
  ]);
  await page.getByLabel('Choose CSV file', { exact: true }).setInputFiles({ name: 'expenses.csv', mimeType: 'text/csv', buffer: Buffer.from('\uFEFF' + importCsv) });
  await page.getByRole('heading', { name: 'Match your columns', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review rows', exact: true }).click();
  await page.getByText('2 rows need attention', { exact: true }).waitFor();
  assert.equal(await page.getByRole('combobox', { name: 'Category, row 2', exact: true }).inputValue(), categoryId('Education'));
  await page.getByText('Already in your records · Will skip', { exact: true }).waitFor();
  await page.getByText('Repeated in this CSV · Will skip', { exact: true }).waitFor();
  assert.equal((await api('/transactions')).meta.total, 1, 'Preview must not save records.');
  await page.getByRole('combobox', { name: 'Category, row 5', exact: true }).selectOption({ label: 'Shopping' });
  await page.getByRole('checkbox', { name: 'Include row 6', exact: true }).uncheck();
  await page.getByRole('button', { name: 'Check changes', exact: true }).click();
  await page.getByText('4 rows ready to import', { exact: true }).waitFor();
  await page.locator('.import-table-panel .table-scroll').evaluate(element => { element.scrollLeft = 0; });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, 'csv-import-dark-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 375, height: 900 });
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth);
  await assertReadable(['.import-confirm', '.import-table input:not([type="checkbox"])', '.import-table select', '.import-warning']);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: path.join(artifacts, 'csv-import-dark-mobile.png'), fullPage: true });
  check('CSV mapping, education suggestions, editable review, duplicate checks and mobile layout');

  // The server commits, but the browser loses the response. A retry must reuse its import ID.
  await page.route('**/api/transactions/import', async route => {
    const response = await route.fetch();
    assert.equal(response.status(), 201);
    await route.abort('failed');
  }, { times: 1 });
  await page.getByRole('button', { name: 'Import 4 rows', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'You can retry this import safely.' }).waitFor();
  assert.equal((await api('/transactions')).meta.total, 5);
  await page.getByRole('button', { name: 'Import 4 rows', exact: true }).click();
  await page.getByRole('heading', { name: 'Import complete', exact: true }).waitFor();
  assert.equal((await api('/transactions')).meta.total, 5);
  const importedSummary = (await api(`/dashboard/summary?month=${month}&year=${year}`)).data;
  assert.equal(importedSummary.expenses, 1050.5);
  assert.equal(importedSummary.overall_budget.status, 'EXCEEDED');
  assert.deepEqual((await api('/alerts')).data.map(alert => alert.threshold_percent).sort((a, b) => a - b), [75, 90, 100]);
  check('CSV import saves reviewed rows and alerts once, including a lost-response retry');

  await api('/transactions/import', { method: 'POST', body: { import_id: randomUUID(), skip_duplicates: true, rows: Array.from({ length: 17 }, (_, index) => ({ source_row: index + 2, transaction: { category_id: categoryId('Education'), type: 'EXPENSE', amount: index + 1, description: `Export check ${index + 1}`, payment_method: 'UPI', transaction_date: `${year}-${String(month).padStart(2, '0')}-14` } })) } });
  await page.getByRole('link', { name: 'View transactions', exact: true }).click();
  await page.getByRole('heading', { name: 'Transactions', exact: true }).waitFor();
  await page.getByLabel('Search descriptions').fill('Export check');
  await page.getByRole('button', { name: 'Apply filters', exact: true }).click();
  await page.getByText('17 transactions in this view', { exact: true }).waitFor();
  const recordsDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
  const recordsFile = await recordsDownload;
  assert.match(recordsFile.suggestedFilename(), /^spendwise-transactions-/);
  const exportedRecords = Papa.parse(await readFile(await recordsFile.path(), 'utf8'), { header: true, skipEmptyLines: true });
  assert.equal(exportedRecords.errors.length, 0);
  assert.equal(exportedRecords.data.length, 17, 'Export must include matching rows beyond the visible page.');
  assert.ok(exportedRecords.data.every(row => row.Category === 'Education' && row.Description.startsWith('Export check')));
  assert.equal(exportedRecords.data.reduce((sum, row) => sum + Number(row.Amount), 0), 153);
  check('Transaction CSV export respects applied filters and includes every matching page');

  await navigate('/reports', 'Reports');
  const documentDownload = page.waitForEvent('download', { timeout: 45000 });
  await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
  const documentFile = await documentDownload;
  assert.equal(documentFile.suggestedFilename(), `spendwise-report-${year}-${String(month).padStart(2, '0')}.pdf`);
  const documentBytes = await readFile(await documentFile.path());
  assert.equal(documentBytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(documentBytes.length > 20000, 'The report includes embedded fonts and charts.');
  await documentFile.saveAs(path.join(root, 'test-results/report-export.pdf'));
  assert.equal((await api(`/dashboard/summary?month=${month}&year=${year}`)).data.expenses, 1203.5);
  check('PDF report downloads with the selected month, financial totals and embedded charts');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.waitForURL('**/login');

  assert.deepEqual(errors, [], 'No browser runtime errors');
  check('No browser JavaScript runtime errors');
  await writeFile(path.join(root, 'docs/browser-results.json'), JSON.stringify({ date: new Date().toISOString(), browser: 'Chromium', checks, runtime_errors: errors, screenshots: 'docs/screenshots', database: 'Firestore emulator', authentication: 'Firebase Auth emulator' }, null, 2));
  console.log(`Browser verification complete: ${checks.length} checks passed.`);
} catch (error) {
  if (page) await page.screenshot({ path: path.join(root, 'test-results/browser-failure.png'), fullPage: true }).catch(() => {});
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const child of children.reverse()) child.kill();
  // Exact generated emails: remove only this run's emulator accounts and documents.
  try {
    for (const accountEmail of [email, googleEmail]) {
      try {
        const account = await firebaseAuth.getUserByEmail(accountEmail);
        await firestore.recursiveDelete(usersCollection.doc(account.uid));
        await firebaseAuth.deleteUser(account.uid);
      } catch (error) {
        if (error.code !== 'auth/user-not-found') {
          console.error(`Emulator account cleanup failed: ${error.code || error.message}`);
          process.exitCode = 1;
        }
      }
    }
  } finally { await closeFirebase(); }
}
