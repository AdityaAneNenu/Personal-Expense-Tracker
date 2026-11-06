import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('Vercel serves only the API and accepts only its deployment and configured origins', () => {
  // Run the production entrypoint with no live credentials or Firebase calls.
  // Empty values also prevent dotenv from loading local credentials into the child.
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import request from 'supertest';
    import app from './src/app.js';
    import { closeFirebase } from './src/config/firebase.js';

    try {
      for (const origin of ['https://spendwise-preview.vercel.app', 'https://spendwise.example']) {
        const response = await request(app).options('/api/transactions')
          .set('Origin', origin).set('Access-Control-Request-Method', 'POST').expect(204);
        assert.equal(response.headers['access-control-allow-origin'], origin);
      }
      await request(app).options('/api/transactions')
        .set('Origin', 'https://unrelated.vercel.app').expect(403);
      await request(app).options('/api/transactions')
        .set('Origin', 'https://spendwise-preview.vercel.app.attacker.example').expect(403);
      await request(app).get('/api/transactions').expect(401);
      await request(app).get('/api/auth/me').set('X-Forwarded-For', '198.51.100.1').expect(401);
      for (const path of ['/api', '/api/not-a-route', '/transactions']) {
        const response = await request(app).get(path).expect(404);
        assert.ok(response.headers['content-type'].startsWith('application/json'));
      }
    } finally { await closeFirebase(); }
  `], {
    cwd: new URL('../', import.meta.url),
    windowsHide: true,
    encoding: 'utf8',
    timeout: 20000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'spendwise-preview.vercel.app',
      CLIENT_ORIGIN: 'https://spendwise.example',
      PORT: '3001',
      FIREBASE_PROJECT_ID: 'demo-spendwise',
      FIREBASE_DATABASE_ID: '(default)',
      FIREBASE_SERVICE_ACCOUNT_PATH: '',
      GOOGLE_APPLICATION_CREDENTIALS: '',
      FIREBASE_CLIENT_EMAIL: '',
      FIREBASE_PRIVATE_KEY: '',
      FIREBASE_AUTH_EMULATOR_HOST: '',
      FIRESTORE_EMULATOR_HOST: '',
    },
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  assert.doesNotMatch(result.stderr, /ValidationError|ERR_ERL_/, 'The Vercel proxy is accepted by the rate limiter.');
});

test('Vercel defaults to the deployment origin when no custom domain is configured', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { env } from './src/config/env.js';
    assert.equal(env.clientOrigin, 'https://spendwise-preview.vercel.app');
    assert.deepEqual(env.allowedOrigins, ['https://spendwise-preview.vercel.app']);
  `], {
    cwd: new URL('../', import.meta.url),
    windowsHide: true,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      VERCEL_URL: 'spendwise-preview.vercel.app',
      CLIENT_ORIGIN: '',
      PORT: '3001',
      FIREBASE_PROJECT_ID: 'demo-spendwise',
      FIREBASE_AUTH_EMULATOR_HOST: '',
      FIRESTORE_EMULATOR_HOST: '',
    },
  });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
});
