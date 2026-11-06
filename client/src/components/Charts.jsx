import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, ChartPie, TrendingUp } from "lucide-react";
import { compactCurrency, currency, formatDate } from "../lib/format";
import { EmptyState } from "./UI";

const palette = [
  "var(--chart-income)",
  "var(--chart-expense)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-9)",
];
const tooltipStyle = {
  border: "1px solid var(--border)",
  backgroundColor: "var(--floating-surface, var(--surface))",
  borderRadius: 12,
  fontSize: 13,
  color: "var(--ink)",
  boxShadow: "0 8px 25px var(--floating-shadow, #19233f12)",
};

export function MonthlyChart({ data = [] }) {
  if (!data.some((item) => Number(item.income) || Number(item.expenses)))
    return (
      <EmptyState
        icon={BarChart3}
        title="Your money story starts here"
        description="Add income and expenses to see how your months compare."
      />
    );
  return (
    <>
      <div className="chart-key">
        <span className="chart-key-item">
          <i className="chart-key-swatch" style={{ background: "var(--chart-income)" }} />
          Income
        </span>
        <span className="chart-key-item">
          <i className="chart-key-swatch" style={{ background: "var(--chart-expense)" }} />
          Expenses
        </span>
      </div>
      <div
        className="chart-canvas"
        role="img"
        aria-label="Bar chart comparing income and expenses for the last six months. Exact values are available in the data table below."
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            barGap={6}
            margin={{ top: 16, right: 8, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 4"
              vertical={false}
              stroke="var(--chart-grid)"
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-label)", fontSize: 13 }}
              minTickGap={14}
              dy={8}
            />
            <YAxis
              tickFormatter={compactCurrency}
              width={48}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-label)", fontSize: 13 }}
            />
            <Tooltip
              formatter={(value) => currency(value)}
              contentStyle={tooltipStyle}
              cursor={{ fill: "var(--chart-hover)" }}
            />
            <Bar
              name="Income"
              dataKey="income"
              fill="var(--chart-income)"
              radius={[5, 5, 0, 0]}
              maxBarSize={30}
              isAnimationActive={false}
            />
            <Bar
              name="Expenses"
              dataKey="expenses"
              fill="var(--chart-expense)"
              radius={[5, 5, 0, 0]}
              maxBarSize={30}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-details">
        <summary>View monthly figures</summary>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Monthly income and expenses</caption>
            <thead>
              <tr>
                <th>Month</th>
                <th>Income</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={`${item.year}-${item.month}`}>
                  <td>{item.label}</td>
                  <td>{currency(item.income)}</td>
                  <td>{currency(item.expenses)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

export function CategoryChart({ data = [] }) {
  const total = data.reduce((sum, item) => sum + Number(item.amount), 0);
  if (!total)
    return (
      <EmptyState
        icon={ChartPie}
        title="No expenses this month"
        description="Your expense categories will appear here as you add transactions."
      />
    );
  return (
    <div className="category-chart">
      <div
        className="donut-wrap"
        role="img"
        aria-label={`Expense distribution, total ${currency(total)}. Category amounts are listed below.`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="amount"
              nameKey="category_name"
              cx="50%"
              cy="50%"
              innerRadius="70%"
              outerRadius="88%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {data.map((item, index) => (
                <Cell
                  key={item.category_id}
                  fill={palette[index % palette.length]}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => currency(value)}
              contentStyle={tooltipStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="donut-center">
          <span>Total spent</span>
          <strong>{currency(total)}</strong>
        </div>
      </div>
      <ul className="category-legend">
        {data.map((item, index) => (
          <li key={item.category_id}>
            <span className="legend-label">
              <i style={{ background: palette[index % palette.length] }} />
              <span className="legend-name">{item.category_name}</span>
            </span>
            <strong>{currency(item.amount)}</strong>
            <small className="legend-percentage">
              {((Number(item.amount) / total) * 100).toFixed(0)}%
            </small>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SpendingChart({ data = [] }) {
  if (!data.some((item) => Number(item.amount)))
    return (
      <EmptyState
        icon={TrendingUp}
        title="A clearer view, day by day"
        description="Add an expense to start your daily spending trend."
      />
    );
  return (
    <>
      <div
        className="chart-canvas trend-canvas"
        role="img"
        aria-label="Line chart of daily expense totals for the selected month. Exact amounts are in the data table below."
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 16, right: 12, left: 0, bottom: 4 }}
          >
            <CartesianGrid
              strokeDasharray="3 4"
              vertical={false}
              stroke="var(--chart-grid)"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => String(Number(value.slice(8, 10)))}
              tickLine={false}
              axisLine={false}
              minTickGap={25}
              tick={{ fill: "var(--chart-label)", fontSize: 13 }}
              dy={8}
            />
            <YAxis
              tickFormatter={compactCurrency}
              width={48}
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--chart-label)", fontSize: 13 }}
            />
            <Tooltip
              labelFormatter={(value) => formatDate(value)}
              formatter={(value) => [currency(value), "Expenses"]}
              contentStyle={tooltipStyle}
            />
            <Line
              type="monotone"
              dataKey="amount"
              stroke="var(--chart-income)"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--surface)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-details">
        <summary>View daily figures</summary>
        <div className="table-scroll daily-table">
          <table>
            <caption className="sr-only">Daily spending totals</caption>
            <thead>
              <tr>
                <th>Date</th>
                <th>Expenses</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => (
                <tr key={item.date}>
                  <td>{formatDate(item.date)}</td>
                  <td>{currency(item.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
