import { describe, expect, it } from 'vitest';
import { encodeCsv, importPayload, mapCsvRows, MAX_IMPORT_ROWS, normalizeCsvAmount, normalizeCsvDate, parseCsv, suggestCategory, transactionCsv } from '../lib/csv';
import { validAmount, validDate } from '../lib/format';

const categories = [
  { id: 'education', name: 'Education', type: 'EXPENSE' },
  { id: 'food', name: 'Food and groceries', type: 'EXPENSE' },
  { id: 'transport', name: 'Transport', type: 'EXPENSE' },
  { id: 'shopping', name: 'Shopping', type: 'EXPENSE' },
  { id: 'salary', name: 'Salary', type: 'INCOME' },
  { id: 'custom', name: 'Pottery class', type: 'EXPENSE' },
];

describe('CSV parsing and category review', () => {
  it('handles UTF-8 BOM, quoted commas, escaped quotes, multiline text and blank lines', () => {
    const parsed = parseCsv('\uFEFFDate,Amount,Description,Category\r\n2026-11-01,"1,250.50","Books, ""Physics""\nand notes",Education\r\n\r\n');
    expect(parsed.rows).toHaveLength(1);
    const rows = mapCsvRows(parsed, parsed.mapping, categories);
    expect(rows[0]).toMatchObject({ source_row: 2, amount: '1250.50', description: 'Books, "Physics"\nand notes', category_id: 'education', category_source: 'From CSV', payment_method: 'OTHER' });
  });

  it('recognizes semicolon CSVs and lets users map unfamiliar headers', () => {
    const parsed = parseCsv('When;Spent;Purpose\n05/11/2026;200;Course fees');
    const mapping = { ...parsed.mapping, transaction_date: '0', amount: '1' };
    expect(parsed.delimiter).toBe(';');
    expect(mapCsvRows(parsed, mapping, categories)[0]).toMatchObject({ transaction_date: '2026-11-05', category_id: 'education', category_source: 'Suggested' });
    expect(() => mapCsvRows(parsed, { ...mapping, amount: '0' }, categories)).toThrow('different CSV column');
    expect(() => mapCsvRows(parsed, { ...mapping, amount: '-1' }, categories)).toThrow('amount');
  });

  it('rejects malformed CSVs and files exceeding row or size limits instead of truncating them', () => {
    expect(() => parseCsv('Date,Amount\n2026-11-01,"bad')).toThrow('quotes');
    expect(() => parseCsv('Date,Amount\n2026-11-01,10,20')).toThrow('more values');
    expect(() => parseCsv('Date,Amount')).toThrow('header');
    expect(() => parseCsv('Date,Amount\n' + Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => '2026-11-01,1').join('\n'))).toThrow('400');
    expect(() => parseCsv('Date,Amount\n' + 'x'.repeat(1024 * 1024))).toThrow('1 MB');
    expect(() => parseCsv('Date,Amount\n2026-11-01,\0')).toThrow('UTF-8');
  });

  it('parses INR grouping without silently changing negative, foreign-currency or overprecise amounts', () => {
    expect(normalizeCsvAmount('₹1,23,456.70')).toBe('123456.70');
    expect(normalizeCsvAmount('Rs. 1,500')).toBe('1500');
    expect(normalizeCsvAmount('250 INR')).toBe('250');
    for (const input of ['-25', '$20', '1.234', '1,2,3', '=10+20', '0']) expect(validAmount(normalizeCsvAmount(input))).toBe(false);
  });

  it('uses an explicit date convention and rejects invalid calendar dates', () => {
    expect(normalizeCsvDate('03/04/2026', 'DMY')).toBe('2026-04-03');
    expect(normalizeCsvDate('03/04/2026', 'MDY')).toBe('2026-03-04');
    expect(normalizeCsvDate('2026-11-05', 'MDY')).toBe('2026-11-05');
    expect(normalizeCsvDate('5-Nov-2026')).toBe('2026-11-05');
    expect(validDate(normalizeCsvDate('31/02/2026'))).toBe(false);
  });

  it('honors supplied categories and matches education and custom categories without crossing transaction types', () => {
    expect(suggestCategory('College tuition', '', 'EXPENSE', categories)).toMatchObject({ category_id: 'education', category_source: 'Suggested' });
    expect(suggestCategory('School books', 'Shopping', 'EXPENSE', categories)).toMatchObject({ category_id: 'shopping', category_source: 'From CSV' });
    expect(suggestCategory('Evening pottery class', '', 'EXPENSE', categories).category_id).toBe('custom');
    expect(suggestCategory('Salary payment', '', 'INCOME', categories).category_id).toBe('salary');
    expect(suggestCategory('Salary payment', '', 'EXPENSE', categories).category_id).toBe('');
    expect(suggestCategory('Books and clothes', '', 'EXPENSE', categories).category_id).toBe('');
    expect(suggestCategory('Unclear payment', '', 'EXPENSE', categories).category_id).toBe('');
  });

  it('exports transaction CSVs that can be imported with names, dates, exact amounts and payment methods intact', () => {
    const original = [{ transaction_date: '2026-11-05', type: 'EXPENSE', amount: 123.45, category_name: 'Education', description: 'Books, "English"\nSemester 1', payment_method: 'BANK_TRANSFER' }];
    const parsed = parseCsv(transactionCsv(original));
    const [row] = mapCsvRows(parsed, parsed.mapping, categories);
    expect(row).toMatchObject({ transaction_date: '2026-11-05', type: 'EXPENSE', amount: '123.45', category_id: 'education', description: original[0].description, payment_method: 'BANK_TRANSFER' });
    expect(importPayload([row, { ...row, source_row: 3, included: false }], true)).toEqual({ skip_duplicates: true, rows: [{ source_row: 2, transaction: { transaction_date: row.transaction_date, type: row.type, amount: row.amount, category_id: row.category_id, description: row.description, payment_method: row.payment_method } }] });
  });

  it('neutralizes spreadsheet formulas including leading whitespace and control characters', () => {
    const text = encodeCsv([['Description', 'Amount'], ['  =HYPERLINK("https://example.test")', 10], ['\t+SUM(1,2)', 20], ['@formula', 30], ['Normal, "quoted" text', 40]]);
    expect(text.startsWith('\uFEFF')).toBe(true);
    const rows = parseCsv(text).rows;
    expect(rows[0].cells[0]).toBe('\'  =HYPERLINK("https://example.test")');
    expect(rows[1].cells[0]).toBe("'\t+SUM(1,2)");
    expect(rows[2].cells[0]).toBe("'@formula");
    expect(rows[3].cells[0]).toBe('Normal, "quoted" text');
  });
});
