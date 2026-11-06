import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

// Refuse to load live credentials or run financial tests against a real project.
process.env.NODE_ENV = 'test';
process.env.FIREBASE_PROJECT_ID = 'demo-spendwise';
process.env.FIREBASE_DATABASE_ID = '(default)';
assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST, 'Run npm run test:server from the root to start both Firebase emulators.');
const { default: app } = await import('../src/app.js');
const { firestore, firebaseAuth, usersCollection, closeFirebase } = await import('../src/config/firebase.js');
const origin = process.env.CLIENT_ORIGIN || 'http://localhost:5173';
const password = 'SpendWise!Test123';
const userIds = new Set();
let categories;

async function authCall(operation, body) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${operation}?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function user() {
  const email = `qa-${randomUUID()}@example.test`;
  const signup = await authCall('signUp', { email, password, returnSecureToken: true });
  assert.equal(signup.status, 200, signup.body.error?.message);
  userIds.add(signup.body.localId);
  await firebaseAuth.updateUser(signup.body.localId, { displayName: 'QA Student' });
  const agent = request.agent(app).set('Authorization', `Bearer ${signup.body.idToken}`);
  const profile = await agent.get('/api/auth/me').expect(200);
  return { agent, email, token: signup.body.idToken, user: profile.body.data };
}

function write(client, method, url, body = {}) {
  return client.agent[method](url).set('Origin', origin).send(body);
}

function category(type = 'EXPENSE') {
  const match = categories.find(item => item.type === type && item.user_id === null);
  assert.ok(match, `A built-in ${type} category must be available without seeding.`);
  return match.id;
}

function transaction(overrides = {}) {
  return { category_id: category(), type: 'EXPENSE', amount: 100, description: 'QA purchase', payment_method: 'UPI', transaction_date: '2026-10-12', ...overrides };
}

async function addTransaction(client, overrides = {}) {
  return (await write(client, 'post', '/api/transactions', transaction(overrides)).expect(201)).body.data;
}

async function addBudget(client, overrides = {}) {
  return (await write(client, 'post', '/api/budgets', { category_id: null, amount: 1000, month: 10, year: 2026, ...overrides }).expect(201)).body.data;
}

async function budgets(client, month = 10, year = 2026) {
  return (await client.agent.get('/api/budgets').query({ month, year }).expect(200)).body.data;
}

async function alerts(client) {
  return (await client.agent.get('/api/alerts').expect(200)).body.data;
}

before(async () => {
  const client = await user();
  categories = (await client.agent.get('/api/categories').expect(200)).body.data;
});

after(async () => {
  try {
    for (const uid of userIds) {
      await firestore.recursiveDelete(usersCollection.doc(uid));
      await firebaseAuth.deleteUser(uid);
    }
  } finally { await closeFirebase(); }
});

test('Firebase registration returns a verified UID profile and stores no password or application session', async () => {
  const client = await user();
  const me = await client.agent.get('/api/auth/me').expect(200);
  assert.equal(me.body.data.email, client.email);
  assert.equal(me.body.data.id, (await firebaseAuth.getUser(client.user.id)).uid);
  assert.equal(me.body.data.name, 'QA Student');
  assert.equal(me.headers['set-cookie'], undefined);
  const stored = (await usersCollection.doc(client.user.id).get()).data();
  assert.deepEqual(Object.keys(stored).sort(), ['created_at', 'email', 'name', 'revision']);
  assert.ok(!JSON.stringify(stored).includes(password));
});

