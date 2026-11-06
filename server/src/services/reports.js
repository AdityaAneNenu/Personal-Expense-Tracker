import { readUserData } from './store.js';
import { findCategory } from './categories.js';
import { budgetRows } from './budgets.js';
import { transactionRows } from './transactions.js';

function dateString(date) { return date.toISOString().slice(0, 10); }
export function periodBounds({ month, year }) {
  return { start: dateString(new Date(Date.UTC(year, month - 1, 1))), end: dateString(new Date(Date.UTC(year, month, 1))) };
}

function periodTransactions(state, period) {
  const { start, end } = periodBounds(period);
  return state.rows('transactions').filter(row => row.transaction_date >= start && row.transaction_date < end);
}

function breakdown(state, period) {
  const totals = new Map();
  for (const row of periodTransactions(state, period)) {
    if (row.type === 'EXPENSE') totals.set(row.category_id, (totals.get(row.category_id) || 0) + row.amount_paise);
  }
  return [...totals].map(([category_id, paise]) => ({ category_id, category_name: findCategory(state, category_id)?.name || 'Unknown category', amount: paise / 100 }))
    .sort((a, b) => b.amount - a.amount || a.category_name.localeCompare(b.category_name));
}

export async function categoryBreakdown(userId, period) {
  return breakdown(await readUserData(userId, ['categories', 'transactions']), period);
}

function report(state, period) {
  const monthly = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(Date.UTC(period.year, period.month - 6 + index, 1));
    const month = date.getUTCMonth() + 1;
    const year = date.getUTCFullYear();
    const rows = periodTransactions(state, { month, year });
    return { month, year, label: date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
      income: rows.filter(row => row.type === 'INCOME').reduce((sum, row) => sum + row.amount_paise, 0) / 100,
      expenses: rows.filter(row => row.type === 'EXPENSE').reduce((sum, row) => sum + row.amount_paise, 0) / 100 };
  });
  const days = new Map();
  for (const row of periodTransactions(state, period)) {
    if (row.type === 'EXPENSE') days.set(row.transaction_date, (days.get(row.transaction_date) || 0) + row.amount_paise);
  }
  const totalDays = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  const spending_trend = Array.from({ length: totalDays }, (_, index) => {
    const date = dateString(new Date(Date.UTC(period.year, period.month - 1, index + 1)));
    return { date, amount: (days.get(date) || 0) / 100 };
  });
  return { monthly, spending_trend };
}

export async function monthlyReport(userId, period) {
  return report(await readUserData(userId, ['transactions']), period);
}

export async function dashboardSummary(userId, period) {
  // Give every card/chart the same snapshot while another tab edits expenses.
  const state = await readUserData(userId, ['categories', 'transactions', 'budgets']);
  const rows = periodTransactions(state, period);
  const income = rows.filter(row => row.type === 'INCOME').reduce((sum, row) => sum + row.amount_paise, 0);
  const expenses = rows.filter(row => row.type === 'EXPENSE').reduce((sum, row) => sum + row.amount_paise, 0);
  const { start } = periodBounds(period);
  return { ...period, income: income / 100, expenses: expenses / 100, net_savings: (income - expenses) / 100,
    overall_budget: budgetRows(state, period).find(budget => budget.category_id === null) || null,
    recent_transactions: transactionRows(state, { start_date: start, end_date: dateString(new Date(Date.UTC(period.year, period.month, 0))), page_size: 5 }).data,
    category_breakdown: breakdown(state, period), ...report(state, period) };
}
