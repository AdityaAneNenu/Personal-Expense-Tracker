import { currency, periodLabel } from './format';
import { downloadFile } from './csv';

const colors = ['#4c5fe5', '#b86536', '#3f8c74', '#8361af', '#ae5778', '#687fa7', '#8c7c30', '#397f99', '#727381'];
const ink = '#182d35';
const muted = '#536a75';
const xml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const short = value => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const svgText = (text, x, y, size = 10, anchor = 'middle', color = muted) => `<text x="${x}" y="${y}" font-family="Roboto" font-size="${size}" text-anchor="${anchor}" fill="${color}">${xml(text)}</text>`;
const svg = (content, width = 520, height = 210) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="#ffffff"/>${content}</svg>`;
function maximum(values) {
  const high = Math.max(...values, 0);
  if (!high) return 1;
  const unit = 10 ** Math.floor(Math.log10(high));
  return Math.ceil(high / unit) * unit;
}
function grid(max, left = 48, top = 15, width = 455, height = 160) {
  return Array.from({ length: 5 }, (_, index) => {
    const y = top + height - index / 4 * height;
    return `<line x1="${left}" x2="${left + width}" y1="${y}" y2="${y}" stroke="#dfe8ed" stroke-width="0.8"/>${svgText(short(max * index / 4), left - 8, y + 3, 9, 'end')}`;
  }).join('');
}

export function monthlyReportSvg(months) {
  const max = maximum(months.flatMap(month => [Number(month.income), Number(month.expenses)]));
  const width = 455 / Math.max(months.length, 1);
  const bars = months.map((month, index) => {
    const center = 48 + width * (index + 0.5);
    const barWidth = Math.min(23, width * 0.28);
    return [['income', colors[0], center - barWidth - 2], ['expenses', colors[1], center + 2]].map(([key, color, x]) => {
      const height = Number(month[key]) / max * 160;
      return `<rect x="${x}" y="${175 - height}" width="${barWidth}" height="${height}" rx="3" fill="${color}"/>`;
    }).join('') + svgText(month.label, center, 194, 9);
  }).join('');
  return svg(grid(max) + bars);
}

export function dailyReportSvg(days) {
  const max = maximum(days.map(day => Number(day.amount)));
  const point = (day, index) => [48 + index / Math.max(days.length - 1, 1) * 455, 175 - Number(day.amount) / max * 160];
  const points = days.map((day, index) => point(day, index).join(',')).join(' ');
  const labels = days.flatMap((day, index) => {
    const number = Number(day.date.slice(8, 10));
    return index === 0 || index === days.length - 1 || number % 5 === 0 ? [svgText(number, point(day, index)[0], 194, 9)] : [];
  }).join('');
  return svg(grid(max) + `<polyline points="${points}" fill="none" stroke="${colors[0]}" stroke-width="2.4" stroke-linejoin="round"/>` + labels);
}

export function categoryReportSvg(categories) {
  const total = categories.reduce((sum, category) => sum + Number(category.amount), 0);
  const positive = categories.filter(category => Number(category.amount) > 0);
  let angle = -Math.PI / 2;
  const cx = 105, cy = 105, radius = 73;
  const paths = positive.map((category, index) => {
    if (positive.length === 1) return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${colors[0]}" stroke-width="26"/>`;
    const end = angle + Number(category.amount) / total * Math.PI * 2;
    const path = `<path d="M ${cx + radius * Math.cos(angle)} ${cy + radius * Math.sin(angle)} A ${radius} ${radius} 0 ${end - angle > Math.PI ? 1 : 0} 1 ${cx + radius * Math.cos(end)} ${cy + radius * Math.sin(end)}" fill="none" stroke="${colors[index % colors.length]}" stroke-width="26"/>`;
    angle = end;
    return path;
  }).join('');
  return svg((total ? paths : `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="#e2e9ed" stroke-width="26"/>`) + svgText('Total expenses', cx, 98, 11) + svgText(`INR ${short(total)}`, cx, 120, 17, 'middle', ink), 210, 210);
}

const tableLayout = {
  hLineWidth: () => 0.5,
  vLineWidth: () => 0,
  hLineColor: () => '#dfe8ed',
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 4,
  paddingBottom: () => 4,
};
const headerCell = text => ({ text, bold: true, fillColor: '#edf5f3', color: ink });
const moneyCell = value => ({ text: currency(value), alignment: 'right' });

