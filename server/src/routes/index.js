import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import * as auth from '../controllers/auth.js';
import * as finance from '../controllers/finance.js';
import * as imports from '../controllers/imports.js';

export const apiRouter = Router();
const limiter = limit => rateLimit({ windowMs: 15 * 60 * 1000, limit, standardHeaders: 'draft-8', legacyHeaders: false,
  skip: () => env.nodeEnv === 'test', message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again in 15 minutes.' } } });
apiRouter.get('/auth/me', limiter(120), requireAuth, auth.me);

apiRouter.use(['/categories', '/transactions', '/budgets', '/dashboard', '/reports', '/alerts'], requireAuth);
apiRouter.get('/categories', finance.getCategories);
apiRouter.post('/categories', finance.addCategory);
apiRouter.put('/categories/:id', finance.editCategory);
apiRouter.delete('/categories/:id', finance.removeCategory);
apiRouter.get('/transactions', finance.getTransactions);
apiRouter.post('/transactions', finance.addTransaction);
apiRouter.get('/transactions/export', finance.exportTransactions);
apiRouter.post('/transactions/import/preview', limiter(120), imports.preview);
apiRouter.post('/transactions/import', limiter(40), imports.commit);
apiRouter.get('/transactions/:id', finance.getTransaction);
apiRouter.put('/transactions/:id', finance.editTransaction);
apiRouter.delete('/transactions/:id', finance.removeTransaction);
apiRouter.get('/budgets', finance.getBudgets);
apiRouter.post('/budgets', finance.addBudget);
apiRouter.put('/budgets/:id', finance.editBudget);
apiRouter.delete('/budgets/:id', finance.removeBudget);
apiRouter.get('/dashboard/summary', finance.getSummary);
apiRouter.get('/reports/monthly', finance.getMonthlyReport);
apiRouter.get('/reports/category-breakdown', finance.getCategoryBreakdown);
apiRouter.get('/alerts', finance.getAlerts);
apiRouter.patch('/alerts/:id/read', finance.readAlert);