test('Firebase rejects invalid registration, duplicate email and incorrect passwords', async () => {
  const client = await user();
  assert.equal((await authCall('signUp', { email: 'invalid', password, returnSecureToken: true })).status, 400);
  assert.equal((await authCall('signUp', { email: client.email, password, returnSecureToken: true })).status, 400);
  assert.equal((await authCall('signInWithPassword', { email: client.email, password: 'Incorrect123!', returnSecureToken: true })).status, 400);
  const login = await authCall('signInWithPassword', { email: client.email, password, returnSecureToken: true });
  assert.equal(login.status, 200);
  const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${login.body.idToken}`).expect(200);
  assert.equal(response.body.data.id, client.user.id);
});

test('anonymous requests and legacy cookies cannot authenticate financial APIs', async () => {
  for (const path of ['/api/auth/me', '/api/transactions', '/api/categories', '/api/budgets?month=10&year=2026', '/api/alerts', '/api/dashboard/summary?month=10&year=2026']) {
    await request(app).get(path).expect(401);
    await request(app).get(path).set('Cookie', 'spendwise_session=not-an-identity').expect(401);
  }
  await request(app).post('/api/auth/login').send({ email: 'unused@example.test', password }).expect(404);
});

test('malformed, expired and wrong-project ID tokens are rejected', async () => {
  const client = await user();
  await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token').expect(401);
  const [header, payload, signature] = client.token.split('.');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
  for (const override of [{ exp: 1 }, { aud: 'demo-another-project' }]) {
    const token = [header, Buffer.from(JSON.stringify({ ...claims, ...override })).toString('base64url'), signature].join('.');
    await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`).expect(401);
  }
});

test('disabled and revoked Firebase identities cannot use previously issued tokens', async () => {
  const disabled = await user();
  await firebaseAuth.updateUser(disabled.user.id, { disabled: true });
  await disabled.agent.get('/api/transactions').expect(401);
  const revoked = await user();
  // Firebase revocation uses whole seconds; advance beyond token auth_time.
  await new Promise(resolve => setTimeout(resolve, 1100));
  await firebaseAuth.revokeRefreshTokens(revoked.user.id);
  await revoked.agent.get('/api/transactions').expect(401);
});

test('bearer-authenticated writes enforce the configured browser origin', async () => {
  const client = await user();
  await client.agent.post('/api/transactions').set('Origin', 'https://attacker.example').send(transaction()).expect(403);
  await request(app).post('/api/transactions').set('Origin', origin).send(transaction()).expect(401);
  const preflight = await request(app).options('/api/transactions').set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization,content-type').expect(204);
  assert.match(preflight.headers['access-control-allow-headers'], /Authorization/);
  await write(client, 'post', '/api/transactions', transaction()).expect(201);
});

test('Firestore rules reject direct browser reads and writes even for a signed-in user', async () => {
  const client = await user();
  const url = `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/demo-spendwise/databases/(default)/documents/users/${client.user.id}`;
  for (const headers of [{}, { Authorization: `Bearer ${client.token}` }]) {
    const read = await fetch(url, { headers });
    assert.equal(read.status, 403);
    const write = await fetch(url, { method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: { name: { stringValue: 'Forged' } } }) });
    assert.equal(write.status, 403);
  }
  assert.equal((await client.agent.get('/api/auth/me').expect(200)).body.data.name, 'QA Student');
});

test('custom category CRUD, duplicate protection, and shared category protection', async () => {
  const client = await user();
  const created = await write(client, 'post', '/api/categories', { name: 'Study supplies', type: 'EXPENSE' }).expect(201);
  const id = created.body.data.id;
  await write(client, 'post', '/api/categories', { name: 'study supplies', type: 'EXPENSE' }).expect(409);
  const updated = await write(client, 'put', `/api/categories/${id}`, { name: 'Books and stationery', type: 'EXPENSE' }).expect(200);
  assert.equal(updated.body.data.name, 'Books and stationery');
  await write(client, 'delete', `/api/categories/${id}`).expect(204);
  await write(client, 'put', `/api/categories/${category()}`, { name: 'Changed shared', type: 'EXPENSE' }).expect(403);
  await write(client, 'delete', `/api/categories/${category()}`).expect(403);
});

test('category ownership and type are enforced, and referenced categories cannot change type or be deleted', async () => {
  const owner = await user();
  const stranger = await user();
  const own = (await write(owner, 'post', '/api/categories', { name: 'Private expense', type: 'EXPENSE' }).expect(201)).body.data;
  const otherCategories = (await stranger.agent.get('/api/categories').expect(200)).body.data;
  assert.ok(!otherCategories.some(item => item.id === own.id));
  await write(stranger, 'put', `/api/categories/${own.id}`, { name: 'Hijacked', type: 'EXPENSE' }).expect(404);
  await write(stranger, 'delete', `/api/categories/${own.id}`).expect(404);
  const foreignUse = await write(stranger, 'post', '/api/transactions', transaction({ category_id: own.id }));
  assert.ok([404, 422].includes(foreignUse.status));
  await write(owner, 'post', '/api/transactions', transaction({ category_id: category('INCOME') })).expect(422);
  await addTransaction(owner, { category_id: own.id });
  await write(owner, 'delete', `/api/categories/${own.id}`).expect(409);
  await write(owner, 'put', `/api/categories/${own.id}`, { name: own.name, type: 'INCOME' }).expect(409);
});

