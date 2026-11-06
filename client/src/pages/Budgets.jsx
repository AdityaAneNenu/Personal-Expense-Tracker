import { useState } from "react";
import { Info, Pencil, Plus, Target, Trash2 } from "lucide-react";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { queryString, request } from "../lib/api";
import { currency, periodLabel, validAmount } from "../lib/format";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
  PeriodPicker,
} from "../components/UI";
import BudgetProgress from "../components/BudgetProgress";

export default function Budgets() {
  const { period, notify } = useApp();
  const budgets = useResource(`/budgets?${queryString(period)}`);
  const categories = useResource("/categories?type=EXPENSE");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ category_id: "", amount: "" });
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState(null);
  const [amountError, setAmountError] = useState(null);
  const [busy, setBusy] = useState(false);
  function open(budget) {
    setEditing(budget || {});
    setForm({
      category_id: budget?.category_id || "",
      amount: budget?.amount || "",
    });
    setError(null);
    setAmountError(null);
  }
  async function save(event) {
    event.preventDefault();
    setError(null);
    setAmountError(null);
    if (!validAmount(form.amount)) {
      setAmountError(
        "Enter a positive budget with at most two decimal places.",
      );
      return;
    }
    setBusy(true);
    try {
      await request(editing.id ? `/budgets/${editing.id}` : "/budgets", {
        method: editing.id ? "PUT" : "POST",
        body: {
          ...period,
          category_id: form.category_id ? String(form.category_id) : null,
          amount: Number(form.amount),
        },
      });
      notify(editing.id ? "Budget updated." : "Budget created.");
      setEditing(null);
      budgets.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await request(`/budgets/${deleting.id}`, { method: "DELETE" });
      notify("Budget deleted.");
      setDeleting(null);
      budgets.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const items = [...(budgets.data || [])].sort(
    (a, b) => Number(a.category_id !== null) - Number(b.category_id !== null),
  );
  return (
    <>
      <PageHeader
        title="Budgets"
        description="A plan for your money, with room to adjust."
      >
        <PeriodPicker />
        <button className="button primary" onClick={() => open()}>
          <Plus size={18} />
          Create budget
        </button>
      </PageHeader>
      <div className="budget-intro">
        <span className="aside-icon">
          <Target size={23} />
        </span>
        <div>
          <strong>Spend with a little more intention.</strong>
          <p>
            Set an overall monthly limit, then add category budgets for the
            things you want to watch closely.
          </p>
        </div>
      </div>
      {budgets.loading ? (
        <Loading />
      ) : budgets.error ? (
        <ErrorState error={budgets.error} onRetry={budgets.reload} />
      ) : !items.length ? (
        <section className="panel">
          <EmptyState
            icon={Target}
            title="A fresh month. A fresh plan."
            description={`Create a budget for ${periodLabel(period.month, period.year)}. Existing expenses will count toward it automatically.`}
            action={
              <button className="button primary" onClick={() => open()}>
                <Plus size={17} />
                Create your first budget
              </button>
            }
          />
        </section>
      ) : (
        <div className="budget-grid">
          {items.map((budget) => (
            <article
              key={budget.id}
              className={`panel budget-card ${budget.category_id === null ? "overall-card" : ""}`}
            >
              <div className="budget-card-heading">
                <span className="budget-icon">
                  <Target size={20} />
                </span>
                <div>
                  <h2>{budget.category_name}</h2>
                  <p>
                    {budget.category_id === null
                      ? "All expense categories"
                      : "Category spending limit"}
                  </p>
                </div>
                <div className="table-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${budget.category_name}`}
                    onClick={() => open(budget)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button delete-icon"
                    aria-label={`Delete ${budget.category_name}`}
                    onClick={() => {
                      setDeleting(budget);
                      setError(null);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <div className="budget-card-amount">
                {currency(budget.amount)}
                <span>monthly limit</span>
              </div>
              <BudgetProgress budget={budget} compact />
            </article>
          ))}
        </div>
      )}
      <div className="budget-thresholds">
        <h2>Know when to check in</h2>
        <div>
          <span>
            <i className="threshold-dot normal" />
            Below 75% · On track
          </span>
          <span>
            <i className="threshold-dot warning" />
            75% · Warning
          </span>
          <span>
            <i className="threshold-dot high" />
            90% · High-priority warning
          </span>
          <span>
            <i className="threshold-dot exceeded" />
            100% · Budget exceeded
          </span>
        </div>
        <p>
          <Info size={15} />
          Overall and category budgets track overlapping expenses. They are
          separate limits and aren’t added together.
        </p>
      </div>
      {editing && (
        <Modal
          title={editing.id ? "Edit budget" : "Create budget"}
          onClose={() => setEditing(null)}
          busy={busy}
        >
          <p className="modal-description">
            Plan your expenses for {periodLabel(period.month, period.year)}.
          </p>
          {categories.loading ? (
            <Loading />
          ) : categories.error ? (
            <ErrorState error={categories.error} onRetry={categories.reload} />
          ) : (
            <form noValidate onSubmit={save}>
              <Field label="Budget for" name="budget_category">
                <select
                  id="budget_category"
                  value={form.category_id}
                  onChange={(event) =>
                    setForm({ ...form, category_id: event.target.value })
                  }
                >
                  <option value="">Overall budget · All expenses</option>
                  {categories.data?.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Monthly limit (₹)"
                name="budget_amount"
                type="number"
                min="0.01"
                step="0.01"
                max="9999999999.99"
                inputMode="decimal"
                placeholder="e.g. 15000"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                error={amountError}
                required
              />
              {error && (
                <p className="form-error" role="alert">
                  {error.message}
                </p>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setEditing(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  {busy
                    ? "Saving…"
                    : editing.id
                      ? "Save changes"
                      : "Create budget"}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete budget?"
          description={`Remove the ${deleting.category_name.toLowerCase()} and its alerts? Your transactions will stay in place.`}
          onClose={() => setDeleting(null)}
          onConfirm={remove}
          busy={busy}
          error={error}
        />
      )}
    </>
  );
}
