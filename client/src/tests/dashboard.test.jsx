import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import Dashboard from '../pages/Dashboard';

const mocks = vi.hoisted(() => ({ resource: vi.fn(), setPeriod: vi.fn(), reload: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, name: 'QA Student', email: 'qa@example.test' } }) }));
vi.mock('../context/AppContext', () => ({ useApp: () => ({ period: { month: 10, year: 2026 }, setPeriod: mocks.setPeriod }) }));
vi.mock('../hooks/useResource', () => ({ default: mocks.resource }));

beforeEach(() => { vi.clearAllMocks(); });
const renderDashboard = () => render(<MemoryRouter><Dashboard /></MemoryRouter>);

it('announces dashboard loading before totals arrive', () => {
  mocks.resource.mockReturnValue({ data: null, loading: true, error: null, reload: mocks.reload });
  renderDashboard();
  expect(screen.getByRole('heading', { name: 'Dashboard', exact: true })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Building your monthly overview');
  expect(screen.queryByLabelText('Monthly summary')).not.toBeInTheDocument();
});

it('shows a recoverable dashboard error', async () => {
  mocks.resource.mockReturnValue({ data: null, loading: false, error: new Error('Unable to reach the server'), reload: mocks.reload });
  renderDashboard();
  expect(screen.getByRole('alert')).toHaveTextContent('Unable to reach the server');
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(mocks.reload).toHaveBeenCalledOnce();
});

it('renders real zero totals and useful empty chart/budget states', () => {
  mocks.resource.mockReturnValue({ loading: false, error: null, reload: mocks.reload, data: { income: 0, expenses: 0, net_savings: 0, overall_budget: null, recent_transactions: [], monthly: [{ label: 'Oct', month: 10, year: 2026, income: 0, expenses: 0 }], category_breakdown: [], spending_trend: [{ date: '2026-10-01', amount: 0 }] } });
  renderDashboard();
  expect(screen.getAllByText('₹0.00')).toHaveLength(3);
  expect(screen.getByRole('heading', { name: 'Your money story starts here' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'No expenses this month' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Create a budget' })).toHaveAttribute('href', '/budgets');
  for (const link of screen.getAllByRole('link', { name: 'Add transaction' })) expect(link).toHaveAttribute('href', '/transactions/new');
});
