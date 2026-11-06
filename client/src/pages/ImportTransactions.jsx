import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle2, Download, FileSpreadsheet, RefreshCw, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import useResource from '../hooks/useResource';
import { request } from '../lib/api';
import { currency, paymentLabel, validateTransaction } from '../lib/format';
import { csvFields, downloadCsvTemplate, importPayload, mapCsvRows, MAX_CSV_BYTES, MAX_IMPORT_ROWS, parseCsv } from '../lib/csv';
import { ErrorState, Field, Loading, PageHeader } from '../components/UI';

const payments = ['UPI', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'OTHER'];
const pageSize = 20;

export default function ImportTransactions() {
  const categories = useResource('/categories');
  const { notify } = useApp();
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [dateFormat, setDateFormat] = useState('DMY');
  const [rows, setRows] = useState(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [bulkCategory, setBulkCategory] = useState('');
  const mounted = useRef(false);
  const attempt = useRef({ signature: null, id: null });
  const fileInput = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const payload = rows ? importPayload(rows, skipDuplicates) : null;
  const signature = JSON.stringify(payload);
  const currentPreview = preview?.signature === signature ? preview : null;
  const previewRows = new Map(currentPreview?.rows.map(row => [row.source_row, row]) || []);
  const selectedCount = payload?.rows.length || 0;
  const pageCount = Math.ceil((rows?.length || 0) / pageSize);

  async function chooseFile(file) {
    if (!file || busy) return;
    setError(null);
    setBusy('reading');
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('Choose a .csv file. Save Excel workbooks as CSV UTF-8 first.');
      if (file.size > MAX_CSV_BYTES) throw new Error('Choose a CSV file no larger than 1 MB.');
      const next = parseCsv(await file.text());
      if (!mounted.current) return;
      setParsed(next); setMapping(next.mapping); setFileName(file.name);
      setRows(null); setPreview(null); setResult(null); setPage(1);
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(null); }
  }

  async function checkRows(nextRows = rows) {
    const nextPayload = importPayload(nextRows, skipDuplicates);
    if (!nextPayload.rows.length) { setError('Select at least one row to check.'); return; }
    setError(null); setBusy('checking');
    try {
      const response = await request('/transactions/import/preview', { method: 'POST', body: nextPayload });
      if (mounted.current) setPreview({ ...response.data, signature: JSON.stringify(nextPayload) });
    } catch (err) { if (mounted.current) setError(err.message); }
    finally { if (mounted.current) setBusy(null); }
  }

  async function startReview() {
    try {
      const nextRows = mapCsvRows(parsed, mapping, categories.data, dateFormat);
      setRows(nextRows); setPage(1); setPreview(null);
      await checkRows(nextRows);
    } catch (err) { setError(err.message); }
  }

  function updateRow(sourceRow, field, value) {
    setRows(current => current.map(row => row.source_row === sourceRow ? {
      ...row, [field]: value,
      ...(field === 'category_id' ? { category_source: 'Chosen by you' } : {}),
      ...(field === 'type' ? { category_id: '', category_source: 'Choose a category' } : {}),
    } : row));
    setError(null);
  }

  function applyCategory() {
    const category = categories.data.find(item => item.id === bulkCategory);
    if (!category) return;
    setRows(current => current.map(row => row.included && !row.category_id && row.type === category.type ? { ...row, category_id: category.id, category_source: 'Chosen by you' } : row));
  }

  async function save() {
    if (!currentPreview || currentPreview.summary.invalid || !currentPreview.summary.to_import || busy) return;
    if (attempt.current.signature !== signature) attempt.current = { signature, id: crypto.randomUUID() };
    setBusy('saving'); setError(null);
    try {
      const response = await request('/transactions/import', { method: 'POST', body: { ...payload, import_id: attempt.current.id } });
      if (!mounted.current) return;
      setResult(response.data);
      notify(`${response.data.imported} transaction${response.data.imported === 1 ? '' : 's'} imported. Reports and budgets are up to date.`);
    } catch (err) { if (mounted.current) setError(`${err.message} You can retry this import safely.`); }
    finally { if (mounted.current) setBusy(null); }
  }

  function reset() {
    setParsed(null); setRows(null); setPreview(null); setResult(null); setError(null);
    setFileName(''); setPage(1); setBulkCategory(''); setSkipDuplicates(true);
    attempt.current = { signature: null, id: null };
    if (fileInput.current) fileInput.current.value = '';
  }

  if (categories.loading) return <Loading label="Preparing CSV import…" />;
  if (categories.error) return <ErrorState error={categories.error} onRetry={categories.reload} />;

  return <>
    <Link className="back-link" to="/transactions"><ArrowLeft size={16} />Back to transactions</Link>
    <PageHeader title="Import from CSV" description="Bring your expense records together. Review everything before saving.">
      <button type="button" className="button secondary" onClick={downloadCsvTemplate}><Download size={17} />Download template</button>
    </PageHeader>
    {error && <p className="form-error import-error" role="alert">{error}</p>}
    {result ? <section className="panel import-complete" aria-labelledby="import-complete-heading">
      <CheckCircle2 size={40} />
      <h2 id="import-complete-heading">Import complete</h2>
      <p><strong>{result.imported}</strong> transaction{result.imported === 1 ? '' : 's'} saved{result.skipped ? `; ${result.skipped} possible duplicate${result.skipped === 1 ? '' : 's'} skipped` : ''}.</p>
      <p>Expenses: <strong>{currency(result.expenses)}</strong>{result.income > 0 && <> · Income: <strong>{currency(result.income)}</strong></>}</p>
      <p className="muted">Your reports, budgets, and alerts now include these records.</p>
      <div className="import-actions"><Link className="button primary" to="/transactions">View transactions</Link><button className="button secondary" onClick={reset}>Import another CSV</button></div>
    </section> : !rows ? <>
      <section className="panel csv-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void chooseFile(event.dataTransfer.files[0]); }}>
        <span className="import-file-icon"><FileSpreadsheet size={31} /></span>
        <div><h2>{fileName || 'Choose your expense CSV'}</h2><p>{parsed ? `${parsed.rows.length} rows found. Match the columns below to continue.` : `Drop a CSV here, or choose a file. Up to ${MAX_IMPORT_ROWS} rows and 1 MB per import.`}</p></div>
        <label className="button primary csv-file-label" htmlFor="expense-csv"><Upload size={17} />{busy === 'reading' ? 'Reading CSV…' : 'Choose CSV file'}
          <input ref={fileInput} id="expense-csv" type="file" accept=".csv,text/csv" disabled={Boolean(busy)} onChange={event => { void chooseFile(event.target.files[0]); event.target.value = ''; }} />
        </label>
        <p className="csv-upload-note">Nothing is saved until you confirm the import. The template includes three example expenses—replace them with your own records.</p>
      </section>
      {parsed && <section className="panel import-mapping">
        <h2>Match your columns</h2><p className="muted">Date and amount are required. Missing types become expenses; missing payment methods become Other.</p>
        <div className="import-mapping-grid">
          {csvFields.map(field => <Field key={field.key} label={`${field.label}${field.required ? ' *' : ''}`} name={`csv-${field.key}`}>
            <select id={`csv-${field.key}`} value={mapping[field.key]} disabled={Boolean(busy)} onChange={event => setMapping(current => ({ ...current, [field.key]: event.target.value }))}>
              <option value="-1">{field.required ? 'Choose a column' : 'Not provided'}</option>
              {parsed.headers.map((header, index) => <option key={index} value={String(index)}>{header} (column {index + 1})</option>)}
            </select>
            {Number(mapping[field.key]) >= 0 && <small className="muted">Example: {parsed.rows[0].cells[Number(mapping[field.key])]?.slice(0, 90) || 'Empty'}</small>}
          </Field>)}
          <Field label="Date format" name="csv-date-format" hint="YYYY-MM-DD dates are always recognized.">
            <select id="csv-date-format" value={dateFormat} disabled={Boolean(busy)} onChange={event => setDateFormat(event.target.value)}><option value="DMY">Day / Month / Year</option><option value="MDY">Month / Day / Year</option></select>
          </Field>
        </div>
        <p className="import-help">Category names in the file are matched first. Built-in suggestions also recognize descriptions such as course fees, groceries, and metro fares. You can change every suggestion.</p>
        <button className="button primary" disabled={Boolean(busy)} onClick={startReview}>{busy === 'checking' ? 'Checking rows…' : 'Review rows'}</button>
      </section>}
    </> : <>
      <section className="panel import-review-heading">
        <div><h2>Review {fileName}</h2><p className="muted">Correct highlighted values, choose categories, or uncheck unwanted rows. Scroll across the table to see every field.</p></div>
        <button className="button secondary small" disabled={Boolean(busy)} onClick={() => { setRows(null); setPreview(null); setError(null); }}>Back to columns</button>
      </section>
      <div className="import-summary" aria-label="Import summary">
        <div><span>Selected rows</span><strong>{selectedCount} / {rows.length}</strong></div>
        <div><span>Ready to import</span><strong>{currentPreview ? currentPreview.summary.to_import : '—'}</strong></div>
        <div><span>Possible duplicates</span><strong>{currentPreview ? currentPreview.summary.duplicates : '—'}</strong></div>
        <div><span>Expense total</span><strong>{currentPreview ? currency(currentPreview.summary.expenses) : '—'}</strong></div>
      </div>
      <section className="panel import-tools">
        <div className="import-duplicate-option"><label><input type="checkbox" checked={skipDuplicates} disabled={Boolean(busy)} onChange={event => setSkipDuplicates(event.target.checked)} />Skip possible duplicates</label>
          <p>Matches use the date, amount, type, category, payment method, and description.</p>
          {!skipDuplicates && <p className="import-warning">Matching rows will be imported again.</p>}
        </div>
        <div className="import-bulk-category"><label htmlFor="bulk-category">Category for unassigned rows</label><div>
          <select id="bulk-category" value={bulkCategory} disabled={Boolean(busy)} onChange={event => setBulkCategory(event.target.value)}><option value="">Choose a category</option>{['EXPENSE', 'INCOME'].map(type => <optgroup key={type} label={type === 'EXPENSE' ? 'Expenses' : 'Income'}>{categories.data.filter(category => category.type === type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</optgroup>)}</select>
          <button className="button secondary" disabled={!bulkCategory || Boolean(busy)} onClick={applyCategory}>Apply</button></div><small className="muted">Applies to selected, unassigned rows of the same type.</small>
        </div>
      </section>
      <div className="panel import-table-panel"><div className="table-scroll" tabIndex={0} aria-label="CSV preview, scroll horizontally for all fields">
        <table className="import-table"><caption className="sr-only">CSV import preview</caption><thead><tr><th>Include</th><th>Date</th><th>Description</th><th>Amount (INR)</th><th>Type</th><th>Category</th><th>Payment method</th><th>Review</th></tr></thead>
          <tbody>{rows.slice((page - 1) * pageSize, page * pageSize).map(row => {
            const reviewed = previewRows.get(row.source_row);
            const errors = { ...validateTransaction(row), ...reviewed?.errors };
            const label = field => `${field}, row ${row.source_row}`;
            return <tr key={row.source_row} className={!row.included ? 'import-row-excluded' : ''}>
              <td><label className="import-include"><input type="checkbox" aria-label={`Include row ${row.source_row}`} checked={row.included} disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'included', event.target.checked)} />{row.source_row}</label></td>
              <td><input aria-label={label('Date')} aria-invalid={Boolean(errors.transaction_date)} value={row.transaction_date} placeholder="YYYY-MM-DD" disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'transaction_date', event.target.value)} /></td>
              <td><textarea rows={2} maxLength={500} aria-label={label('Description')} aria-invalid={Boolean(errors.description)} value={row.description} disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'description', event.target.value)} /></td>
              <td><input aria-label={label('Amount')} aria-invalid={Boolean(errors.amount)} inputMode="decimal" value={row.amount} disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'amount', event.target.value)} /></td>
              <td><select aria-label={label('Type')} aria-invalid={Boolean(errors.type)} value={row.type} disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'type', event.target.value)}>{!['INCOME', 'EXPENSE'].includes(row.type) && <option value={row.type}>{row.type}</option>}<option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></td>
              <td><select aria-label={label('Category')} aria-invalid={Boolean(errors.category_id)} value={row.category_id} disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'category_id', event.target.value)}><option value="">Choose category</option>{categories.data.filter(category => category.type === row.type).map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select><small className="import-category-source">{row.category_source}</small></td>
              <td><select aria-label={label('Payment method')} aria-invalid={Boolean(errors.payment_method)} value={row.payment_method} disabled={Boolean(busy)} onChange={event => updateRow(row.source_row, 'payment_method', event.target.value)}>{!payments.includes(row.payment_method) && <option value={row.payment_method}>{row.payment_method}</option>}{payments.map(payment => <option key={payment} value={payment}>{paymentLabel(payment)}</option>)}</select></td>
              <td className="import-row-status">{!row.included ? <span>Excluded</span> : Object.keys(errors).length ? <ul>{Object.values(errors).map((message, index) => <li key={index}>{message}</li>)}</ul> : reviewed?.duplicate ? <span className="import-warning">{reviewed.duplicate === 'existing' ? 'Already in your records' : 'Repeated in this CSV'}{skipDuplicates ? ' · Will skip' : ''}</span> : <span className="positive">{currentPreview ? 'Ready' : 'Check changes'}</span>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div><div className="pagination"><span>{rows.length} CSV rows · Page {page} of {pageCount}</span><div><button className="button secondary small" disabled={page === 1 || Boolean(busy)} onClick={() => setPage(value => value - 1)}>Previous rows</button><button className="button secondary small" disabled={page === pageCount || Boolean(busy)} onClick={() => setPage(value => value + 1)}>Next rows</button></div></div></div>
      <section className="panel import-confirm" aria-live="polite">
        <div>{currentPreview?.summary.invalid ? <><strong>{currentPreview.summary.invalid} row{currentPreview.summary.invalid === 1 ? ' needs' : 's need'} attention</strong><p>Fix the values above or uncheck those rows, then check your changes.</p><button className="text-link" disabled={Boolean(busy)} onClick={() => setRows(current => current.map(row => Object.keys(previewRows.get(row.source_row)?.errors || {}).length ? { ...row, included: false } : row))}>Exclude invalid rows</button></> : !currentPreview ? <><strong>Check your changes before importing</strong><p>The preview checks your selected rows against your saved records.</p></> : currentPreview.summary.to_import === 0 ? <><strong>No new rows to import</strong><p>All selected rows match records already saved or repeated in this file.</p></> : <><strong>{currentPreview.summary.to_import} row{currentPreview.summary.to_import === 1 ? '' : 's'} ready to import</strong><p>Expenses: {currency(currentPreview.summary.expenses)}{currentPreview.summary.income > 0 ? ` · Income: ${currency(currentPreview.summary.income)}` : ''}{currentPreview.summary.duplicates && skipDuplicates ? ` · ${currentPreview.summary.duplicates} duplicates will be skipped` : ''}</p></>}</div>
        <div className="import-actions"><button className="button secondary" disabled={Boolean(busy) || !selectedCount} onClick={() => checkRows()}><RefreshCw size={16} />{busy === 'checking' ? 'Checking…' : 'Check changes'}</button><button className="button primary" disabled={Boolean(busy) || !currentPreview || currentPreview.summary.invalid > 0 || !currentPreview.summary.to_import} onClick={save}><Upload size={17} />{busy === 'saving' ? 'Importing…' : `Import ${currentPreview?.summary.to_import || 0} rows`}</button></div>
      </section>
    </>}
  </>;
}
