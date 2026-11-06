import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import BudgetProgress from '../components/BudgetProgress';
import { EmptyState, ErrorState, Field, Loading } from '../components/UI';
import { TransactionForm } from '../pages/TransactionForm';
import { currency, validAmount, validDate, validateAuth } from '../lib/format';

const categories = [
  { id: 'default-expense-1', name: 'Food and groceries', type: 'EXPENSE' },
  { id: 'default-income-1', name: 'Salary', type: 'INCOME' },
];
const initial = { type: 'EXPENSE', amount: '120.50', category_id: 'default-expense-1', description: 'Weekly groceries', payment_method: 'UPI', transaction_date: '2026-10-12' };

function renderForm(props = {}) {
  return render(<MemoryRouter><TransactionForm categories={categories} {...props} /></MemoryRouter>);
}

describe('accessible common states', () => {
  it('announces a loading state', () => {
    render(<Loading label="Loading transactions" />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading transactions');
  });

  it('gives an empty state a clear next action', async () => {
    const onCreate = vi.fn();
    render(<EmptyState title="No transactions yet" description="Record your first expense." action={<button onClick={onCreate}>Add transaction</button>} />);
    expect(screen.getByRole('heading', { name: 'No transactions yet' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('announces server errors and provides a working retry', async () => {
    const retry = vi.fn();
    render(<ErrorState error={new Error('Database temporarily unavailable')} onRetry={retry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Database temporarily unavailable');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('connects input labels and validation errors accessibly', () => {
    render(<Field label="Amount" name="amount" error="Enter a positive amount" />);
    const input = screen.getByRole('textbox', { name: 'Amount' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a positive amount');
  });
});

describe('budget progress', () => {
  it.each([
    [74.9, 'NORMAL', 'On track'],
    [75, 'WARNING', 'Warning'],
    [90, 'HIGH', 'High-priority warning'],
    [100, 'EXCEEDED', 'Budget exceeded'],
  ])('displays the %s%% status with text and an accessible progress bar', (utilization, status, label) => {
    render(<BudgetProgress budget={{ category_name: 'Overall budget', amount: 1000, spent: utilization * 10, remaining: 1000 - utilization * 10, utilization, status }} />);
    expect(screen.getByText(label)).toBeInTheDocument();
    const progress = screen.getByRole('progressbar', { name: 'Overall budget utilization' });
    expect(progress).toHaveAttribute('aria-valuenow', String(utilization));
    expect(progress).toHaveAttribute('aria-valuetext', `${utilization.toFixed(1)}% used, ${label}`);
  });

  it('caps the bar at 100 while retaining the true overspend in text', () => {
    render(<BudgetProgress budget={{ category_name: 'Food', amount: 1000, spent: 1250, remaining: -250, utilization: 125, status: 'EXCEEDED' }} />);
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuenow', '100');
    expect(progress).toHaveAttribute('aria-valuetext', '125.0% used, Budget exceeded');
    expect(screen.getByText(/250.00 over/)).toBeInTheDocument();
  });
});

describe('transaction form', () => {
  it('blocks empty submissions and identifies the invalid fields', async () => {
    const submit = vi.fn();
    renderForm({ onSubmit: submit });
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Amount/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('creates a normalized transaction after valid form input', async () => {
    const submit = vi.fn();
    renderForm({ onSubmit: submit });
    await userEvent.type(screen.getByLabelText(/Amount/), '123.45');
    await userEvent.selectOptions(screen.getByLabelText('Category'), 'default-expense-1');
    fireEvent.change(screen.getByLabelText('Transaction date'), { target: { value: '2026-10-12' } });
    await userEvent.type(screen.getByLabelText('Description'), '  Textbook  ');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(submit).toHaveBeenCalledWith({ type: 'EXPENSE', amount: 123.45, category_id: 'default-expense-1', description: 'Textbook', payment_method: 'UPI', transaction_date: '2026-10-12' });
  });

  it('edits an existing transaction and preserves its other fields', async () => {
    const submit = vi.fn();
    renderForm({ initial, onSubmit: submit, submitLabel: 'Save changes' });
    const amount = screen.getByLabelText(/Amount/);
    expect(amount).toHaveValue(120.5);
    await userEvent.clear(amount);
    await userEvent.type(amount, '210.25');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(submit).toHaveBeenCalledWith({ ...initial, amount: 210.25 });
  });

  it('resets incompatible categories when changing transaction type', async () => {
    renderForm({ initial, onSubmit: vi.fn() });
    await userEvent.click(screen.getByRole('button', { name: 'Income' }));
    expect(screen.getByLabelText('Category')).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'Food and groceries' })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Salary' })).toBeInTheDocument();
  });

  it('prevents negative or excess-precision amounts and disables save while submitting', async () => {
    const submit = vi.fn();
    const rendered = renderForm({ initial: { ...initial, amount: '-1' }, onSubmit: submit });
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(submit).not.toHaveBeenCalled();
    await userEvent.clear(screen.getByLabelText(/Amount/));
    await userEvent.type(screen.getByLabelText(/Amount/), '1.001');
    await userEvent.click(screen.getByRole('button', { name: 'Save transaction' }));
    expect(submit).not.toHaveBeenCalled();
    rendered.unmount();
    renderForm({ initial, onSubmit: submit, busy: true });
    expect(screen.getByRole('button', { name: /Saving/ })).toBeDisabled();
  });
});

describe('client input rules', () => {
  it('validates real calendar dates including leap years', () => {
    expect(validDate('2024-02-29')).toBe(true);
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '1999-12-31', '2101-01-01', '12/10/2026']) expect(validDate(value)).toBe(false);
  });

  it('accepts paise and rejects zero, negative, excessive precision and out-of-range money', () => {
    expect(validAmount('0.01')).toBe(true);
    expect(validAmount('123456.78')).toBe(true);
    for (const value of ['0', '-1', '1.001', 'Infinity', 'NaN', '1e3', '10000000000']) expect(validAmount(value)).toBe(false);
    expect(currency(123456.78)).toBe('₹1,23,456.78');
  });

  it('validates password confirmation, letter/digit rules and Firebase password length before registration', () => {
    const form = { name: 'QA Student', email: 'student@example.test', password: 'Password123', confirm_password: 'Password123' };
    expect(validateAuth(form, true)).toEqual({});
    const longPassword = 'a'.repeat(80) + '1';
    expect(validateAuth({ ...form, password: longPassword, confirm_password: longPassword }, true)).toEqual({});
    expect(validateAuth({ ...form, password: 'a'.repeat(4096) + '1' }, true)).toHaveProperty('password');
    expect(validateAuth({ ...form, confirm_password: 'Different' }, true)).toHaveProperty('confirm_password');
    expect(validateAuth({ ...form, password: 'abcdefgh', confirm_password: 'abcdefgh' }, true)).toHaveProperty('password');
    expect(validateAuth({ ...form, password: '12345678', confirm_password: '12345678' }, true)).toHaveProperty('password');
    expect(validateAuth({ ...form, password: '密'.repeat(25), confirm_password: '密'.repeat(25) }, true)).toHaveProperty('password');
  });
});