test('transactions create, retrieve, edit and delete with real persistence', async () => {
  const client = await user();
  const created = await addTransaction(client, { amount: 123.45, description: 'Library books' });
  assert.equal(created.amount, 123.45);
  assert.equal(created.transaction_date, '2026-10-12');
  assert.equal(created.user_id, client.user.id);
  const read = await client.agent.get(`/api/transactions/${created.id}`).expect(200);
  assert.equal(read.body.data.description, 'Library books');
  const edited = await write(client, 'put', `/api/transactions/${created.id}`, transaction({ amount: 234.56, description: 'Updated books', payment_method: 'CASH' })).expect(200);
  assert.equal(edited.body.data.amount, 234.56);
  assert.equal(edited.body.data.payment_method, 'CASH');
  await write(client, 'delete', `/api/transactions/${created.id}`).expect(204);
  await client.agent.get(`/api/transactions/${created.id}`).expect(404);
});

test('other users cannot read, modify, delete, or list another user transaction', async () => {
  const owner = await user();
  const stranger = await user();
  const created = await addTransaction(owner);
  await stranger.agent.get(`/api/transactions/${created.id}`).expect(404);
  await write(stranger, 'put', `/api/transactions/${created.id}`, transaction({ amount: 1 })).expect(404);
  await write(stranger, 'delete', `/api/transactions/${created.id}`).expect(404);
  const spoofedQuery = await stranger.agent.get('/api/transactions').query({ user_id: owner.user.id });
  assert.ok([200, 422].includes(spoofedQuery.status));
  if (spoofedQuery.status === 200) assert.equal(spoofedQuery.body.meta.total, 0);
  const list = await stranger.agent.get('/api/transactions').expect(200);
  assert.equal(list.body.meta.total, 0);
  const spoof = await write(stranger, 'post', '/api/transactions', { ...transaction(), user_id: owner.user.id });
  assert.ok([201, 422].includes(spoof.status));
  if (spoof.status === 201) assert.equal(spoof.body.data.user_id, stranger.user.id);
});

test('invalid money, dates, categories, payment methods and pagination reject consistently', async () => {
  const client = await user();
  for (const override of [{ amount: 0 }, { amount: -1 }, { amount: 1.001 }, { amount: 1.0000000001 }, { amount: 10000000000 }, { amount: 'NaN' }, { transaction_date: '2026-02-30' }, { transaction_date: '12/10/2026' }, { category_id: -1 }, { type: 'REFUND' }, { payment_method: 'CHEQUE' }]) {
    const response = await write(client, 'post', '/api/transactions', transaction(override)).expect(422);
    assert.equal(typeof response.body.error.code, 'string');
  }
  for (const query of [{ page: 0 }, { page_size: 101 }, { sort_by: 'password_hash' }, { sort_order: 'sideways' }, { start_date: '2026-10-20', end_date: '2026-10-01' }]) {
    await client.agent.get('/api/transactions').query(query).expect(422);
  }
});

test('filters, search, sorting and pagination select the intended transaction rows', async () => {
  const client = await user();
  await addTransaction(client, { amount: 300, description: 'Campus lunch', transaction_date: '2026-10-10' });
  await addTransaction(client, { amount: 200, description: 'Campus dinner', transaction_date: '2026-10-11' });
  await addTransaction(client, { amount: 100, description: 'Campus August', transaction_date: '2026-08-11' });
  await addTransaction(client, { amount: 5000, type: 'INCOME', category_id: category('INCOME'), description: 'Campus stipend' });
  const result = await client.agent.get('/api/transactions').query({ start_date: '2026-10-01', end_date: '2026-10-31', category_id: category(), type: 'EXPENSE', search: 'Campus', sort_by: 'amount', sort_order: 'asc', page: 1, page_size: 1 }).expect(200);
  assert.deepEqual(result.body.meta, { page: 1, page_size: 1, total: 2, total_pages: 2 });
  assert.equal(result.body.data[0].description, 'Campus dinner');
  const second = await client.agent.get('/api/transactions').query({ type: 'EXPENSE', start_date: '2026-10-01', sort_by: 'amount', sort_order: 'asc', page: 2, page_size: 1 }).expect(200);
  assert.equal(second.body.data[0].amount, 300);
});

