import { lazy, Suspense } from "react";
import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppProvider } from "./context/AppContext";
import { ThemeProvider } from "./context/ThemeContext";
import Layout from "./components/Layout";
import { EmptyState, ErrorState, Loading } from "./components/UI";
import AuthPage from "./pages/AuthPage";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Transactions = lazy(() => import("./pages/Transactions"));
const TransactionFormPage = lazy(() => import("./pages/TransactionForm"));
const TransactionDetails = lazy(() => import("./pages/TransactionDetails"));
const ImportTransactions = lazy(() => import("./pages/ImportTransactions"));
const Categories = lazy(() => import("./pages/Categories"));
const Budgets = lazy(() => import("./pages/Budgets"));
const Reports = lazy(() => import("./pages/Reports"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Profile = lazy(() => import("./pages/Profile"));

function ProtectedLayout() {
  const { user } = useAuth();
  return user ? <Layout key={user.id} /> : <Navigate to="/login" replace />;
}

export function AppRoutes() {
  const { loading, error, initialize } = useAuth();
  if (loading)
    return (
      <div className="boot-state">
        <Loading label="Opening your workspace…" />
      </div>
    );
  if (error)
    return (
      <div className="boot-state">
        <ErrorState error={error} onRetry={initialize} />
      </div>
    );
  return (
    <Suspense fallback={<Loading label="Loading page…" />}>
      <Routes>
        <Route path="/login" element={<AuthPage key="login" mode="login" />} />
        <Route
          path="/register"
          element={<AuthPage key="register" mode="register" />}
        />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/transactions/import" element={<ImportTransactions />} />
          <Route
            path="/transactions/new"
            element={<TransactionFormPage key="new" />}
          />
          <Route
            path="/transactions/:id/edit"
            element={<TransactionFormPage key="edit" />}
          />
          <Route path="/transactions/:id" element={<TransactionDetails />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/profile" element={<Profile />} />
          <Route
            path="*"
            element={
              <EmptyState
                title="This page isn’t here"
                description="Head back to your dashboard to pick up where you left off."
                action={
                  <Link className="button primary" to="/dashboard">
                    Go to dashboard
                  </Link>
                }
              />
            }
          />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <AppRoutes />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
