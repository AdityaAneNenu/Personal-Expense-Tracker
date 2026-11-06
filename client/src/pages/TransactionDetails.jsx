import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { request } from "../lib/api";
import { currency, formatDate, paymentLabel } from "../lib/format";
import {
  ConfirmDialog,
  ErrorState,
  Loading,
  PageHeader,
} from "../components/UI";

export default function TransactionDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useApp();
  const { data, loading, error, reload } = useResource(`/transactions/${id}`);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  async function remove() {
    setBusy(true);
    setDeleteError(null);
    try {
      await request(`/transactions/${id}`, { method: "DELETE" });
      notify("Transaction deleted.");
      navigate("/transactions");
    } catch (err) {
      setDeleteError(err);
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
        title="Transaction details"
        description="A closer look at this entry."
      />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        data && (
          <section className="panel details-panel">
            <div className="detail-amount">
              <span className={`type-badge ${data.type.toLowerCase()}`}>
                {data.type === "INCOME" ? "Income" : "Expense"}
              </span>
              <h2>{currency(data.amount)}</h2>
              <p>{data.description || data.category_name}</p>
            </div>
            <dl className="details-grid">
              <div>
                <dt>Category</dt>
                <dd>{data.category_name}</dd>
              </div>
              <div>
                <dt>Transaction date</dt>
                <dd>{formatDate(data.transaction_date)}</dd>
              </div>
              <div>
                <dt>Payment method</dt>
                <dd>{paymentLabel(data.payment_method)}</dd>
              </div>
              <div>
                <dt>Added on</dt>
                <dd>{formatDate(data.created_at)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(data.updated_at)}</dd>
              </div>
              <div>
                <dt>Reference</dt>
                <dd>#{data.id}</dd>
              </div>
            </dl>
            <div className="form-actions">
              <button
                className="button danger-outline"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={17} />
                Delete transaction
              </button>
              <Link className="button primary" to={`/transactions/${id}/edit`}>
                <Pencil size={17} />
                Edit transaction
              </Link>
            </div>
          </section>
        )
      )}
      {confirm && (
        <ConfirmDialog
          title="Delete transaction?"
          description="This entry will be removed and your budgets will be recalculated."
          onClose={() => setConfirm(false)}
          onConfirm={remove}
          busy={busy}
          error={deleteError}
        />
      )}
    </>
  );
}
