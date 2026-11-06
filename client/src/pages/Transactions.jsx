import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Plus,
  Search,
  SlidersHorizontal,
  Upload,
  X,
} from "lucide-react";
import { Link } from "react-router-dom";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { queryString, request } from "../lib/api";
import {
  ConfirmDialog,
  ErrorState,
  Field,
  Loading,
  PageHeader,
} from "../components/UI";
import TransactionTable from "../components/TransactionTable";
import { downloadFile, transactionCsv } from '../lib/csv';
import { today } from '../lib/format';

const emptyFilters = {
  search: "",
  start_date: "",
  end_date: "",
  category_id: "",
  type: "",
  sort_by: "transaction_date",
  sort_order: "desc",
};
export default function Transactions() {
  const { notify } = useApp();
  const [draft, setDraft] = useState(emptyFilters);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [filterError, setFilterError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const categories = useResource("/categories");
  const transactions = useResource(
    `/transactions?${queryString({ ...filters, page, page_size: 10 })}`,
  );
  const categoryOptions = (categories.data || []).filter(
    (item) => !draft.type || item.type === draft.type,
  );
  function update(event) {
    setDraft({
      ...draft,
      [event.target.name]: event.target.value,
      ...(event.target.name === "type" ? { category_id: "" } : {}),
    });
  }
  function apply(event) {
    event.preventDefault();
    if (
      draft.start_date &&
      draft.end_date &&
      draft.start_date > draft.end_date
    ) {
      setFilterError("The start date must come before the end date.");
      return;
    }
    setFilterError(null);
    setPage(1);
    setFilters({ ...draft });
  }
  function reset() {
    setDraft(emptyFilters);
    setFilters(emptyFilters);
    setPage(1);
    setFilterError(null);
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await request(`/transactions/${selected.id}`, { method: "DELETE" });
      setSelected(null);
      notify("Transaction deleted. Your budgets are up to date.");
      if (transactions.data?.length === 1 && page > 1) setPage(page - 1);
      else transactions.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function exportCsv() {
    setExporting(true); setExportError(null);
    try {
      const response = await request(`/transactions/export?${queryString(filters)}`);
      downloadFile(transactionCsv(response.data), `spendwise-transactions-${today()}.csv`, 'text/csv;charset=utf-8');
      notify(`${response.data.length} transactions exported as CSV.`);
    } catch (err) { setExportError(err.message); }
    finally { setExporting(false); }
  }
  const meta = transactions.meta;
  return (
    <>
      <PageHeader
        title="Transactions"
        description="The details behind your day-to-day spending."
      >
        <Link className="button secondary" to="/transactions/import"><Upload size={17} />Import from CSV</Link>
        <button className="button secondary" disabled={exporting || transactions.loading || !meta?.total || Boolean(transactions.error)} onClick={exportCsv} title="Export all rows matching the applied filters"><Download size={17} />{exporting ? 'Exporting…' : 'Export CSV'}</button>
        <Link className="button primary" to="/transactions/new">
          <Plus size={18} />
          Add transaction
        </Link>
      </PageHeader>
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      <section className="panel filters-panel">
        <form onSubmit={apply}>
          <div className="filter-search-row">
            <div className="search-field">
              <Search size={18} />
              <label className="sr-only" htmlFor="transaction-search">
                Search descriptions
              </label>
              <input
                id="transaction-search"
                name="search"
                placeholder="Search descriptions…"
                value={draft.search}
                onChange={update}
                maxLength={200}
              />
            </div>
            <button className="button secondary" type="submit">
              <SlidersHorizontal size={16} />
              Apply filters
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Reset filters"
              title="Reset filters"
              onClick={reset}
            >
              <X size={18} />
            </button>
          </div>
          <div className="filter-grid">
            <Field
              label="From date"
              name="start_date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={draft.start_date}
              onChange={update}
            />
            <Field
              label="To date"
              name="end_date"
              type="date"
              min="2000-01-01"
              max="2100-12-31"
              value={draft.end_date}
              onChange={update}
            />
            <Field label="Type" name="type">
              <select
                id="type"
                name="type"
                value={draft.type}
                onChange={update}
              >
                <option value="">All types</option>
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </select>
            </Field>
            <Field label="Category" name="filter_category">
              <select
                id="filter_category"
                name="category_id"
                value={draft.category_id}
                onChange={update}
              >
                <option value="">All categories</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sort by" name="sort_by">
              <select
                id="sort_by"
                name="sort_by"
                value={draft.sort_by}
                onChange={update}
              >
                <option value="transaction_date">Transaction date</option>
                <option value="amount">Amount</option>
                <option value="created_at">Date added</option>
              </select>
            </Field>
            <Field label="Order" name="sort_order">
              <select
                id="sort_order"
                name="sort_order"
                value={draft.sort_order}
                onChange={update}
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </Field>
          </div>
          {filterError && (
            <p className="field-error" role="alert">
              {filterError}
            </p>
          )}
          {categories.error && (
            <p className="field-error" role="alert">
              Categories unavailable.{" "}
              <button
                type="button"
                className="text-button"
                onClick={categories.reload}
              >
                Retry
              </button>
            </p>
          )}
        </form>
      </section>
      <section className="panel transaction-panel">
        <div className="panel-heading">
          <div>
            <h2>All transactions</h2>
            <p>
              {meta
                ? `${meta.total} ${meta.total === 1 ? "transaction" : "transactions"} in this view`
                : "Your income and expenses"}
            </p>
          </div>
          <span className="panel-note">Amounts in INR</span>
        </div>
        {transactions.loading ? (
          <Loading />
        ) : transactions.error ? (
          <ErrorState
            error={transactions.error}
            onRetry={transactions.reload}
          />
        ) : (
          <>
            <TransactionTable
              transactions={transactions.data}
              onDelete={(record) => {
                setSelected(record);
                setError(null);
              }}
            />
            {meta && meta.total > 0 && (
              <div className="pagination">
                <span>
                  Showing {(meta.page - 1) * meta.page_size + 1}–
                  {Math.min(meta.page * meta.page_size, meta.total)} of{" "}
                  {meta.total}
                </span>
                <div>
                  <button
                    className="button secondary small"
                    aria-label="Previous page"
                    disabled={page <= 1}
                    onClick={() => setPage(page - 1)}
                  >
                    <ArrowLeft size={16} />
                    Previous
                  </button>
                  <span>
                    Page {page} of {meta.total_pages}
                  </span>
                  <button
                    className="button secondary small"
                    aria-label="Next page"
                    disabled={page >= meta.total_pages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </section>
      {selected && (
        <ConfirmDialog
          title="Delete transaction?"
          description={`“${selected.description || selected.category_name}” will be removed. Your reports and budgets will be recalculated.`}
          onClose={() => setSelected(null)}
          onConfirm={remove}
          busy={busy}
          error={error}
        />
      )}
    </>
  );
}
