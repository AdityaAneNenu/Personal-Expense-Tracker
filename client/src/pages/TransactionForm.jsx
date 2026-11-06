import { useEffect, useState } from "react";
import {
  Upload,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Info,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import { paymentLabel, today, validateTransaction } from "../lib/format";
import { ErrorState, Field, Loading, PageHeader } from "../components/UI";

const payments = [
  "UPI",
  "CASH",
  "DEBIT_CARD",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "OTHER",
];
export function TransactionForm({
  initial,
  categories = [],
  onSubmit,
  busy = false,
  submitLabel = "Save transaction",
}) {
  const [form, setForm] = useState(() => ({
    type: "EXPENSE",
    amount: "",
    category_id: "",
    description: "",
    payment_method: "UPI",
    transaction_date: today(),
    ...initial,
  }));
  const [errors, setErrors] = useState({});
  const filtered = categories.filter((category) => category.type === form.type);
  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }
  function selectType(type) {
    setForm({
      ...form,
      type,
      category_id: form.type === type ? form.category_id : "",
    });
    setErrors({ ...errors, category_id: undefined });
  }
  function submit(event) {
    event.preventDefault();
    const next = validateTransaction(form);
    if (
      form.category_id &&
      !filtered.some((item) => String(item.id) === String(form.category_id))
    )
      next.category_id = "Choose a category that matches the transaction type.";
    setErrors(next);
    if (!Object.keys(next).length)
      onSubmit({
        type: form.type,
        amount: Number(form.amount),
        category_id: String(form.category_id),
        description: form.description.trim(),
        payment_method: form.payment_method,
        transaction_date: form.transaction_date,
      });
  }
  return (
    <form className="transaction-form" noValidate onSubmit={submit}>
      <fieldset className="type-fieldset">
        <legend>Transaction type</legend>
        <div className="type-toggle">
          <button
            type="button"
            aria-pressed={form.type === "EXPENSE"}
            className={form.type === "EXPENSE" ? "selected expense-option" : ""}
            onClick={() => selectType("EXPENSE")}
          >
            <ArrowUpRight size={19} />
            Expense
          </button>
          <button
            type="button"
            aria-pressed={form.type === "INCOME"}
            className={form.type === "INCOME" ? "selected income-option" : ""}
            onClick={() => selectType("INCOME")}
          >
            <ArrowDownLeft size={19} />
            Income
          </button>
        </div>
      </fieldset>
      <div className="form-grid">
        <Field
          label="Amount (₹)"
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          max="9999999999.99"
          step="0.01"
          placeholder="0.00"
          value={form.amount}
          onChange={update}
          error={errors.amount}
          required
        />
        <Field
          label="Transaction date"
          name="transaction_date"
          type="date"
          min="2000-01-01"
          max="2100-12-31"
          value={form.transaction_date}
          onChange={update}
          error={errors.transaction_date}
          required
        />
        <Field label="Category" name="category_id" error={errors.category_id}>
          <select
            id="category_id"
            name="category_id"
            value={form.category_id}
            onChange={update}
            aria-invalid={!!errors.category_id}
            aria-describedby={
              errors.category_id ? "category_id-error" : undefined
            }
            required
          >
            <option value="">Select a category</option>
            {filtered.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Payment method"
          name="payment_method"
          error={errors.payment_method}
        >
          <select
            id="payment_method"
            name="payment_method"
            value={form.payment_method}
            onChange={update}
          >
            {payments.map((payment) => (
              <option value={payment} key={payment}>
                {paymentLabel(payment)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          className="span-two"
          label="Description"
          name="description"
          hint="Optional. A short note makes this easier to find later."
          error={errors.description}
        >
          <textarea
            id="description"
            name="description"
            rows={3}
            maxLength={500}
            placeholder="What was this transaction for?"
            value={form.description}
            onChange={update}
          />
        </Field>
      </div>
      <div className="form-actions">
        <Link className="button secondary" to="/transactions">
          Cancel
        </Link>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? (
            "Saving…"
          ) : (
            <>
              <Check size={18} />
              {submitLabel}
            </>
          )}
        </button>
      </div>
    </form>
  );
}

export default function TransactionFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const { notify } = useApp();
  const navigate = useNavigate();
  const categories = useResource("/categories");
  const [initial, setInitial] = useState(null);
  const [loading, setLoading] = useState(editing);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    request(`/transactions/${id}`, { signal: controller.signal })
      .then((response) => setInitial(response.data))
      .catch((err) => {
        if (err.name !== "AbortError") setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [id, revision]);
  async function submit(form) {
    setBusy(true);
    setError(null);
    try {
      await request(editing ? `/transactions/${id}` : "/transactions", {
        method: editing ? "PUT" : "POST",
        body: form,
      });
      notify(editing ? "Transaction updated." : "Transaction added.");
      navigate("/transactions");
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link className="back-link" to="/transactions">
        <ArrowLeft size={16} />
        Back to transactions
      </Link>
      <PageHeader
        title={editing ? "Edit transaction" : "Add transaction"}
        description={
          editing
            ? "Make a correction. Your reports and budgets update automatically."
            : "Every entry brings your financial picture into focus."
        }
      >
        {!editing && <Link className="button secondary" to="/transactions/import"><Upload size={17} />Import from CSV</Link>}
      </PageHeader>
      {categories.loading || loading ? (
        <Loading />
      ) : categories.error || (editing && !initial && error) ? (
        <ErrorState
          error={categories.error || error}
          onRetry={() => {
            categories.reload();
            setRevision(revision + 1);
          }}
        />
      ) : (
        <div className="form-page-grid">
          <section className="panel form-panel">
            <h2>Transaction details</h2>
            {error && (
              <p className="form-error" role="alert">
                {error.message}
              </p>
            )}
            <TransactionForm
              key={id || "new"}
              initial={initial}
              categories={categories.data}
              onSubmit={submit}
              busy={busy}
              submitLabel={editing ? "Save changes" : "Add transaction"}
            />
          </section>
          <aside className="form-aside">
            <span className="aside-icon">
              <Info size={23} />
            </span>
            <h3>A useful little record</h3>
            <p>
              Choose the category that fits best. Only expense transactions
              count toward your monthly budgets.
            </p>
            <p>
              Need to record a refund? Adjust the original expense to the amount
              you actually paid, or delete it for a full refund.
            </p>
            <Link className="text-link" to="/categories">
              Manage your categories
            </Link>
          </aside>
        </div>
      )}
    </>
  );
}
