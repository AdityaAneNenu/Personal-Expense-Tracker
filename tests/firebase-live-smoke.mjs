import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

assert.ok(!process.env.FIREBASE_AUTH_EMULATOR_HOST && !process.env.FIRESTORE_EMULATOR_HOST, 'This explicit live smoke check must run outside the emulator runner.');
process.env.NODE_ENV = 'development';
const { env } = await import('../server/src/config/env.js');
const { firebaseAuth, firestore, usersCollection, closeFirebase } = await import('../server/src/config/firebase.js');
assert.ok(!env.firebase.projectId.startsWith('demo-'), 'A configured live Firebase project is required.');
const root = fileURLToPath(new URL('../', import.meta.url));
const apiPort = Number(process.env.LIVE_API_PORT || 3004);
const webPort = Number(process.env.LIVE_WEB_PORT || 5175);
const apiUrl = `http://127.0.0.1:${apiPort}`;
const targetUrl = `http://localhost:${webPort}`;
const email = `spendwise-check-${randomUUID()}@example.test`;
const password = `Check9!${randomUUID()}`;
const children = [];
const checks = [];
const errors = [];
let browser;
let canCleanup = false;
let cleaned = false;
let passed = false;
const check = name => { checks.push(name); console.log(`PASS ${name}`); };

function start(args, extraEnv) {
  const child = spawn(process.execPath, args, { cwd: root, env: { ...process.env, ...extraEnv }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', value => { log += value; });
  child.stderr.on('data', value => { log += value; });
  children.push(child);
  return { child, log: () => log };
}

async function ready(url, processInfo) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (processInfo.child.exitCode !== null) throw new Error(`Server exited: ${processInfo.log()}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(2000) })).ok) return; } catch { /* Startup retry. */ }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`Server did not become ready: ${processInfo.log()}`);
}

try {
  try { await firebaseAuth.getUserByEmail(email); throw new Error('Refusing to reuse an existing account.'); }
  catch (error) { if (error.code !== 'auth/user-not-found') throw error; canCleanup = true; }
  for (const url of [apiUrl, targetUrl]) {
    let occupied = false;
    try { await fetch(url, { signal: AbortSignal.timeout(800) }); occupied = true; } catch { /* Expected unused port. */ }
    assert.equal(occupied, false, `Smoke-check port is already occupied: ${url}`);
  }
  await ready(`${apiUrl}/api/health`, start(['server/src/index.js'], { PORT: String(apiPort), CLIENT_ORIGIN: targetUrl }));
  await ready(targetUrl, start(['node_modules/vite/bin/vite.js', 'client', '--host', '127.0.0.1', '--port', String(webPort), '--strictPort'], {
    API_PROXY_TARGET: apiUrl, VITE_USE_FIREBASE_EMULATORS: 'false',
  }));
  browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' || process.env.CI === 'true' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  const api = (endpoint, options = {}) => page.evaluate(async ({ endpoint, options }) => {
    const { request } = await import('/src/lib/api.js');
    return request(endpoint, options);
  }, { endpoint, options });

  await page.goto(`${targetUrl}/register`);
  await page.getByLabel('Full name', { exact: true }).fill('Firebase verification');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  const profile = (await api('/auth/me')).data;
  assert.equal(profile.email, email);
  assert.equal(profile.name, 'Firebase verification');
  assert.equal((await firebaseAuth.getUser(profile.id)).email, email);
  check('Registration through the supplied live Firebase web configuration and verified server profile');

  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  await api('/budgets', { method: 'POST', body: { category_id: null, amount: 1000, month, year } });
  await page.goto(`${targetUrl}/transactions/new`);
  await page.getByLabel('Amount (₹)', { exact: true }).fill('750');
  await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Food and groceries' });
  await page.getByLabel('Description', { exact: true }).fill('Temporary Firebase verification expense');
  await page.getByRole('button', { name: 'Add transaction', exact: true }).click();
  await page.waitForURL('**/transactions');
  await page.getByRole('link', { name: 'Temporary Firebase verification expense', exact: true }).waitFor();
  const summary = (await api(`/dashboard/summary?month=${month}&year=${year}`)).data;
  assert.equal(summary.expenses, 750);
  assert.equal(summary.overall_budget.status, 'WARNING');
  assert.equal((await api('/alerts')).data.length, 1);
  const saved = await usersCollection.doc(profile.id).collection('transactions').get();
  assert.equal(saved.size, 1);
  assert.equal(saved.docs[0].data().amount_paise, 75000);
  check('Expense, budget totals, integer-paise storage and threshold alert persisted in live Firestore');

  await page.reload();
  await page.getByRole('heading', { name: 'Transactions', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Temporary Firebase verification expense', exact: true }).waitFor();
  check('Live Firebase sign-in and saved data survive browser reload');
  await page.getByRole('button', { name: 'Log out', exact: true }).click();
  await page.waitForURL('**/login');
  await page.getByLabel('Email address', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('**/dashboard');
  await page.getByRole('heading', { name: 'Dashboard', exact: true }).waitFor();
  assert.equal((await api(`/dashboard/summary?month=${month}&year=${year}`)).data.expenses, 750);
  check('Live Firebase logout and subsequent email/password login');
  assert.deepEqual(errors, [], 'No browser runtime errors');
  check('No browser JavaScript runtime errors');
  passed = true;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  for (const child of children.reverse()) {
    if (child.exitCode === null) { child.kill(); await new Promise(resolve => child.once('exit', resolve)); }
  }
  if (canCleanup) {
    try {
      const account = await firebaseAuth.getUserByEmail(email);
      assert.equal(account.email, email);
      await firestore.recursiveDelete(usersCollection.doc(account.uid));
      await firebaseAuth.deleteUser(account.uid);
      assert.equal((await usersCollection.doc(account.uid).get()).exists, false);
      cleaned = true;
      console.log('Temporary live Firebase account and its Firestore data removed.');
    } catch (error) {
      if (error.code === 'auth/user-not-found') cleaned = true;
      else { console.error(`Live check cleanup failed: ${error.code || error.message}`); process.exitCode = 1; }
    }
  }
  await closeFirebase();
  await mkdir(new URL('../docs/', import.meta.url), { recursive: true });
  await writeFile(new URL('../docs/firebase-live-results.json', import.meta.url), JSON.stringify({
    date: new Date().toISOString(), project: env.firebase.projectId, passed: passed && cleaned, checks, runtime_errors: errors, temporary_account_removed: cleaned,
  }, null, 2) + '\n');
}