test('query-like strings remain ordinary text and unrecognized sort fields are rejected', async () => {
  const client = await user();
  const literal = '${notExecutable} {"$where":"anything"} ../private';
  await addTransaction(client, { description: literal });
  await addTransaction(client, { description: 'Unrelated entry' });
  const result = await client.agent.get('/api/transactions').query({ search: literal }).expect(200);
  assert.equal(result.body.meta.total, 1);
  assert.equal(result.body.data[0].description, literal);
  await client.agent.get('/api/transactions').query({ sort_by: '../private' }).expect(422);
});

test('overall/category budgets are unique per period, positive, owned, and restricted to expense categories', async () => {
  const owner = await user();
  const stranger = await user();
  const overall = await addBudget(owner);
  await write(owner, 'post', '/api/budgets', { category_id: null, amount: 2000, month: 10, year: 2026 }).expect(409);
  await addBudget(owner, { category_id: category() });
  await write(owner, 'post', '/api/budgets', { category_id: category(), amount: 2000, month: 10, year: 2026 }).expect(409);
  for (const override of [{ amount: 0 }, { amount: -1 }, { amount: 1.001 }, { month: 13 }, { year: 1999 }, { category_id: category('INCOME') }]) {
    await write(owner, 'post', '/api/budgets', { category_id: null, amount: 1000, month: 11, year: 2026, ...override }).expect(422);
  }
  assert.equal((await budgets(stranger)).length, 0);
  await write(stranger, 'put', `/api/budgets/${overall.id}`, { category_id: null, amount: 1, month: 10, year: 2026 }).expect(404);
  await write(stranger, 'delete', `/api/budgets/${overall.id}`).expect(404);
});

test('budgets exclude income and expenses outside their category or calendar month', async () => {
  const client = await user();
  const ownCategory = (await write(client, 'post', '/api/categories', { name: 'Special expenses', type: 'EXPENSE' }).expect(201)).body.data;
  await addBudget(client);
  await addBudget(client, { category_id: ownCategory.id });
  await addTransaction(client, { amount: 100, category_id: ownCategory.id });
  await addTransaction(client, { amount: 200 });
  await addTransaction(client, { amount: 900, category_id: ownCategory.id, transaction_date: '2026-09-30' });
  await addTransaction(client, { amount: 5000, type: 'INCOME', category_id: category('INCOME') });
  const result = await budgets(client);
  const overall = result.find(item => item.category_id === null);
  const specific = result.find(item => item.category_id === ownCategory.id);
  assert.equal(overall.spent, 300);
  assert.equal(overall.remaining, 700);
  assert.equal(overall.utilization, 30);
  assert.equal(specific.spent, 100);
  assert.equal(specific.status, 'NORMAL');
});

test('exact threshold boundaries create one alert each and preserve truthful history after decreases', async () => {
  const client = await user();
  await addBudget(client);
  const expense = await addTransaction(client, { amount: 749.99 });
  assert.equal((await budgets(client))[0].status, 'NORMAL');
  assert.equal((await alerts(client)).length, 0);
  for (const [amount, status, count] of [[750, 'WARNING', 1], [900, 'HIGH', 2], [1000, 'EXCEEDED', 3]]) {
    await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ amount })).expect(200);
    const current = (await budgets(client))[0];
    assert.equal(current.status, status);
    assert.equal(current.utilization, amount / 10);
    assert.equal((await alerts(client)).length, count);
  }
  await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ amount: 1100 })).expect(200);
  assert.equal((await alerts(client)).length, 3);
  assert.equal((await budgets(client))[0].remaining, -100);
  await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ amount: 700 })).expect(200);
  const history = await alerts(client);
  assert.deepEqual(history.map(item => item.threshold_percent).sort((a, b) => a - b), [75, 90, 100]);
  assert.ok(history.every(item => item.current_utilization === 70 && !item.is_active));
  await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ amount: 1000 })).expect(200);
  assert.equal((await alerts(client)).length, 3);
  await write(client, 'delete', `/api/transactions/${expense.id}`).expect(204);
  assert.equal((await budgets(client))[0].spent, 0);
  assert.ok((await alerts(client)).every(item => item.current_utilization === 0 && !item.is_active));
});

