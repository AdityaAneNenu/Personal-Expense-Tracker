import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowDown,
  ArrowUp,
  Minus,
  Plus,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useApp } from "../context/AppContext";
import useResource from "../hooks/useResource";
import { queryString } from "../lib/api";
import { currency } from "../lib/format";
import {
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  PeriodPicker,
} from "../components/UI";
import {
  CategoryChart,
  MonthlyChart,
  SpendingChart,
} from "../components/Charts";
import BudgetProgress from "../components/BudgetProgress";
import TransactionTable from "../components/TransactionTable";

function MonthComparison({ amount, previous, expense = false }) {
  if (!previous) {
    return (
      <p className="comparison-note">
        No {expense ? "expenses" : "income"} recorded last month
      </p>
    );
  }
  const difference =
    ((Number(amount) - Number(previous)) / Number(previous)) * 100;
  const Icon = difference > 0 ? ArrowUp : difference < 0 ? ArrowDown : Minus;
  const beneficial = expense ? difference < 0 : difference > 0;
  const tone =
    difference === 0
      ? "is-neutral"
      : beneficial
        ? "is-positive"
        : "is-negative";
  return (
    <div className="summary-comparison">
      <span className={`comparison-direction ${tone}`}>
        <Icon size={14} aria-hidden="true" />
        <span className="sr-only">
          {difference > 0
            ? "Increased by "
            : difference < 0
              ? "Decreased by "
              : "No change: "}
        </span>
        {Math.abs(difference).toFixed(1)}%
      </span>
      <span className="comparison-note">vs. previous month</span>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { period } = useApp();
  const { data, loading, error, reload } = useResource(
    `/dashboard/summary?${queryString(period)}`,
  );
  const previousDate = new Date(period.year, period.month - 2, 1);
  const previousMonth = data?.monthly?.find(
    (month) =>
      month.year === previousDate.getFullYear() &&
      month.month === previousDate.getMonth() + 1,
  );
  const savingsRate =
    Number(data?.income) > 0
      ? ((Number(data.net_savings) / Number(data.income)) * 100).toFixed(1)
      : null;
  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.name.split(" ")[0]}. Here’s how your month is shaping up.`}
      >
        <PeriodPicker />
        <Link className="button primary" to="/transactions/new">
          <Plus size={18} />
          Add transaction
        </Link>
      </PageHeader>
      {loading ? (
        <Loading label="Building your monthly overview…" />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        data && (
          <>
            <section className="summary-grid" aria-label="Monthly summary">
              <div className="savings-card">
                <div className="summary-label">
                  <span>Net savings</span>
                  <span className="summary-icon">
                    <Wallet size={21} />
                  </span>
                </div>
                <strong className="summary-value">
                  {currency(data.net_savings)}
                </strong>
                <div className="savings-foot">
                  <span className="savings-rate">
                    <TrendingUp size={15} />
                    {savingsRate !== null
                      ? `${savingsRate}% savings rate`
                      : "Income minus expenses"}
                  </span>
                  <span>
                    {savingsRate !== null
                      ? "of this month’s income"
                      : "This month"}
                  </span>
                </div>
              </div>
              <div className="summary-card">
                <div className="summary-label">
                  <span>Total income</span>
                  <span className="summary-icon income">
                    <ArrowDownLeft size={21} />
                  </span>
                </div>
                <strong className="summary-value">
                  {currency(data.income)}
                </strong>
                <MonthComparison
                  amount={data.income}
                  previous={previousMonth?.income}
                />
              </div>
              <div className="summary-card">
                <div className="summary-label">
                  <span>Total expenses</span>
                  <span className="summary-icon expense">
                    <ArrowUpRight size={21} />
                  </span>
                </div>
                <strong className="summary-value">
                  {currency(data.expenses)}
                </strong>
                <MonthComparison
                  amount={data.expenses}
                  previous={previousMonth?.expenses}
                  expense
                />
              </div>
            </section>
            <div className="dashboard-charts">
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Income vs. expenses</h2>
                    <p>Your cash flow over the last six months</p>
                  </div>
                  <span className="panel-note">In INR</span>
                </div>
                <MonthlyChart data={data.monthly} />
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Where your money goes</h2>
                    <p>This month’s expense breakdown</p>
                  </div>
                </div>
                <CategoryChart data={data.category_breakdown} />
              </section>
            </div>
            <div className="dashboard-bottom">
              <section className="panel transaction-panel">
                <div className="panel-heading">
                  <div>
                    <h2>Recent transactions</h2>
                    <p>Your latest entries this month</p>
                  </div>
                  <Link className="text-link" to="/transactions">
                    View all <ArrowUpRight size={15} />
                  </Link>
                </div>
                <TransactionTable
                  transactions={data.recent_transactions}
                  compact
                />
              </section>
              <section className="panel monthly-budget">
                <div className="panel-heading">
                  <div>
                    <h2>Monthly budget</h2>
                    <p>Your overall spending plan</p>
                  </div>
                  <Target size={22} className="muted" />
                </div>
                {data.overall_budget ? (
                  <>
                    <span className="budget-total">
                      {currency(data.overall_budget.amount)}
                    </span>
                    <span className="muted budget-total-caption">
                      Your overall expense limit
                    </span>
                    <BudgetProgress budget={data.overall_budget} compact />
                    <div className="budget-advice">
                      {data.overall_budget.status === "NORMAL"
                        ? "You’re within your spending limit for this month."
                        : data.overall_budget.status === "EXCEEDED"
                          ? "Your monthly limit has been reached. Review your spending plan."
                          : "Approaching your limit. Check your upcoming expenses."}
                    </div>
                    <Link className="button secondary full-width" to="/budgets">
                      Manage budgets
                    </Link>
                  </>
                ) : (
                  <EmptyState
                    icon={Target}
                    title="Give your month a plan"
                    description="Set a spending limit and we’ll help you keep an eye on it."
                    action={
                      <Link className="button secondary small" to="/budgets">
                        Create a budget
                      </Link>
                    }
                  />
                )}
              </section>
            </div>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Daily spending</h2>
                  <p>How your expenses add up, day by day</p>
                </div>
                <Link className="text-link" to="/reports">
                  Explore reports <ArrowUpRight size={15} />
                </Link>
              </div>
              <SpendingChart data={data.spending_trend} />
            </section>
          </>
        )
      )}
    </>
  );
}
