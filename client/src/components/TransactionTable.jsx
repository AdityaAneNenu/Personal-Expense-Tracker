import { ArrowDownLeft, ArrowUpRight, Eye, Pencil, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { currency, formatDate, paymentLabel } from "../lib/format";
import { EmptyState } from "./UI";

export default function TransactionTable({
  transactions = [],
  onDelete,
  compact = false,
}) {
  if (!transactions.length)
    return (
      <EmptyState
        title="No transactions found"
        description="Add your first transaction or try a different set of filters."
        action={
          <Link className="button secondary small" to="/transactions/new">
            Add transaction
          </Link>
        }
      />
    );
  return (
    <div className="table-scroll">
      <table className={`transactions-table ${compact ? "compact-table" : ""}`}>
        <caption className="sr-only">Your transactions</caption>
        <thead>
          <tr>
            <th>Transaction</th>
            <th>Date</th>
            {!compact && (
              <>
                <th>Type</th>
                <th>Payment</th>
              </>
            )}
            <th className="align-right">Amount</th>
            <th className="align-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((transaction) => (
            <tr key={transaction.id}>
              <td>
                <div className="transaction-name">
                  <span
                    className={`transaction-icon ${transaction.type === "INCOME" ? "income" : "expense"}`}
                  >
                    {transaction.type === "INCOME" ? (
                      <ArrowDownLeft size={18} />
                    ) : (
                      <ArrowUpRight size={18} />
                    )}
                  </span>
                  <div>
                    <Link
                      to={`/transactions/${transaction.id}`}
                      className="transaction-title"
                    >
                      {transaction.description || transaction.category_name}
                    </Link>
                    <span>{transaction.category_name}</span>
                  </div>
                </div>
              </td>
              <td className="date-cell">
                {formatDate(transaction.transaction_date, { year: undefined })}
              </td>
              {!compact && (
                <>
                  <td>
                    <span
                      className={`type-badge ${transaction.type.toLowerCase()}`}
                    >
                      {transaction.type === "INCOME" ? "Income" : "Expense"}
                    </span>
                  </td>
                  <td className="payment-cell">
                    {paymentLabel(transaction.payment_method)}
                  </td>
                </>
              )}
              <td
                className={`amount-cell ${transaction.type === "INCOME" ? "positive" : ""}`}
              >
                {transaction.type === "INCOME" ? "+" : "−"}
                {currency(transaction.amount)}
              </td>
              <td>
                <div className="table-actions">
                  {compact ? (
                    <Link
                      className="icon-button"
                      to={`/transactions/${transaction.id}`}
                      aria-label={`View ${transaction.description || transaction.category_name}`}
                    >
                      <Eye size={17} />
                    </Link>
                  ) : (
                    <>
                      <Link
                        className="icon-button"
                        to={`/transactions/${transaction.id}/edit`}
                        aria-label={`Edit ${transaction.description || transaction.category_name}`}
                      >
                        <Pencil size={16} />
                      </Link>
                      {onDelete && (
                        <button
                          className="icon-button delete-icon"
                          onClick={() => onDelete(transaction)}
                          aria-label={`Delete ${transaction.description || transaction.category_name}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
