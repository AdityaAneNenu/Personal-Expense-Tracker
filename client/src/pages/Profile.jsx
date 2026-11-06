import {
  CalendarDays,
  CircleUserRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { formatDate } from "../lib/format";
import { PageHeader } from "../components/UI";
import ThemeSettings from "../components/ThemeSettings";

export default function Profile() {
  const { user } = useAuth();
  return (
    <>
      <PageHeader
        title="Your account"
        description="The home for your personal money records."
      />
      <div className="profile-grid">
        <section className="panel profile-card">
          <span className="profile-avatar">
            <CircleUserRound size={37} />
          </span>
          <h2>{user.name}</h2>
          <p>Personal account</p>
          <dl>
            <div>
              <dt>
                <Mail size={17} />
                Email address
              </dt>
              <dd>{user.email}</dd>
            </div>
            <div>
              <dt>
                <CalendarDays size={17} />
                Member since
              </dt>
              <dd>{formatDate(user.created_at)}</dd>
            </div>
            <div>
              <dt>Currency</dt>
              <dd>Indian rupee (INR ₹)</dd>
            </div>
          </dl>
        </section>
        <section className="panel account-info">
          <ShieldCheck size={29} />
          <h2>A private space for your finances</h2>
          <p>
            Your transactions, budgets, alerts, and custom categories belong to
            your account. Shared categories are available to everyone.
          </p>
          <div className="account-info-note">
            <LockKeyhole size={20} />
            <p>Always log out when you finish using a shared computer.</p>
          </div>
          <h3>About SpendWise</h3>
          <p>
            Personal Expense Tracker and Budget Management System. A place to
            record everyday finances and understand spending habits.
          </p>
          <p className="muted">
            Account details are read-only in this version. Balances represent
            recorded activity and are not connected to a bank account.
          </p>
        </section>
      </div>
      <ThemeSettings />
    </>
  );
}