export function createReportDefinition({ period, monthly, categories, name = '', generatedAt = new Date() }) {
  const label = periodLabel(period.month, period.year);
  const selected = monthly.monthly.find(month => month.month === period.month && month.year === period.year);
  const income = Number(selected?.income || 0);
  const expenses = Number(selected?.expenses || 0);
  const savings = income - expenses;
  const rate = income > 0 ? `${(savings / income * 100).toFixed(1)}%` : 'N/A';
  const categoryTotal = categories.reduce((sum, category) => sum + Number(category.amount), 0);
  const breakdownRows = categories.map(category => [category.category_name, moneyCell(category.amount), { text: categoryTotal ? `${(Number(category.amount) / categoryTotal * 100).toFixed(1)}%` : 'N/A', alignment: 'right' }]);
  return {
    info: { title: `SpendWise financial report - ${label}`, author: 'SpendWise', subject: 'Monthly income, expenses, and category breakdown' },
    pageSize: 'A4', pageMargins: [36, 38, 36, 40],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, color: ink, lineHeight: 1.1 },
    styles: {
      brand: { fontSize: 25, bold: true, color: '#087f73', margin: [0, 0, 0, 8] },
      title: { fontSize: 18, bold: true, margin: [0, 0, 0, 5] },
      section: { fontSize: 13, bold: true, margin: [0, 17, 0, 7] },
      caption: { fontSize: 9, color: muted, margin: [0, 0, 0, 8] },
      metric: { fontSize: 15, bold: true, margin: [0, 4, 0, 0] },
    },
    footer: (page, count) => ({ text: `SpendWise  ·  ${label}  ·  Page ${page} of ${count}`, alignment: 'center', fontSize: 8, color: muted, margin: [36, 12, 36, 0] }),
    content: [
      { columns: [{ text: 'SpendWise.', style: 'brand' }, { text: label, alignment: 'right', fontSize: 13, margin: [0, 7, 0, 0] }] },
      { text: 'Your monthly financial report', style: 'title' },
      { text: `${name ? `Prepared for ${name}  ·  ` : ''}Generated ${generatedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, style: 'caption' },
      { table: { widths: ['*', '*', '*', '*'], body: [[
        ...[['Income', currency(income)], ['Expenses', currency(expenses)], ['Net savings', currency(savings)], ['Savings rate', rate]].map(([title, value]) => ({ stack: [{ text: title, fontSize: 9, color: muted }, { text: value, style: 'metric' }], fillColor: '#f4f7fa', margin: [3, 8, 3, 8] })),
      ]] }, layout: 'noBorders', margin: [0, 12, 0, 0] },
      { text: 'Income vs. expenses', style: 'section' },
      { text: [{ text: 'Income', color: colors[0], bold: true }, { text: '    ' }, { text: 'Expenses', color: colors[1], bold: true }, { text: '  ·  Last six months, in INR', color: muted }], margin: [0, 0, 0, 4] },
      { svg: monthlyReportSvg(monthly.monthly), width: 520 },
      { text: 'Where your money went', style: 'section' },
      { columns: [
        { svg: categoryReportSvg(categories), width: 200 },
        { width: '*', stack: categories.length ? [
          ...categories.slice(0, 6).map((category, index) => ({ columns: [{ text: category.category_name, color: colors[index % colors.length], width: '*' }, { ...moneyCell(category.amount), width: 95 }], columnGap: 10, margin: [0, 5, 0, 5] })),
          { text: categories.length > 6 ? `${categories.length - 6} more categories are listed in the complete breakdown.` : 'The complete breakdown follows on the next page.', style: 'caption', margin: [0, 12, 0, 0] },
        ] : [{ text: 'No expenses recorded for this month.', color: muted, margin: [0, 35, 0, 0] }], margin: [0, 12, 0, 0] },
      ], columnGap: 26 },
      { text: 'Daily spending & details', style: 'title', pageBreak: 'before' },
      { text: `${label}  ·  All amounts in INR`, style: 'caption' },
      { svg: dailyReportSvg(monthly.spending_trend), width: 520 },
      { text: 'Complete category breakdown', style: 'section' },
      { table: { headerRows: 1, widths: ['*', 105, 60], body: [
        [headerCell('Expense category'), { ...headerCell('Amount'), alignment: 'right' }, { ...headerCell('Share'), alignment: 'right' }],
        ...breakdownRows,
        [{ text: 'Total expenses', bold: true }, { ...moneyCell(categoryTotal), bold: true }, { text: categoryTotal ? '100%' : 'N/A', alignment: 'right', bold: true }],
      ] }, layout: tableLayout },
      { text: 'Six-month figures', style: 'section' },
      { table: { headerRows: 1, widths: ['*', 115, 115], body: [
        [headerCell('Month'), { ...headerCell('Income'), alignment: 'right' }, { ...headerCell('Expenses'), alignment: 'right' }],
        ...monthly.monthly.map(month => [month.label, moneyCell(month.income), moneyCell(month.expenses)]),
      ] }, layout: tableLayout },
      { text: 'Based on transactions recorded in SpendWise. CSV exports provide the individual transaction records.', style: 'caption', margin: [0, 14, 0, 0] },
    ],
  };
}

export async function downloadReportPdf(data) {
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')]);
  pdfMake.addVirtualFileSystem(fonts);
  const document = pdfMake.createPdf(createReportDefinition(data));
  const blob = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('The PDF could not be generated. Please try again.')), 30000);
    try { document.getBlob(value => { clearTimeout(timeout); resolve(value); }); }
    catch (error) { clearTimeout(timeout); reject(error); }
  });
  const filename = `spendwise-report-${data.period.year}-${String(data.period.month).padStart(2, '0')}.pdf`;
  downloadFile(blob, filename, 'application/pdf');
}
