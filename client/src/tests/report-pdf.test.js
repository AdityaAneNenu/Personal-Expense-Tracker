import { expect, it } from 'vitest';
import { categoryReportSvg, createReportDefinition, dailyReportSvg, monthlyReportSvg } from '../lib/reportPdf';

it('PDF reports contain the selected month totals, complete category detail and real-data charts', () => {
  const report = createReportDefinition({
    period: { month: 11, year: 2026 }, name: 'Test member', generatedAt: new Date('2026-11-06T00:00:00Z'),
    monthly: { monthly: [{ month: 10, year: 2026, label: 'Oct 26', income: 500, expenses: 100 }, { month: 11, year: 2026, label: 'Nov 26', income: 1000, expenses: 150.5 }], spending_trend: [{ date: '2026-11-01', amount: 150.5 }, { date: '2026-11-02', amount: 0 }] },
    categories: [{ category_name: 'Education & books', amount: 150.5 }],
  });
  const serialized = JSON.stringify(report);
  expect(serialized).toContain('November 2026');
  expect(serialized).toContain('₹1,000.00');
  expect(serialized).toContain('₹150.50');
  expect(serialized).toContain('₹849.50');
  expect(serialized).toContain('Education & books');
  expect(report.content.filter(item => item.svg)).toHaveLength(2);
  expect(serialized).toContain('<circle');
  expect(serialized).toContain('<polyline');
  expect(serialized).not.toMatch(/NaN|Infinity|undefined/);
});

it('PDF charts handle empty months without invalid coordinates and escape labels', () => {
  expect(monthlyReportSvg([{ label: '<Month & year>', income: 0, expenses: 0 }])).toContain('&lt;Month &amp; year&gt;');
  for (const result of [monthlyReportSvg([]), categoryReportSvg([]), dailyReportSvg([])]) {
    expect(result).toContain('<svg');
    expect(result).not.toMatch(/NaN|Infinity|undefined/);
  }
});
