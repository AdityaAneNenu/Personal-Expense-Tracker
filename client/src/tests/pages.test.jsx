import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AuthPage from '../pages/AuthPage';
import { ThemeProvider } from '../context/ThemeContext';

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, authenticate: mocks.authenticate }) }));

beforeEach(() => { vi.resetAllMocks(); });

describe('authentication page', () => {
  it('validates registration fields before contacting the API', async () => {
    render(<ThemeProvider><MemoryRouter><AuthPage mode="register" /></MemoryRouter></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(mocks.authenticate).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Full name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  });

  it('shows the backend error when login fails', async () => {
    mocks.authenticate.mockRejectedValueOnce(new Error('Email or password is incorrect.'));
    render(<ThemeProvider><MemoryRouter><AuthPage /></MemoryRouter></ThemeProvider>);
    await userEvent.type(screen.getByLabelText('Email address'), 'student@example.test');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Password123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    expect(mocks.authenticate).toHaveBeenCalledWith('login', { email: 'student@example.test', password: 'Password123' });
  });

  it('toggles password visibility with an accessible button', async () => {
    render(<ThemeProvider><MemoryRouter><AuthPage /></MemoryRouter></ThemeProvider>);
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
  });

  it.each(['login', 'register'])('supports Google from %s without requiring email/password fields', async mode => {
    mocks.authenticate.mockResolvedValueOnce({ id: 'google-user' });
    render(<ThemeProvider><MemoryRouter><Routes>
      <Route path="/" element={<AuthPage mode={mode} />} />
      <Route path="/dashboard" element={<h1>Dashboard</h1>} />
    </Routes></MemoryRouter></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(mocks.authenticate).toHaveBeenCalledWith('google');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('prevents competing sign-in attempts and restores the controls after popup cancellation', async () => {
    let rejectPopup;
    mocks.authenticate.mockImplementationOnce(() => new Promise((resolve, reject) => { rejectPopup = reject; }));
    render(<ThemeProvider><MemoryRouter><AuthPage /></MemoryRouter></ThemeProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(screen.getByRole('button', { name: 'Connecting to Google…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
    await act(async () => { rejectPopup(new Error('Google sign-in was cancelled. You can try again.')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in was cancelled.');
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  });
});