test('rounded display percentages never trigger a threshold before actual spending reaches it', async () => {
  const client = await user();
  await addBudget(client, { amount: 10000 });
  await addTransaction(client, { amount: 7499.99 });
  assert.equal((await budgets(client))[0].status, 'NORMAL');
  assert.equal((await alerts(client)).length, 0);
});

test('concurrent expense writes serialize budget calculations and deduplicate thresholds', async () => {
  const client = await user();
  await addBudget(client);
  await Promise.all([addTransaction(client, { amount: 500 }), addTransaction(client, { amount: 500 })]);
  assert.equal((await budgets(client))[0].spent, 1000);
  const result = await alerts(client);
  assert.equal(result.length, 3);
  assert.equal(new Set(result.map(item => item.threshold_percent)).size, 3);
});

test('moving expenses between months and changing them to income updates all affected budgets', async () => {
  const client = await user();
  await addBudget(client);
  await addBudget(client, { month: 11 });
  const expense = await addTransaction(client, { amount: 950 });
  await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ amount: 950, transaction_date: '2026-11-01' })).expect(200);
  assert.equal((await budgets(client, 10))[0].spent, 0);
  assert.equal((await budgets(client, 11))[0].spent, 950);
  let history = await alerts(client);
  assert.ok(history.filter(item => item.month === 10).every(item => !item.is_active && item.current_utilization === 0));
  assert.ok(history.filter(item => item.month === 11).every(item => item.is_active && item.current_utilization === 95));
  await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ type: 'INCOME', category_id: category('INCOME'), amount: 950, transaction_date: '2026-11-01' })).expect(200);
  assert.equal((await budgets(client, 11))[0].spent, 0);
  history = await alerts(client);
  assert.ok(history.every(item => !item.is_active));
});

test('budgets created after spending generate alerts; changing budget scope clears outdated threshold history', async () => {
  const client = await user();
  await addTransaction(client, { amount: 1100 });
  const budget = await addBudget(client);
  assert.equal(budget.status, 'EXCEEDED');
  assert.equal((await alerts(client)).length, 3);
  await write(client, 'put', `/api/budgets/${budget.id}`, { category_id: null, amount: 1000, month: 11, year: 2026 }).expect(200);
  assert.equal((await alerts(client)).length, 0);
  await addTransaction(client, { amount: 800, transaction_date: '2026-11-12' });
  assert.equal((await alerts(client)).length, 1);
  await write(client, 'delete', `/api/budgets/${budget.id}`).expect(204);
  assert.equal((await alerts(client)).length, 0);
});

test('changing budget amount preserves history, while changing category resets the old category history', async () => {
  const client = await user();
  const custom = (await write(client, 'post', '/api/categories', { name: 'New budget category', type: 'EXPENSE' }).expect(201)).body.data;
  const budget = await addBudget(client, { category_id: category() });
  const expense = await addTransaction(client, { amount: 800 });
  const originalAlert = (await alerts(client))[0];
  const raised = await write(client, 'put', `/api/budgets/${budget.id}`, { category_id: category(), amount: 2000, month: 10, year: 2026 }).expect(200);
  assert.equal(raised.body.data.utilization, 40);
  const preserved = await alerts(client);
  assert.equal(preserved[0].id, originalAlert.id);
  assert.equal(preserved[0].is_active, false);
  await write(client, 'put', `/api/budgets/${budget.id}`, { category_id: custom.id, amount: 1000, month: 10, year: 2026 }).expect(200);
  assert.equal((await alerts(client)).length, 0);
  await write(client, 'put', `/api/transactions/${expense.id}`, transaction({ category_id: custom.id, amount: 950 })).expect(200);
  assert.equal((await budgets(client))[0].spent, 950);
  const newAlerts = await alerts(client);
  assert.equal(newAlerts.length, 2);
  assert.ok(newAlerts.every(item => item.category_name === custom.name && item.current_utilization === 95));
});

