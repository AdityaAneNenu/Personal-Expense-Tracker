import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { createServer as createHttpsServer } from 'node:https';
import { request as proxyRequest } from 'node:http';
import { chromium } from 'playwright';
import selfsigned from 'selfsigned';

assert.ok(!process.env.FIREBASE_AUTH_EMULATOR_HOST && !process.env.FIRESTORE_EMULATOR_HOST, 'Run the production smoke test outside the emulator runner. It uses a read-only live Firebase health check.');
const port = Number(process.env.PRODUCTION_TEST_PORT || 3003);
const base = `http://127.0.0.1:${port}`;
let child;
let browser;
let proxy;
try {
  let occupied = false;
  try { await fetch(base, { signal: AbortSignal.timeout(800) }); occupied = true; } catch { /* Expected: unused port. */ }
  assert.equal(occupied, false, 'Production smoke test requires an unused port.');
  // Keep production's HTTPS/CSP behavior intact. This certificate exists only in memory for this run.
  const certificate = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], { algorithm: 'sha256', notAfterDate: new Date(Date.now() + 86400000) });
  proxy = createHttpsServer({ key: certificate.private, cert: certificate.cert }, (req, res) => {
    const upstream = proxyRequest({ hostname: '127.0.0.1', port, path: req.url, method: req.method, headers: req.headers }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
  });
  await new Promise((resolve, reject) => { proxy.once('error', reject); proxy.listen(0, '127.0.0.1', resolve); });
  const browserOrigin = `https://127.0.0.1:${proxy.address().port}`;
  child = spawn(process.execPath, ['server/src/index.js'], { env: { ...process.env, NODE_ENV: 'production', PORT: String(port), CLIENT_ORIGIN: browserOrigin }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', value => { log += value; });
  child.stderr.on('data', value => { log += value; });
  const deadline = Date.now() + 30000;
  while (true) {
    assert.ok(child.exitCode === null, log);
    try { if ((await fetch(`${base}/api/health`)).ok) break; } catch { /* Readiness retry. */ }
    if (Date.now() > deadline) throw new Error(`Production server failed to start: ${log}`);
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  const index = await fetch(`${base}/transactions/firestore-document`);
  assert.equal(index.status, 200);
  const html = await index.text();
  assert.match(html, /<div id="root"><\/div>/);
  const csp = index.headers.get('content-security-policy');
  assert.ok(csp?.includes("default-src 'self'"));
  assert.ok(csp.includes('https://identitytoolkit.googleapis.com'));
  assert.ok(csp.includes('https://securetoken.googleapis.com'));
  assert.ok(csp.includes('https://*.firebaseapp.com'));
  assert.ok(csp.includes("script-src 'self' https://apis.google.com"), 'Firebase popup helper scripts are permitted.');
  assert.equal(index.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups', 'Google sign-in can communicate with its opener.');
  assert.ok(html.includes('src="/theme.js"'), 'Theme bootstrap is included in the production page.');
  assert.ok(html.indexOf('src="/theme.js"') < html.indexOf('src="/assets/'), 'Theme is restored before the application loads.');
  assert.equal((await fetch(`${base}/theme.js`)).status, 200);
  const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/)[1];
  assert.equal((await fetch(`${base}${asset}`)).status, 200);
  assert.equal((await fetch(`${base}/api/not-a-route`)).status, 404);
  assert.equal((await fetch(`${base}/api/transactions`)).status, 401);
  assert.equal((await fetch(`${base}/api/auth/me`)).status, 401);
  const builtAssets = await readdir('client/dist/assets');
  for (const filename of builtAssets) {
    if (!filename.endsWith('.js')) continue;
    const js = await readFile(`client/dist/assets/${filename}`, 'utf8');
    assert.ok(!/BEGIN PRIVATE KEY|firebase-adminsdk|FIREBASE_PRIVATE_KEY|private_key_id/.test(js), `Server credential material found in ${filename}`);
  }
  const pdfAsset = builtAssets.find(filename => /^reportPdf-.*\.js$/.test(filename));
  assert.ok(pdfAsset, 'The PDF report is available as a separate production chunk.');
  browser = await chromium.launch({ headless: process.env.PW_HEADLESS === 'true' || process.env.CI === 'true' });
  const page = await browser.newPage({ ignoreHTTPSErrors: true });
  page.setDefaultTimeout(15000);
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  await page.addInitScript(() => {
    globalThis.policyViolations = [];
    document.addEventListener('securitypolicyviolation', event => globalThis.policyViolations.push(event.violatedDirective));
  });
  await page.goto(`${browserOrigin}/login`);
  await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
  // Exercise the built exporter with synthetic figures. No sign-in or financial API write is needed.
  const [pdfDownload] = await Promise.all([
    page.waitForEvent('download', { timeout: 45000 }),
    page.evaluate(async asset => {
      const { downloadReportPdf } = await import(asset);
      await downloadReportPdf({
        period: { month: 11, year: 2026 }, name: 'Production verification',
        monthly: {
          monthly: Array.from({ length: 6 }, (_, index) => ({ month: index + 6, year: 2026, label: ['Jun 26', 'Jul 26', 'Aug 26', 'Sep 26', 'Oct 26', 'Nov 26'][index], income: index === 5 ? 1000 : 0, expenses: index === 5 ? 150.5 : 0 })),
          spending_trend: Array.from({ length: 30 }, (_, index) => ({ date: `2026-11-${String(index + 1).padStart(2, '0')}`, amount: index === 5 ? 150.5 : 0 })),
        },
        categories: [{ category_name: 'Education', amount: 150.5 }],
      });
    }, `/assets/${pdfAsset}`),
  ]);
  assert.equal(pdfDownload.suggestedFilename(), 'spendwise-report-2026-11.pdf');
  const pdfBytes = await readFile(await pdfDownload.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(pdfBytes.length > 20000);
  assert.deepEqual(runtimeErrors, [], 'No runtime errors in the production PDF exporter.');
  assert.deepEqual(await page.evaluate(() => globalThis.policyViolations), [], 'The PDF exporter respects production CSP.');
  console.log('PASS production SPA routing, built assets, Firebase CSP, protected APIs, PDF download under CSP, and absence of server credentials in browser bundles');
} catch (error) {
  const page = browser?.contexts()[0]?.pages()[0];
  if (page) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/production-failure.png', fullPage: true }).catch(() => {});
  }
  throw error;
} finally {
  if (browser) await browser.close();
  if (proxy) { proxy.closeAllConnections(); await new Promise(resolve => proxy.close(resolve)); }
  if (child && child.exitCode === null) {
    child.kill();
    await new Promise(resolve => child.once('exit', resolve));
  }
}
