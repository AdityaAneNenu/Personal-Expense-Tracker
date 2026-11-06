import { z } from 'zod';
import { AppError } from '../services/errors.js';
import { MAX_IMPORT_ROWS } from '../../../shared/importLimits.js';

const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/, 'Use a valid record ID.');
const type = z.enum(['INCOME', 'EXPENSE']);
export const paymentMethods = ['UPI', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER'];
const money = z.union([z.number(), z.string().regex(/^\d+(\.\d{1,2})?$/, 'Use at most two decimal places.')])
  .transform(Number)
  .refine(value => Number.isFinite(value) && value > 0 && value <= 9999999999.99, 'Amount must be greater than zero and at most 9,999,999,999.99.')
  .refine(value => /^\d+(\.\d{1,2})?$/.test(String(value)), 'Use at most two decimal places.');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value && value >= '2000-01-01' && value <= '2100-12-31';
}, 'Use a valid calendar date between 2000 and 2100.');
const month = z.coerce.number().int().min(1).max(12);
const year = z.coerce.number().int().min(2000).max(2100);
export const categorySchema = z.object({ name: z.string().trim().min(2).max(80), type }).strict();
export const categoryQuerySchema = z.object({ type: type.optional() }).strict();
export const transactionSchema = z.object({
  category_id: id, type, amount: money,
  description: z.string().trim().max(500).default(''),
  payment_method: z.enum(paymentMethods), transaction_date: date,
}).strict();

function importSchema(transaction, committing = false) {
  return z.object({
    ...(committing ? { import_id: z.uuid() } : {}),
    rows: z.array(z.object({ source_row: z.number().int().min(1).max(1000000), transaction }).strict()).min(1).max(MAX_IMPORT_ROWS),
    skip_duplicates: z.boolean().default(true),
  }).strict().superRefine((input, context) => {
    const seen = new Set();
    input.rows.forEach((row, index) => {
      if (seen.has(row.source_row)) context.addIssue({ code: 'custom', path: ['rows', index, 'source_row'], message: 'Each source row must have a unique number.' });
      seen.add(row.source_row);
    });
  });
}
export const importPreviewSchema = importSchema(z.record(z.string(), z.unknown()));
export const importCommitSchema = importSchema(transactionSchema, true);
export const transactionQuerySchema = z.object({
  start_date: date.optional(), end_date: date.optional(), category_id: id.optional(), type: type.optional(),
  search: z.string().trim().max(200).optional(),
  sort_by: z.enum(['transaction_date', 'amount', 'created_at']).default('transaction_date'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(10),
}).strict().refine(value => !value.start_date || !value.end_date || value.start_date <= value.end_date, { message: 'Start date must not be after end date.', path: ['end_date'] });
export const budgetSchema = z.object({ category_id: id.nullable().default(null), amount: money, month, year }).strict();
export const periodSchema = z.object({ month: month.default(() => new Date().getMonth() + 1), year: year.default(() => new Date().getFullYear()) }).strict();
export const alertQuerySchema = z.object({ month: month.optional(), year: year.optional(), unread: z.enum(['true', 'false']).optional() }).strict()
  .refine(value => Boolean(value.month) === Boolean(value.year), { message: 'Provide month and year together.', path: ['month'] });
export const emptySchema = z.object({}).strict();

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppError(422, 'VALIDATION_ERROR', 'Check the highlighted fields and try again.', result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })));
  return result.data;
}

export function parseId(value) { return parse(id, value); }