test('alerts enforce ownership and support marking read and filtering unread', async () => {
  const owner = await user();
  const stranger = await user();
  await addBudget(owner);
  await addTransaction(owner, { amount: 800 });
  const alert = (await alerts(owner))[0];
  assert.equal(alert.threshold_percent, 75);
  assert.equal(alert.current_utilization, 80);
  assert.ok(alert.created_at);
  assert.equal((await alerts(stranger)).length, 0);
  await write(stranger, 'patch', `/api/alerts/${alert.id}/read`).expect(404);
  const marked = await write(owner, 'patch', `/api/alerts/${alert.id}/read`).expect(200);
  assert.ok(marked.body.data.is_read);
  const unread = await owner.agent.get('/api/alerts').query({ unread: 'true' }).expect(200);
  assert.equal(unread.body.data.length, 0);
});

test('dashboard and reports aggregate real data and zero-fill six months and calendar days', async () => {
  const client = await user();
  await addTransaction(client, { amount: 200 });
  await addTransaction(client, { amount: 100, transaction_date: '2026-10-13' });
  await addTransaction(client, { type: 'INCOME', category_id: category('INCOME'), amount: 5000 });
  await addTransaction(client, { amount: 450, transaction_date: '2026-09-14' });
  const summary = (await client.agent.get('/api/dashboard/summary').query({ month: 10, year: 2026 }).expect(200)).body.data;
  assert.equal(summary.income, 5000);
  assert.equal(summary.expenses, 300);
  assert.equal(summary.net_savings, 4700);
  assert.equal(summary.overall_budget, null);
  assert.equal(summary.monthly.length, 6);
  assert.equal(summary.monthly.at(-1).expenses, 300);
  assert.equal(summary.monthly.at(-2).expenses, 450);
  assert.equal(summary.monthly[0].expenses, 0);
  assert.equal(summary.spending_trend.length, 31);
  assert.equal(summary.spending_trend.find(item => item.date === '2026-10-12').amount, 200);
  assert.equal(summary.category_breakdown.reduce((sum, item) => sum + item.amount, 0), 300);
  const reports = (await client.agent.get('/api/reports/monthly').query({ month: 10, year: 2026 }).expect(200)).body.data;
  assert.deepEqual(reports.monthly, summary.monthly);
  const breakdown = (await client.agent.get('/api/reports/category-breakdown').query({ month: 10, year: 2026 }).expect(200)).body.data;
  assert.deepEqual(breakdown, summary.category_breakdown);
  const february = (await client.agent.get('/api/reports/monthly').query({ month: 2, year: 2024 }).expect(200)).body.data;
  assert.equal(february.spending_trend.length, 29);
});

test('empty dashboard is safe and validation/unknown-route failures use a consistent envelope', async () => {
  const client = await user();
  const summary = (await client.agent.get('/api/dashboard/summary').query({ month: 1, year: 2026 }).expect(200)).body.data;
  assert.equal(summary.income, 0);
  assert.equal(summary.expenses, 0);
  assert.equal(summary.net_savings, 0);
  assert.deepEqual(summary.recent_transactions, []);
  assert.deepEqual(summary.category_breakdown, []);
  assert.equal(summary.monthly.length, 6);
  assert.equal(summary.spending_trend.length, 31);
  for (const path of ['/api/dashboard/summary?month=13&year=2026', '/api/reports/monthly?month=0&year=2026', '/api/alerts?month=10']) {
    const response = await client.agent.get(path).expect(422);
    assert.equal(typeof response.body.error.message, 'string');
  }
  const unknown = await client.agent.get('/api/not-a-route').expect(404);
  assert.equal(typeof unknown.body.error.code, 'string');
});

test('concurrent duplicate category and budget creation allows exactly one of each', async () => {
  const client = await user();
  for (const [path, body] of [['/api/categories', { name: 'Concurrent category', type: 'EXPENSE' }], ['/api/budgets', { category_id: null, amount: 1000, month: 10, year: 2026 }]]) {
    const responses = await Promise.all([write(client, 'post', path, body), write(client, 'post', path, body)]);
    assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  }
});

