import { useState } from "react";
import {
  ArrowRight,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  ShieldCheck,
  Target,
  Wallet,
} from "lucide-react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Brand } from "../components/Layout";
import { Field } from "../components/UI";
import { useAuth } from "../context/AuthContext";
import { validateAuth } from "../lib/format";
import ThemeToggle from "../components/ThemeToggle";

export default function AuthPage({ mode = "login" }) {
  const register = mode === "register";
  const { user, authenticate } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  if (user) return <Navigate to="/dashboard" replace />;
  function update(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    const next = validateAuth(form, register);
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) return;
    setBusy('password');
    try {
      await authenticate(mode, {
        ...(register ? { name: form.name.trim() } : {}),
        email: form.email.trim(),
        password: form.password,
      });
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }
  async function continueWithGoogle() {
    if (busy) return;
    setErrors({});
    setError(null);
    setBusy('google');
    try {
      await authenticate('google');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="auth-shell">
      <section className="auth-story">
        <Link className="auth-brand" to="/login">
          <Brand />
        </Link>
        <div className="auth-story-content">
          <h1>
            Know your spending.
            <br />
            Plan with confidence.
          </h1>
          <p>
            Bring your income, expenses, and monthly budgets into one clear
            picture. Your next money decision starts here.
          </p>
          <div className="auth-illustration" aria-hidden="true">
            <div className="ledger-sheet">
              <div className="ledger-heading">
                <Wallet size={20} />
                <span>Your monthly picture</span>
              </div>
              <div className="ledger-row income">
                <span className="ledger-row-icon">
                  <ArrowDownLeft size={22} />
                </span>
                <div className="ledger-row-copy">
                  <strong>Income</strong>
                  <span className="ledger-placeholder" />
                </div>
                <Check size={18} />
              </div>
              <div className="ledger-row expense">
                <span className="ledger-row-icon">
                  <ArrowUpRight size={22} />
                </span>
                <div className="ledger-row-copy">
                  <strong>Expenses</strong>
                  <span className="ledger-placeholder" />
                </div>
                <Check size={18} />
              </div>
              <div className="ledger-row budget">
                <span className="ledger-row-icon">
                  <Target size={22} />
                </span>
                <div className="ledger-row-copy">
                  <strong>Monthly budget</strong>
                  <span className="ledger-placeholder" />
                </div>
                <Check size={18} />
              </div>
              <div className="ledger-footer">
                <CheckCircle2 size={17} />
                <span>One place. A clearer perspective.</span>
              </div>
            </div>
          </div>
          <ul>
            <li>
              <Check size={17} />
              Record the details that matter
            </li>
            <li>
              <Check size={17} />
              Build a spending plan you can follow
            </li>
          </ul>
        </div>
        <p className="auth-story-footer">
          A personal workspace for everyday finances.
        </p>
      </section>
      <main className="auth-main">
        <div className="auth-toolbar">
          <div className="auth-mobile-brand">
            <Brand />
          </div>
          <ThemeToggle />
        </div>
        <div className="auth-form-wrap">
          <h2>{register ? "Create your account" : "Welcome back"}</h2>
          <p>
            {register
              ? "Start tracking your money with a free personal account."
              : "Sign in to your personal finance workspace."}
          </p>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button
            type="button"
            className="button google-signin"
            onClick={continueWithGoogle}
            disabled={Boolean(busy)}
            aria-busy={busy === 'google'}
          >
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.61 0 6.5 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
              <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24s.92 7.54 2.56 10.78l7.97-6.19z" />
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.5 42.62 14.61 48 24 48z" />
            </svg>
            {busy === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
          </button>
          <div className="auth-divider">or use your email</div>
          <form noValidate onSubmit={submit}>
            {register && (
              <Field
                label="Full name"
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={update}
                error={errors.name}
                placeholder="Your name"
                required
              />
            )}
            <Field
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={update}
              error={errors.email}
              placeholder="you@example.com"
              required
            />
            <div className="password-field">
              <Field
                label="Password"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                value={form.password}
                onChange={update}
                error={errors.password}
                hint={
                  register
                    ? "At least 8 characters, including a letter and a number."
                    : undefined
                }
                required
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {register && (
              <Field
                label="Confirm password"
                name="confirm_password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={form.confirm_password}
                onChange={update}
                error={errors.confirm_password}
                required
              />
            )}
            <button
              className="button primary auth-submit"
              type="submit"
              disabled={Boolean(busy)}
            >
              {busy === 'password'
                ? register
                  ? "Creating account…"
                  : "Signing in…"
                : register
                  ? "Create account"
                  : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Already have an account?" : "New to SpendWise?"}{" "}
            <Link to={register ? "/login" : "/register"}>
              {register ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <div className="auth-security">
            <ShieldCheck size={16} />
            <span>Your financial records stay private to your account.</span>
          </div>
        </div>
        <p className="auth-footer">SpendWise — Personal Expense Tracker</p>
      </main>
    </div>
  );
}
