import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  CircleCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { queryString, request } from "../lib/api";
import { formatDate } from "../lib/format";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  PeriodPicker,
} from "../components/UI";

export default function Alerts() {
  const { period, notify } = useApp();
  const [unread, setUnread] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const alerts = useResource(
    `/alerts?${queryString({ ...period, unread: unread ? true : "" })}`,
  );
  async function markRead(id) {
    setBusy(id);
    setError(null);
    try {
      await request(`/alerts/${id}/read`, { method: "PATCH", body: {} });
      notify("Alert marked as read.");
      alerts.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <PageHeader
        title="Alerts"
        description="Timely check-ins to help you stay aware of your spending."
      >
        <PeriodPicker />
      </PageHeader>
      <div className="alerts-toolbar">
        <div className="page-tabs" role="group" aria-label="Alert filter">
          <button
            className={!unread ? "active" : ""}
            aria-pressed={!unread}
            onClick={() => setUnread(false)}
          >
            All alerts
          </button>
          <button
            className={unread ? "active" : ""}
            aria-pressed={unread}
            onClick={() => setUnread(true)}
          >
            Unread
          </button>
        </div>
        <Link className="text-link" to="/budgets">
          Manage budgets
        </Link>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error.message}
        </p>
      )}
      {alerts.loading ? (
        <Loading />
      ) : alerts.error ? (
        <ErrorState error={alerts.error} onRetry={alerts.reload} />
      ) : !alerts.data?.length ? (
        <section className="panel">
          <EmptyState
            icon={unread ? CheckCheck : Bell}
            title={unread ? "You’re all caught up" : "A quiet month so far"}
            description={
              unread
                ? "There are no unread alerts for this month."
                : "Budget alerts appear when spending reaches 75%, 90%, or 100% of a limit."
            }
            action={
              <Link className="button secondary small" to="/budgets">
                View budgets
              </Link>
            }
          />
        </section>
      ) : (
        <div className="alerts-list">
          {alerts.data.map((alert) => (
            <article
              key={alert.id}
              className={`alert-card ${alert.is_read ? "is-read" : ""}`}
            >
              <span
                className={`alert-icon ${alert.is_active ? `threshold-${alert.threshold_percent}` : "inactive"}`}
              >
                {alert.is_active ? (
                  <AlertTriangle size={22} />
                ) : (
                  <CircleCheck size={22} />
                )}
              </span>
              <div className="alert-content">
                <div className="alert-title">
                  <h2>{alert.category_name}</h2>
                  {!alert.is_read && (
                    <span className="unread-dot" aria-label="Unread" />
                  )}
                  <span
                    className={`status-badge ${alert.is_active ? (alert.threshold_percent >= 100 ? "exceeded" : alert.threshold_percent >= 90 ? "high" : "warning") : "normal"}`}
                  >
                    {alert.is_active
                      ? `${alert.threshold_percent}% threshold`
                      : "No longer active"}
                  </span>
                </div>
                <p>{alert.message}</p>
                <div className="alert-meta">
                  <span>
                    Current utilization:{" "}
                    <strong>
                      {Number(alert.current_utilization).toFixed(1)}%
                    </strong>
                  </span>
                  <time dateTime={alert.created_at}>
                    {formatDate(alert.created_at)}
                  </time>
                </div>
                {!alert.is_active && (
                  <p className="alert-history-note">
                    Kept as history. Your current spending is below this
                    threshold.
                  </p>
                )}
              </div>
              {alert.is_read ? (
                <span className="read-label">
                  <CheckCheck size={16} />
                  Read
                </span>
              ) : (
                <button
                  className="button secondary small"
                  disabled={busy !== null}
                  onClick={() => markRead(alert.id)}
                >
                  <Check size={16} />
                  {busy === alert.id ? "Updating…" : "Mark as read"}
                </button>
              )}
            </article>
          ))}
        </div>
      )}
      <p className="page-help">
        Each threshold is recorded once per budget. Editing or deleting an
        expense updates current utilization; earlier crossings remain in your
        history.
      </p>
    </>
  );
}
