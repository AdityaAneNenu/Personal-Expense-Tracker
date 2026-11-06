import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'spendwise-theme';
const choices = new Set(['light', 'dark', 'system']);
const ThemeContext = createContext(null);
const systemTheme = () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

function savedPreference() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return choices.has(saved) ? saved : 'system';
  } catch { return 'system'; }
}

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(savedPreference);
  const [deviceTheme, setDeviceTheme] = useState(systemTheme);
  const theme = preference === 'system' ? deviceTheme : preference;

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    // The head bootstrap supplies a background before the stylesheet loads.
    // Once React is ready, CSS tokens own the page colors.
    root.style.removeProperty('background-color');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d191f' : '#f4f7fa');
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onDeviceChange = event => setDeviceTheme(event.matches ? 'dark' : 'light');
    const onStorageChange = event => {
      if (event.key === THEME_STORAGE_KEY || event.key === null) setPreference(savedPreference());
    };
    media?.addEventListener('change', onDeviceChange);
    window.addEventListener('storage', onStorageChange);
    return () => {
      media?.removeEventListener('change', onDeviceChange);
      window.removeEventListener('storage', onStorageChange);
    };
  }, []);

  const setThemePreference = useCallback(next => {
    if (!choices.has(next)) return;
    setPreference(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); }
    catch { /* The current tab can still change theme when storage is blocked. */ }
  }, []);

  const toggleTheme = () => setThemePreference(theme === 'dark' ? 'light' : 'dark');
  return <ThemeContext.Provider value={{ theme, preference, setThemePreference, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('Theme controls must be inside ThemeProvider.');
  return theme;
}