test('amounts are stored in integer paise and category renames propagate to reports', async () => {
  const client = await user();
  const category = (await write(client, 'post', '/api/categories', { name: 'Exact amounts', type: 'EXPENSE' }).expect(201)).body.data;
  const record = await addTransaction(client, { category_id: category.id, amount: 0.1 });
  await addTransaction(client, { category_id: category.id, amount: 0.2 });
  const saved = (await usersCollection.doc(client.user.id).collection('transactions').doc(record.id).get()).data();
  assert.equal(saved.amount_paise, 10);
  assert.ok(!('amount' in saved));
  await write(client, 'put', `/api/categories/${category.id}`, { name: 'Renamed amounts', type: 'EXPENSE' }).expect(200);
  const summary = (await client.agent.get('/api/dashboard/summary?month=10&year=2026').expect(200)).body.data;
  assert.equal(summary.expenses, 0.3);
  assert.equal(summary.category_breakdown[0].category_name, 'Renamed amounts');
});

function importBody(records, overrides = {}) {
  return { import_id: randomUUID(), skip_duplicates: true, rows: records.map((record, index) => ({ source_row: index + 2, transaction: transaction(record) })), ...overrides };
}

test('CSV preview reports invalid rows and both duplicate sources without saving anything', async () => {
  const client = await user();
  await addTransaction(client, { amount: 100, description: 'Already saved' });
  const body = importBody([
    { amount: 100, description: 'Already saved' },
    { amount: 0.1, description: 'New course' },
    { amount: 0.1, description: 'New course' },
    { amount: -5, transaction_date: '2026-02-30' },
    { category_id: 'missing-category' },
  ]);
  const { import_id: _id, ...previewBody } = body;
  const response = (await write(client, 'post', '/api/transactions/import/preview', previewBody).expect(200)).body.data;
  assert.equal(response.rows[0].duplicate, 'existing');
  assert.equal(response.rows[2].duplicate, 'file');
  assert.ok(response.rows[3].errors.amount && response.rows[3].errors.transaction_date);
  assert.ok(response.rows[4].errors.category_id);
  assert.deepEqual(response.summary, { selected: 5, invalid: 2, duplicates: 2, to_import: 1, income: 0, expenses: 0.1 });
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 1);
  assert.equal((await usersCollection.doc(client.user.id).collection('imports').get()).size, 0);
});

test('CSV import atomically saves exact amounts and budget alerts and replays a lost response safely', async () => {
  const client = await user();
  await addBudget(client);
  const body = importBody([
    { amount: 750.1, description: 'Course instalment' },
    { amount: 149.9, description: 'Textbooks' },
    { amount: 149.9, description: 'Textbooks' },
    { type: 'INCOME', category_id: category('INCOME'), amount: 1000, description: 'Stipend' },
  ]);
  const first = (await write(client, 'post', '/api/transactions/import', body).expect(201)).body.data;
  assert.equal(first.imported, 3);
  assert.equal(first.skipped, 1);
  assert.equal(first.expenses, 900);
  assert.equal(first.income, 1000);
  assert.equal((await budgets(client))[0].spent, 900);
  assert.deepEqual((await alerts(client)).map(alert => alert.threshold_percent).sort(), [75, 90]);
  const revision = (await usersCollection.doc(client.user.id).get()).data().revision;
  const replay = (await write(client, 'post', '/api/transactions/import', body).expect(200)).body.data;
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.records, first.records);
  assert.equal((await usersCollection.doc(client.user.id).get()).data().revision, revision);
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 3);
  const saved = (await usersCollection.doc(client.user.id).collection('transactions').doc(first.records[0].id).get()).data();
  assert.equal(saved.amount_paise, 75010);
  assert.equal(saved.import_id, body.import_id);
});

test('CSV import validates the entire batch, including categories changed since preview', async () => {
  const client = await user();
  const custom = (await write(client, 'post', '/api/categories', { name: 'Preview category', type: 'EXPENSE' }).expect(201)).body.data;
  const body = importBody([{ amount: 10 }, { category_id: custom.id, amount: 20 }]);
  const { import_id: _id, ...previewBody } = body;
  await write(client, 'post', '/api/transactions/import/preview', previewBody).expect(200);
  await write(client, 'delete', `/api/categories/${custom.id}`).expect(204);
  const failure = await write(client, 'post', '/api/transactions/import', body).expect(422);
  assert.equal(failure.body.error.code, 'INVALID_IMPORT_ROWS');
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 0);
  assert.equal((await usersCollection.doc(client.user.id).collection('imports').get()).size, 0);
  const invalid = importBody([{ amount: 10 }, { amount: '1.001' }]);
  await write(client, 'post', '/api/transactions/import', invalid).expect(422);
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 0);
});

