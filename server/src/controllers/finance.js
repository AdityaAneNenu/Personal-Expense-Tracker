import * as categories from '../services/categories.js';
import * as transactions from '../services/transactions.js';
import * as budgets from '../services/budgets.js';
import * as reports from '../services/reports.js';
import * as alerts from '../services/alerts.js';
import { parse, parseId, categorySchema, categoryQuerySchema, transactionSchema, transactionQuerySchema, budgetSchema, periodSchema, alertQuerySchema, emptySchema } from '../validators/index.js';

export async function getCategories(req, res) { res.json({ data: await categories.listCategories(req.user.id, parse(categoryQuerySchema, req.query).type) }); }
export async function addCategory(req, res) { res.status(201).json({ data: await categories.createCategory(req.user.id, parse(categorySchema, req.body)) }); }
export async function editCategory(req, res) { res.json({ data: await categories.updateCategory(req.user.id, parseId(req.params.id), parse(categorySchema, req.body)) }); }
export async function removeCategory(req, res) { await categories.deleteCategory(req.user.id, parseId(req.params.id)); res.status(204).end(); }

export async function getTransactions(req, res) { res.json(await transactions.listTransactions(req.user.id, parse(transactionQuerySchema, req.query))); }
export async function exportTransactions(req, res) { res.json(await transactions.exportTransactions(req.user.id, parse(transactionQuerySchema, req.query))); }
export async function getTransaction(req, res) { res.json({ data: await transactions.getTransaction(req.user.id, parseId(req.params.id)) }); }
export async function addTransaction(req, res) { res.status(201).json({ data: await transactions.createTransaction(req.user.id, parse(transactionSchema, req.body)) }); }
export async function editTransaction(req, res) { res.json({ data: await transactions.updateTransaction(req.user.id, parseId(req.params.id), parse(transactionSchema, req.body)) }); }
export async function removeTransaction(req, res) { await transactions.deleteTransaction(req.user.id, parseId(req.params.id)); res.status(204).end(); }

export async function getBudgets(req, res) { res.json({ data: await budgets.listBudgets(req.user.id, parse(periodSchema, req.query)) }); }
export async function addBudget(req, res) { res.status(201).json({ data: await budgets.createBudget(req.user.id, parse(budgetSchema, req.body)) }); }
export async function editBudget(req, res) { res.json({ data: await budgets.updateBudget(req.user.id, parseId(req.params.id), parse(budgetSchema, req.body)) }); }
export async function removeBudget(req, res) { await budgets.deleteBudget(req.user.id, parseId(req.params.id)); res.status(204).end(); }

export async function getSummary(req, res) { res.json({ data: await reports.dashboardSummary(req.user.id, parse(periodSchema, req.query)) }); }
export async function getMonthlyReport(req, res) { res.json({ data: await reports.monthlyReport(req.user.id, parse(periodSchema, req.query)) }); }
export async function getCategoryBreakdown(req, res) { res.json({ data: await reports.categoryBreakdown(req.user.id, parse(periodSchema, req.query)) }); }
export async function getAlerts(req, res) { res.json({ data: await alerts.listAlerts(req.user.id, parse(alertQuerySchema, req.query)) }); }
export async function readAlert(req, res) { parse(emptySchema, req.body || {}); res.json({ data: await alerts.markAlertRead(req.user.id, parseId(req.params.id)) }); }
