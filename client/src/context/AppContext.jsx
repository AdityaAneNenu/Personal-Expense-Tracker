import { createContext, useContext, useEffect, useRef, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

const AppContext = createContext(null);
export function AppProvider({ children }) {
  const current = new Date();
  const [period, setPeriod] = useState({
    month: current.getMonth() + 1,
    year: current.getFullYear(),
  });
  const [toast, setToast] = useState(null);
  const timer = useRef(null);
  function notify(message) {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(() => setToast(null), 4500);
  }
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <AppContext.Provider value={{ period, setPeriod, notify }}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={20} />
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={17} />
          </button>
        </div>
      )}
    </AppContext.Provider>
  );
}
export const useApp = () => useContext(AppContext);