test('CSV import enforces account isolation, category ownership, and authentication', async () => {
  const owner = await user();
  const other = await user();
  const custom = (await write(owner, 'post', '/api/categories', { name: 'Private course', type: 'EXPENSE' }).expect(201)).body.data;
  const foreign = importBody([{ category_id: custom.id }]);
  await write(other, 'post', '/api/transactions/import', foreign).expect(422);
  const body = importBody([{ amount: 44 }]);
  await request(app).post('/api/transactions/import').send(body).expect(401);
  await request(app).get('/api/transactions/export').expect(401);
  await write(owner, 'post', '/api/transactions/import', body).expect(201);
  assert.equal((await other.agent.get('/api/transactions/export').expect(200)).body.data.length, 0);
  await write(other, 'post', '/api/transactions/import', body).expect(201);
  assert.equal((await other.agent.get('/api/transactions/export').expect(200)).body.data.length, 1);
});

test('concurrent CSV requests import once and an import ID cannot be reused for different data', async () => {
  const client = await user();
  const body = importBody([{ amount: 10, description: 'Concurrent batch' }], { skip_duplicates: false });
  const responses = await Promise.all([write(client, 'post', '/api/transactions/import', body), write(client, 'post', '/api/transactions/import', body)]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 1);
  const changed = structuredClone(body);
  changed.rows[0].transaction.amount = 11;
  await write(client, 'post', '/api/transactions/import', changed).expect(409);
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 1);
});

test('duplicate checks are repeated at commit and identical expenses can be explicitly included', async () => {
  const client = await user();
  const body = importBody([{ amount: 80, description: 'Same fare' }]);
  const { import_id: _id, ...previewBody } = body;
  assert.equal((await write(client, 'post', '/api/transactions/import/preview', previewBody).expect(200)).body.data.summary.to_import, 1);
  await addTransaction(client, { amount: 80, description: 'Same fare' });
  const skipped = (await write(client, 'post', '/api/transactions/import', body).expect(201)).body.data;
  assert.equal(skipped.imported, 0);
  assert.equal(skipped.skipped, 1);
  const explicit = importBody([{ amount: 80, description: 'Same fare' }, { amount: 80, description: 'Same fare' }], { skip_duplicates: false });
  assert.equal((await write(client, 'post', '/api/transactions/import', explicit).expect(201)).body.data.imported, 2);
  assert.equal((await client.agent.get('/api/transactions').expect(200)).body.meta.total, 3);
});

test('CSV batch size is bounded and the maximum supported batch exceeds the ordinary JSON limit safely', async () => {
  const client = await user();
  await write(client, 'post', '/api/transactions/import', importBody(Array.from({ length: 401 }, () => ({})))).expect(422);
  const body = importBody(Array.from({ length: 400 }, (_, index) => ({ amount: 0.01, description: `${index} ${'Course '.repeat(55)}` })));
  assert.ok(JSON.stringify(body).length > 32768);
  const saved = (await write(client, 'post', '/api/transactions/import', body).expect(201)).body.data;
  assert.equal(saved.imported, 400);
  assert.equal(saved.expenses, 4);
});

test('transaction export returns every matching row in a consistent filter order, beyond one page', async () => {
  const client = await user();
  await write(client, 'post', '/api/transactions/import', importBody(Array.from({ length: 15 }, (_, index) => ({ amount: index + 1, description: `Export row ${index}`, transaction_date: '2026-10-14' })))).expect(201);
  await addTransaction(client, { amount: 99, description: 'Excluded by search' });
  const response = (await client.agent.get('/api/transactions/export').query({ search: 'Export row', start_date: '2026-10-01', end_date: '2026-10-31', type: 'EXPENSE', sort_by: 'amount', sort_order: 'asc', page_size: 10 }).expect(200)).body;
  assert.equal(response.meta.total, 15);
  assert.equal(response.data.length, 15);
  assert.deepEqual(response.data.map(row => row.amount), Array.from({ length: 15 }, (_, index) => index + 1));
  assert.ok(response.data.every(row => row.category_name && row.user_id === client.user.id));
});
