import { amountFields, readUserData, toPaise, withUserTransaction } from './store.js';
import { findCategory, validateCategory } from './categories.js';
import { refreshAlerts } from './budgets.js';
import { notFound } from './errors.js';

function present(state, row) {
  return { ...amountFields(row), category_name: findCategory(state, row.category_id)?.name || 'Unknown category' };
}

function findTransaction(state, id) {
  const row = state.get('transactions', id);
  if (!row) throw notFound('Transaction');
  return row;
}

export async function getTransaction(userId, transactionId) {
  const state = await readUserData(userId, ['categories', 'transactions']);
  return present(state, findTransaction(state, transactionId));
}

function filteredRows(state, filters = {}) {
  const rows = state.rows('transactions').filter(row =>
    (!filters.start_date || row.transaction_date >= filters.start_date) &&
    (!filters.end_date || row.transaction_date <= filters.end_date) &&
    (!filters.category_id || row.category_id === filters.category_id) &&
    (!filters.type || row.type === filters.type) &&
    (!filters.search || row.description.toLowerCase().includes(filters.search.toLowerCase())));
  const column = filters.sort_by === 'amount' ? 'amount_paise' : filters.sort_by || 'transaction_date';
  const direction = filters.sort_order === 'asc' ? 1 : -1;
  rows.sort((a, b) => direction * ((a[column] > b[column] ? 1 : a[column] < b[column] ? -1 : 0) || a.id.localeCompare(b.id)));
  return rows;
}

export function transactionRows(state, filters = {}) {
  const rows = filteredRows(state, filters);
  const page = filters.page || 1;
  const pageSize = filters.page_size || 10;
  return {
    data: rows.slice((page - 1) * pageSize, page * pageSize).map(row => present(state, row)),
    meta: { page, page_size: pageSize, total: rows.length, total_pages: Math.ceil(rows.length / pageSize) },
  };
}

export async function listTransactions(userId, filters) {
  return transactionRows(await readUserData(userId, ['categories', 'transactions']), filters);
}

export async function exportTransactions(userId, filters) {
  const state = await readUserData(userId, ['categories', 'transactions']);
  const data = filteredRows(state, filters).map(row => present(state, row));
  return { data, meta: { total: data.length } };
}

function storedInput(input) {
  const { amount, ...fields } = input;
  return { ...fields, amount_paise: toPaise(amount) };
}

export function createTransaction(userId, input) {
  return withUserTransaction(userId, state => {
    validateCategory(state, input.category_id, input.type);
    const row = state.set('transactions', { id: state.newId('transactions'), user_id: userId, ...storedInput(input), created_at: state.now, updated_at: state.now });
    refreshAlerts(state);
    return present(state, row);
  });
}

export function updateTransaction(userId, transactionId, input) {
  return withUserTransaction(userId, state => {
    const old = findTransaction(state, transactionId);
    validateCategory(state, input.category_id, input.type);
    const row = state.set('transactions', { ...old, ...storedInput(input), updated_at: state.now });
    refreshAlerts(state);
    return present(state, row);
  });
}

export function deleteTransaction(userId, transactionId) {
  return withUserTransaction(userId, state => {
    findTransaction(state, transactionId);
    state.delete('transactions', transactionId);
    refreshAlerts(state);
  });
}
