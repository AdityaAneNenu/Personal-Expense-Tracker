import { amountFields, readUserData, toPaise, withUserTransaction } from './store.js';
import { AppError, notFound } from './errors.js';
import { findCategory, validateCategory } from './categories.js';

export function budgetMetrics(amount, spent) {
  const limitPaise = toPaise(amount);
  const spentPaise = toPaise(spent);
  const rawUtilization = limitPaise > 0 ? spentPaise / limitPaise * 100 : 0;
  const status = limitPaise <= 0 ? 'NORMAL' : spentPaise >= limitPaise ? 'EXCEEDED' : spentPaise * 100 >= limitPaise * 90 ? 'HIGH' : spentPaise * 100 >= limitPaise * 75 ? 'WARNING' : 'NORMAL';
  return { spent: spentPaise / 100, remaining: (limitPaise - spentPaise) / 100, utilization: Math.round(rawUtilization * 100) / 100, status };
}

export function budgetRows(state, period = {}) {
  return state.rows('budgets').filter(budget => !period.month || (budget.month === period.month && budget.year === period.year)).map(budget => {
    const prefix = `${budget.year}-${String(budget.month).padStart(2, '0')}-`;
    const spent = state.rows('transactions').filter(row => row.type === 'EXPENSE' && row.transaction_date.startsWith(prefix) && (budget.category_id === null || row.category_id === budget.category_id))
      .reduce((total, row) => total + row.amount_paise, 0);
    return { ...amountFields(budget), category_name: budget.category_id === null ? 'Overall budget' : findCategory(state, budget.category_id)?.name || 'Unknown category', ...budgetMetrics(budget.amount_paise / 100, spent / 100) };
  }).sort((a, b) => b.year - a.year || b.month - a.month || Number(a.category_id !== null) - Number(b.category_id !== null) || a.category_name.localeCompare(b.category_name));
}

export async function listBudgets(userId, period = {}) {
  return budgetRows(await readUserData(userId, ['categories', 'transactions', 'budgets']), period);
}

export function refreshAlerts(state) {
  for (const budget of budgetRows(state)) {
    for (const threshold of [75, 90, 100]) {
      const id = `${budget.id}_${threshold}`;
      if (toPaise(budget.spent) * 100 < toPaise(budget.amount) * threshold || state.get('alerts', id)) continue;
      state.set('alerts', { id, user_id: state.userId, budget_id: budget.id, threshold_percent: threshold,
        message: `${budget.category_name} crossed ${threshold}% of its budget (${budget.utilization}% at this crossing).`,
        is_read: false, created_at: state.now });
    }
  }
}

function findBudget(state, budgetId) {
  const row = state.get('budgets', budgetId);
  if (!row) throw notFound('Budget');
  return row;
}

function validateBudget(state, input, excludedId) {
  if (input.category_id !== null) validateCategory(state, input.category_id, 'EXPENSE');
  if (state.rows('budgets').some(row => row.id !== excludedId && row.category_id === input.category_id && row.month === input.month && row.year === input.year)) {
    throw new AppError(409, 'DUPLICATE_BUDGET', 'A budget already exists for this category and month.');
  }
}

function clearBudgetAlerts(state, budgetId) {
  for (const alert of state.rows('alerts')) if (alert.budget_id === budgetId) state.delete('alerts', alert.id);
}

function storedInput(input) {
  const { amount, ...fields } = input;
  return { ...fields, amount_paise: toPaise(amount) };
}

export function createBudget(userId, input) {
  return withUserTransaction(userId, state => {
    validateBudget(state, input);
    const row = state.set('budgets', { id: state.newId('budgets'), user_id: userId, ...storedInput(input), created_at: state.now, updated_at: state.now });
    refreshAlerts(state);
    return budgetRows(state, input).find(budget => budget.id === row.id);
  });
}

export function updateBudget(userId, budgetId, input) {
  return withUserTransaction(userId, state => {
    const old = findBudget(state, budgetId);
    validateBudget(state, input, budgetId);
    state.set('budgets', { ...old, ...storedInput(input), updated_at: state.now });
    if (old.category_id !== input.category_id || old.month !== input.month || old.year !== input.year) clearBudgetAlerts(state, budgetId);
    refreshAlerts(state);
    return budgetRows(state, input).find(budget => budget.id === budgetId);
  });
}

export function deleteBudget(userId, budgetId) {
  return withUserTransaction(userId, state => {
    findBudget(state, budgetId);
    clearBudgetAlerts(state, budgetId);
    state.delete('budgets', budgetId);
  });
}
