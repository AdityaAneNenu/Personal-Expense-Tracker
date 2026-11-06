import { readUserData, toPaise, withUserTransaction } from './store.js';
import { budgetRows } from './budgets.js';
import { notFound } from './errors.js';

function alertRows(state, filters = {}) {
  const budgets = new Map(budgetRows(state).map(budget => [budget.id, budget]));
  return state.rows('alerts').flatMap(row => {
    const budget = budgets.get(row.budget_id);
    if (!budget || (filters.month && (budget.month !== filters.month || budget.year !== filters.year)) || (filters.unread === 'true' && row.is_read)) return [];
    return [{ ...row, category_id: budget.category_id, category_name: budget.category_name, month: budget.month, year: budget.year,
      is_read: Boolean(row.is_read), current_utilization: budget.utilization,
      is_active: toPaise(budget.spent) * 100 >= toPaise(budget.amount) * row.threshold_percent }];
  }).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
}

export async function listAlerts(userId, filters = {}) {
  return alertRows(await readUserData(userId), filters);
}

export function markAlertRead(userId, alertId) {
  return withUserTransaction(userId, state => {
    const alert = state.get('alerts', alertId);
    if (!alert) throw notFound('Alert');
    state.set('alerts', { ...alert, is_read: true });
    return alertRows(state).find(row => row.id === alertId);
  });
}
