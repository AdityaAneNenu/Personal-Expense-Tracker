import { createHash } from 'node:crypto';
import { transactionSchema } from '../validators/index.js';
import { readUserData, toPaise, withUserTransaction } from './store.js';
import { validateCategory } from './categories.js';
import { refreshAlerts } from './budgets.js';
import { AppError } from './errors.js';

const normalizedText = value => value.normalize('NFKC').trim().toLowerCase().replace(/\s+/gu, ' ');
function fingerprint(row) {
  return JSON.stringify([row.transaction_date, row.type, row.amount_paise ?? toPaise(row.amount), row.category_id, row.payment_method, normalizedText(row.description || '')]);
}

function review(state, input) {
  const existing = new Set(state.rows('transactions').map(fingerprint));
  const seen = new Set();
  let incomePaise = 0;
  let expensePaise = 0;
  const rows = input.rows.map(row => {
    const parsed = transactionSchema.safeParse(row.transaction);
    const errors = {};
    if (!parsed.success) {
      for (const issue of parsed.error.issues) errors[issue.path.join('.') || 'row'] ||= issue.message;
    } else {
      try { validateCategory(state, parsed.data.category_id, parsed.data.type); }
      catch (error) { errors.category_id = error.message; }
    }
    const valid = Object.keys(errors).length === 0;
    let duplicate = null;
    if (valid) {
      const key = fingerprint(parsed.data);
      duplicate = existing.has(key) ? 'existing' : seen.has(key) ? 'file' : null;
      seen.add(key);
    }
    const willImport = valid && (!duplicate || !input.skip_duplicates);
    if (willImport) {
      if (parsed.data.type === 'INCOME') incomePaise += toPaise(parsed.data.amount);
      else expensePaise += toPaise(parsed.data.amount);
    }
    return { source_row: row.source_row, errors, duplicate, will_import: willImport };
  });
  return {
    rows,
    summary: {
      selected: rows.length,
      invalid: rows.filter(row => Object.keys(row.errors).length).length,
      duplicates: rows.filter(row => row.duplicate).length,
      to_import: rows.filter(row => row.will_import).length,
      income: incomePaise / 100,
      expenses: expensePaise / 100,
    },
  };
}

export async function previewImport(userId, input) {
  return review(await readUserData(userId, ['categories', 'transactions']), input);
}

export function commitImport(userId, input) {
  const hash = createHash('sha256').update(JSON.stringify({ rows: input.rows, skip_duplicates: input.skip_duplicates })).digest('hex');
  return withUserTransaction(userId, state => {
    const preview = review(state, input);
    if (preview.summary.invalid) throw new AppError(422, 'INVALID_IMPORT_ROWS', 'Some rows are no longer valid. Check the preview again. Nothing has been saved.', preview.rows.filter(row => Object.keys(row.errors).length));
    const records = [];
    for (const [index, row] of input.rows.entries()) {
      if (!preview.rows[index].will_import) continue;
      const { amount, ...fields } = row.transaction;
      const id = state.newId('transactions');
      state.set('transactions', { id, user_id: userId, ...fields, amount_paise: toPaise(amount), import_id: input.import_id, created_at: state.now, updated_at: state.now });
      records.push({ source_row: row.source_row, id });
    }
    if (records.length) refreshAlerts(state);
    return { import_id: input.import_id, imported: records.length, skipped: input.rows.length - records.length, income: preview.summary.income, expenses: preview.summary.expenses, records, replayed: false };
  }, { key: input.import_id, hash });
}
