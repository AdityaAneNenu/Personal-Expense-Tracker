import Papa from 'papaparse';
import { MAX_CSV_BYTES, MAX_IMPORT_ROWS } from '../../../shared/importLimits.js';
import { paymentLabel, today } from './format';

export { MAX_CSV_BYTES, MAX_IMPORT_ROWS };
export const csvFields = [
  { key: 'transaction_date', label: 'Date', required: true, aliases: ['date', 'transactiondate', 'txndate', 'entrydate', 'postingdate'] },
  { key: 'amount', label: 'Amount (INR)', required: true, aliases: ['amount', 'amountinr', 'expenseamount', 'debit', 'paidout', 'withdrawal'] },
  { key: 'description', label: 'Description', aliases: ['description', 'details', 'narration', 'particulars', 'note', 'notes', 'merchant', 'memo', 'purpose'] },
  { key: 'category', label: 'Category', aliases: ['category', 'categoryname', 'expensecategory', 'group'] },
  { key: 'type', label: 'Type', aliases: ['type', 'transactiontype', 'entrytype'] },
  { key: 'payment_method', label: 'Payment method', aliases: ['paymentmethod', 'paymentmode', 'payment', 'method', 'mode'] },
];
const headerKey = value => value.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '');
const words = value => ` ${value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

export function parseCsv(text) {
  if (!text.trim()) throw new Error('This CSV is empty. Add a header row and at least one transaction.');
  if (new Blob([text]).size > MAX_CSV_BYTES) throw new Error('Choose a CSV file no larger than 1 MB.');
  if (text.includes('\0') || text.includes('\uFFFD')) throw new Error('Save the file as CSV UTF-8 and try again.');
  const parsed = Papa.parse(text.replace(/^\uFEFF/, ''), { skipEmptyLines: 'greedy', delimitersToGuess: [',', ';', '\t'], dynamicTyping: false });
  const problem = parsed.errors.find(error => error.code !== 'UndetectableDelimiter');
  if (problem) throw new Error(`The CSV could not be read: ${problem.message} Check the quotes and commas in your file.`);
  if (parsed.data.length < 2 || parsed.data[0].length < 2) throw new Error('Include a header row with date and amount columns, followed by your transactions.');
  if (parsed.data.length - 1 > MAX_IMPORT_ROWS) throw new Error(`Import up to ${MAX_IMPORT_ROWS} rows at a time. Split this file into smaller CSV files.`);
  const headers = parsed.data[0].map((header, index) => header.trim() || `Column ${index + 1}`);
  const rows = parsed.data.slice(1).map((cells, index) => {
    if (cells.length > headers.length) throw new Error(`Row ${index + 2} has more values than the header. Put quotes around descriptions or amounts containing commas.`);
    return { source_row: index + 2, cells };
  });
  const mapping = Object.fromEntries(csvFields.map(field => [field.key, String(headers.findIndex(header => field.aliases.includes(headerKey(header))))]));
  return { headers, rows, mapping, delimiter: parsed.meta.delimiter };
}

export function normalizeCsvAmount(input) {
  const original = String(input ?? '').trim();
  const value = original.replace(/^(?:₹|INR\s*|Rs\.?\s*)/i, '').replace(/\s*INR$/i, '').trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})*,\d{3})(?:\.\d{1,2})?$/.test(value)) return original;
  return value.replaceAll(',', '');
}

export function normalizeCsvDate(input, format = 'DMY') {
  const value = String(input ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const numeric = value.match(/^(\d{1,2})([./-])(\d{1,2})\2(\d{4})$/);
  if (numeric) {
    const [, first, , second, year] = numeric;
    const [day, month] = format === 'MDY' ? [second, first] : [first, second];
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const named = value.match(/^(\d{1,2})[ /-]([a-z]{3,9})[ ,/-]+(\d{4})$/i);
  if (named) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (month) return `${named[3]}-${String(month).padStart(2, '0')}-${named[1].padStart(2, '0')}`;
  }
  return value;
}

const categoryHints = {
  Education: ['education', 'school', 'college', 'university', 'tuition', 'tution', 'course', 'udemy', 'coursera', 'textbook', 'textbooks', 'exam', 'books', 'stationery', 'school fees'],
  'Food and groceries': ['food', 'groceries', 'grocery', 'supermarket', 'restaurant', 'cafe', 'coffee', 'lunch', 'dinner', 'breakfast', 'zomato', 'swiggy', 'blinkit', 'bigbasket', 'zepto', 'vegetables'],
  Transport: ['transport', 'uber', 'ola', 'rapido', 'metro', 'bus', 'train', 'taxi', 'petrol', 'diesel', 'fuel', 'parking', 'toll', 'irctc', 'flight'],
  Accommodation: ['accommodation', 'rent', 'hostel', 'lodging', 'hotel', 'housing'],
  Healthcare: ['healthcare', 'hospital', 'clinic', 'doctor', 'dental', 'pharmacy', 'medicine', 'medicines', 'medical'],
  Shopping: ['shopping', 'clothing', 'clothes', 'shoes', 'myntra', 'ajio', 'electronics', 'furniture'],
  Entertainment: ['entertainment', 'movie', 'cinema', 'netflix', 'spotify', 'concert', 'gaming', 'hotstar', 'bookmyshow'],
  Utilities: ['utilities', 'electricity', 'water bill', 'gas bill', 'internet', 'broadband', 'wifi', 'mobile recharge', 'phone bill', 'electric bill'],
  Salary: ['salary', 'payroll', 'wages'],
  Stipend: ['stipend', 'internship allowance'],
  'Freelance income': ['freelance', 'freelancing', 'consulting', 'client payment'],
  Scholarship: ['scholarship', 'education grant'],
};

export function suggestCategory(description, categoryName, type, categories) {
  const available = categories.filter(category => category.type === type);
  const supplied = words(categoryName || '').trim();
  const exact = supplied && available.find(category => words(category.name).trim() === supplied);
  if (exact) return { category_id: exact.id, category_source: 'From CSV' };
  const text = words(`${categoryName || ''} ${description || ''}`);
  const ranked = available.map(category => ({
    category,
    score: (text.includes(words(category.name)) ? 4 : 0) + (categoryHints[category.name] || []).filter(hint => text.includes(words(hint))).length,
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  if (ranked.length && (ranked.length === 1 || ranked[0].score > ranked[1].score)) return { category_id: ranked[0].category.id, category_source: 'Suggested' };
  return { category_id: '', category_source: categoryName ? `Review “${categoryName}”` : 'Choose a category' };
}

function paymentMethod(value) {
  const normalized = headerKey(value);
  const aliases = { upi: 'UPI', gpay: 'UPI', googlepay: 'UPI', phonepe: 'UPI', paytm: 'UPI', cash: 'CASH', debitcard: 'DEBIT_CARD', creditcard: 'CREDIT_CARD', banktransfer: 'BANK_TRANSFER', neft: 'BANK_TRANSFER', imps: 'BANK_TRANSFER', rtgs: 'BANK_TRANSFER', other: 'OTHER' };
  return value ? aliases[normalized] || value.toUpperCase().replaceAll(' ', '_') : 'OTHER';
}

export function mapCsvRows(parsed, mapping, categories, dateFormat = 'DMY') {
  for (const field of csvFields.filter(field => field.required)) if (!Number.isInteger(Number(mapping[field.key])) || Number(mapping[field.key]) < 0 || Number(mapping[field.key]) >= parsed.headers.length) throw new Error(`Choose the ${field.label.toLowerCase()} column.`);
  const chosen = Object.values(mapping).filter(value => Number(value) >= 0);
  if (new Set(chosen).size !== chosen.length) throw new Error('Use a different CSV column for each field.');
  return parsed.rows.map(row => {
    const read = field => String(row.cells[Number(mapping[field])] ?? '').trim();
    const rawType = read('type').toUpperCase();
    const type = !rawType || ['EXPENSE', 'DEBIT', 'DR'].includes(rawType) ? 'EXPENSE' : ['INCOME', 'CREDIT', 'CR'].includes(rawType) ? 'INCOME' : rawType;
    const description = read('description');
    return {
      source_row: row.source_row,
      included: true,
      ...suggestCategory(description, read('category'), type, categories),
      type,
      amount: normalizeCsvAmount(read('amount')),
      transaction_date: normalizeCsvDate(read('transaction_date'), dateFormat),
      description,
      payment_method: paymentMethod(read('payment_method')),
    };
  });
}

export function importPayload(rows, skipDuplicates) {
  return {
    skip_duplicates: skipDuplicates,
    rows: rows.filter(row => row.included).map(({ source_row, category_id, type, amount, transaction_date, description, payment_method }) => ({ source_row, transaction: { category_id, type, amount, transaction_date, description, payment_method } })),
  };
}

export function encodeCsv(rows) {
  return '\uFEFF' + rows.map(row => row.map(cell => {
    let value = String(cell ?? '');
    // Spreadsheet apps may execute formulas even after leading spaces/control characters.
    let start = 0;
    while (start < value.length && (value.charCodeAt(start) < 32 || /\s/u.test(value[start]))) start++;
    if (/^[=+@-]/.test(value.slice(start)) || /^[\t\r\n]/.test(value)) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  }).join(',')).join('\r\n');
}

export function downloadFile(contents, filename, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const transactionHeaders = ['Date', 'Type', 'Amount', 'Category', 'Description', 'Payment method'];
export function transactionCsv(rows) {
  return encodeCsv([transactionHeaders, ...rows.map(row => [row.transaction_date, row.type, Number(row.amount).toFixed(2), row.category_name, row.description, paymentLabel(row.payment_method)])]);
}

export function downloadCsvTemplate() {
  downloadFile(encodeCsv([transactionHeaders,
    [today(), 'EXPENSE', '1500.00', 'Education', 'Course fees', 'UPI'],
    [today(), 'EXPENSE', '80.00', 'Transport', 'Metro pass', 'UPI'],
    [today(), 'EXPENSE', '450.00', 'Food and groceries', 'Weekly groceries', 'Cash'],
  ]), 'spendwise-expenses-template.csv', 'text/csv;charset=utf-8');
}
