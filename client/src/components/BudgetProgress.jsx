import { currency } from "../lib/format";

export const statusLabels = {
  NORMAL: "On track",
  WARNING: "Warning",
  HIGH: "High-priority warning",
  EXCEEDED: "Budget exceeded",
};
export default function BudgetProgress({ budget, compact = false }) {
  const utilization = Number.isFinite(Number(budget.utilization))
    ? Number(budget.utilization)
    : 0;
  const status =
    budget.status ||
    (utilization >= 100
      ? "EXCEEDED"
      : utilization >= 90
        ? "HIGH"
        : utilization >= 75
          ? "WARNING"
          : "NORMAL");
  return (
    <div className={`budget-progress ${status.toLowerCase()}`}>
      <div className="budget-progress-label">
        <span>
          {currency(budget.spent)} <span className="muted">spent</span>
        </span>
        <strong>{utilization.toFixed(1)}%</strong>
      </div>
      <div
        className="progress-track"
        role="progressbar"
        aria-label={`${budget.category_name || "Budget"} utilization`}
        aria-valuenow={Math.min(100, Math.max(0, utilization))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${utilization.toFixed(1)}% used, ${statusLabels[status]}`}
      >
        <div style={{ width: `${Math.min(100, Math.max(0, utilization))}%` }} />
      </div>
      <div className="budget-progress-label">
        <span className={`status-badge ${status.toLowerCase()}`}>
          {statusLabels[status]}
        </span>
        <span className="remaining">
          {Number(budget.remaining) < 0
            ? `${currency(Math.abs(budget.remaining))} over`
            : `${currency(budget.remaining)} left`}
        </span>
      </div>
      {!compact && (
        <p className="budget-limit">
          of {currency(budget.amount)} monthly limit
        </p>
      )}
    </div>
  );
}
