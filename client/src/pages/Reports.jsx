import { useState } from 'react';
import { Download, FileText } from "lucide-react";
import useResource from "../hooks/useResource";
import { useApp } from "../context/AppContext";
import { queryString, request } from "../lib/api";
import { currency, periodLabel } from "../lib/format";
import { encodeCsv, downloadFile } from '../lib/csv';
import { useAuth } from '../context/AuthContext';
import {
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

export default function Reports() {
  const { period, notify } = useApp();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(null);
  const monthly = useResource(`/reports/monthly?${queryString(period)}`);
  const categories = useResource(
    `/reports/category-breakdown?${queryString(period)}`,
  );
  const selected = monthly.data?.monthly.find(
    (item) => item.month === period.month && item.year === period.year,
  );
  const income = Number(selected?.income || 0);
  const expenses = Number(selected?.expenses || 0);
  const loading = monthly.loading || categories.loading;
  const error = monthly.error || categories.error;
  async function download() {
    setExporting('csv'); setExportError(null);
    try {
      const { data: report } = await request(`/dashboard/summary?${queryString(period)}`);
    const rows = [
      ["SpendWise monthly report", periodLabel(period.month, period.year)],
      [],
      ["Month", "Income (INR)", "Expenses (INR)"],
      ...report.monthly.map((item) => [
        item.label,
        item.income,
        item.expenses,
      ]),
      [],
      ["Expense category", "Amount (INR)"],
      ...report.category_breakdown.map((item) => [item.category_name, item.amount]),
      [],
      ["Date", "Expenses (INR)"],
      ...report.spending_trend.map((item) => [item.date, item.amount]),
    ];
    downloadFile(encodeCsv(rows), `spendwise-report-${period.year}-${String(period.month).padStart(2, '0')}.csv`, 'text/csv;charset=utf-8');
    notify("Report exported as CSV.");
    } catch (err) { setExportError(err.message || 'The CSV could not be generated. Please try again.'); }
    finally { setExporting(null); }
  }
  async function downloadPdf() {
    setExporting('pdf'); setExportError(null);
    try {
      const [{ data: report }, { downloadReportPdf }] = await Promise.all([request(`/dashboard/summary?${queryString(period)}`), import('../lib/reportPdf')]);
      await downloadReportPdf({ period, monthly: report, categories: report.category_breakdown, name: user?.name });
      notify('Report exported as PDF.');
    } catch (err) { setExportError(err.message || 'The PDF could not be generated. Please try again.'); }
    finally { setExporting(null); }
  }
  return (
    <>
      <PageHeader
        title="Reports"
        description="See the patterns. Make your next move with confidence."
      >
        <PeriodPicker />
        <button
          className="button secondary"
          onClick={download}
          disabled={Boolean(exporting) || loading || !!error || !monthly.data || !categories.data}
        >
          <Download size={17} />
          {exporting === 'csv' ? 'Exporting CSV…' : 'Export CSV'}
        </button>
        <button className="button secondary" onClick={downloadPdf} disabled={Boolean(exporting) || loading || Boolean(error) || !monthly.data || !categories.data}><FileText size={17} />{exporting === 'pdf' ? 'Preparing PDF…' : 'Export PDF'}</button>
      </PageHeader>
      {exportError && <p className="form-error" role="alert">{exportError}</p>}
      {loading ? (
        <Loading label="Preparing your reports…" />
      ) : error ? (
        <ErrorState
          error={error}
          onRetry={() => {
            monthly.reload();
            categories.reload();
          }}
        />
      ) : (
        <>
          <section className="report-overview" aria-label="Report summary">
            <div>
              <span>Income</span>
              <strong>{currency(income)}</strong>
            </div>
            <div>
              <span>Expenses</span>
              <strong>{currency(expenses)}</strong>
            </div>
            <div>
              <span>Net savings</span>
              <strong className={income >= expenses ? "positive" : ""}>
                {currency(income - expenses)}
              </strong>
            </div>
            <div>
              <span>Savings rate</span>
              <strong>
                {income > 0
                  ? `${(((income - expenses) / income) * 100).toFixed(1)}%`
                  : "—"}
              </strong>
              <small>
                {income > 0 ? "of monthly income" : "Add income to calculate"}
              </small>
            </div>
          </section>
          <div className="dashboard-charts">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Income vs. expenses</h2>
                  <p>
                    Six months ending {periodLabel(period.month, period.year)}
                  </p>
                </div>
              </div>
              <MonthlyChart data={monthly.data?.monthly} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Expense distribution</h2>
                  <p>Each category’s share of your month</p>
                </div>
              </div>
              <CategoryChart data={categories.data} />
            </section>
          </div>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Monthly spending trend</h2>
                <p>
                  Daily expenses for {periodLabel(period.month, period.year)}
                </p>
              </div>
              <span className="panel-note">In INR</span>
            </div>
            <SpendingChart data={monthly.data?.spending_trend} />
          </section>
        </>
      )}
    </>
  );
}
