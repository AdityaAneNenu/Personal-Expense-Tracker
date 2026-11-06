import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  LockKeyhole,
  Pencil,
  Plus,
  Tags,
  Trash2,
} from "lucide-react";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Modal,
  PageHeader,
} from "../components/UI";

export default function Categories() {
  const categories = useResource("/categories");
  const { notify } = useApp();
  const [type, setType] = useState("EXPENSE");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", type: "EXPENSE" });
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [nameError, setNameError] = useState(null);
  function open(category) {
    setEditing(category || {});
    setForm({ name: category?.name || "", type: category?.type || type });
    setError(null);
    setNameError(null);
  }
  async function save(event) {
    event.preventDefault();
    setError(null);
    setNameError(null);
    if (form.name.trim().length < 2 || form.name.trim().length > 80) {
      setNameError("Use between 2 and 80 characters.");
      return;
    }
    setBusy(true);
    try {
      await request(editing.id ? `/categories/${editing.id}` : "/categories", {
        method: editing.id ? "PUT" : "POST",
        body: { ...form, name: form.name.trim() },
      });
      notify(editing.id ? "Category updated." : "Category created.");
      setEditing(null);
      setType(form.type);
      categories.reload();
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
      await request(`/categories/${deleting.id}`, { method: "DELETE" });
      notify("Category deleted.");
      setDeleting(null);
      categories.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }
  const visible = (categories.data || []).filter(
    (category) => category.type === type,
  );
  return (
    <>
      <PageHeader
        title="Categories"
        description="Organize your money in a way that makes sense to you."
      >
        <button className="button primary" onClick={() => open()}>
          <Plus size={18} />
          Add category
        </button>
      </PageHeader>
      <div className="page-tabs" role="group" aria-label="Category type">
        <button
          className={type === "EXPENSE" ? "active" : ""}
          aria-pressed={type === "EXPENSE"}
          onClick={() => setType("EXPENSE")}
        >
          <ArrowUpRight size={17} />
          Expense categories
        </button>
        <button
          className={type === "INCOME" ? "active" : ""}
          aria-pressed={type === "INCOME"}
          onClick={() => setType("INCOME")}
        >
          <ArrowDownLeft size={17} />
          Income categories
        </button>
      </div>
      {categories.loading ? (
        <Loading />
      ) : categories.error ? (
        <ErrorState error={categories.error} onRetry={categories.reload} />
      ) : !visible.length ? (
        <EmptyState
          icon={Tags}
          title="Create your first category"
          description="Add a category to start organizing your transactions."
        />
      ) : (
        <div className="category-grid">
          {visible.map((category) => (
            <article className="category-card" key={category.id}>
              <span className={`category-card-icon ${type.toLowerCase()}`}>
                {type === "INCOME" ? (
                  <ArrowDownLeft size={22} />
                ) : (
                  <Tags size={22} />
                )}
              </span>
              <div className="category-card-info">
                <h2>{category.name}</h2>
                <p>
                  {category.user_id === null ? (
                    <>
                      <LockKeyhole size={12} />
                      Predefined category
                    </>
                  ) : (
                    "Your custom category"
                  )}
                </p>
              </div>
              {category.user_id !== null && (
                <div className="table-actions">
                  <button
                    className="icon-button"
                    aria-label={`Edit ${category.name}`}
                    onClick={() => open(category)}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button delete-icon"
                    aria-label={`Delete ${category.name}`}
                    onClick={() => {
                      setDeleting(category);
                      setError(null);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="page-help">
        <LockKeyhole size={15} />
        Predefined categories are available to everyone. Custom categories can
        be deleted when no transactions or budgets use them.
      </p>
      {editing && (
        <Modal
          title={editing.id ? "Edit category" : "Add category"}
          onClose={() => setEditing(null)}
          busy={busy}
        >
          <form onSubmit={save} noValidate>
            <Field
              label="Category name"
              name="category_name"
              autoFocus
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              error={nameError}
              placeholder="e.g. Fitness"
              maxLength={80}
              required
            />
            <Field label="Category type" name="category_type">
              <select
                id="category_type"
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value })
                }
              >
                <option value="EXPENSE">Expense</option>
                <option value="INCOME">Income</option>
              </select>
            </Field>
            {editing.id && (
              <p className="field-hint">
                The type can only change while this category is unused.
              </p>
            )}
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
                    : "Create category"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete category?"
          description={`Delete “${deleting.name}”? Categories used by transactions or budgets cannot be removed.`}
          onClose={() => setDeleting(null)}
          onConfirm={remove}
          error={error}
          busy={busy}
        />
      )}
    </>
  );
}
