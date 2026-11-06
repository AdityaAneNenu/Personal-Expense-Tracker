import { useEffect, useId, useRef } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Inbox,
  LoaderCircle,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { periodLabel } from "../lib/format";

export function Field({
  label,
  name,
  error,
  hint,
  children,
  className = "",
  ...props
}) {
  const generated = useId();
  const id = props.id || name || generated;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children || (
        <input
          {...props}
          id={id}
          name={name}
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
      )}
      {hint && !error && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
      {error && (
        <span className="field-error" id={`${id}-error`} role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export function Loading({ label = "Loading your data…" }) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={23} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={22} />
      <div>
        <strong>We couldn’t load this information</strong>
        <p>
          {typeof error === "string"
            ? error
            : error?.message || "Please try again."}
        </p>
        {onRetry && (
          <button className="button secondary small" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title = "Nothing here yet",
  description,
  action,
  icon: Icon = Inbox,
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon size={27} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function PageHeader({ title, description, children }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </header>
  );
}

export function PeriodPicker() {
  const { period, setPeriod } = useApp();
  const value = `${period.year}-${String(period.month).padStart(2, "0")}`;
  function move(delta) {
    const date = new Date(period.year, period.month - 1 + delta, 1);
    setPeriod({ month: date.getMonth() + 1, year: date.getFullYear() });
  }
  return (
    <div className="period-picker">
      <button
        aria-label="Previous month"
        disabled={value === "2000-01"}
        onClick={() => move(-1)}
      >
        <ArrowLeft size={16} />
      </button>
      <div className="period-control">
        <CalendarDays size={17} />
        <label className="sr-only" htmlFor="selected-month">
          Month
        </label>
        <input
          id="selected-month"
          aria-label="Month"
          type="month"
          value={value}
          min="2000-01"
          max="2100-12"
          title={periodLabel(period.month, period.year)}
          onChange={(event) => {
            const [year, month] = event.target.value.split("-").map(Number);
            if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12)
              setPeriod({ year, month });
          }}
        />
      </div>
      <button
        aria-label="Next month"
        disabled={value === "2100-12"}
        onClick={() => move(1)}
      >
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

export function Modal({ title, children, onClose, busy = false }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current && !busy) onClose();
      }}
    >
      <div className="modal-content">
        <div className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="Close dialog"
            disabled={busy}
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({
  title,
  description,
  onConfirm,
  onClose,
  busy,
  error,
  confirmLabel = "Delete",
}) {
  return (
    <Modal title={title} onClose={onClose} busy={busy}>
      <p className="modal-description">{description}</p>
      {error && (
        <p className="form-error" role="alert">
          {error.message || error}
        </p>
      )}
      <div className="form-actions">
        <button className="button secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="button danger" onClick={onConfirm} disabled={busy}>
          {busy ? "Deleting…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
