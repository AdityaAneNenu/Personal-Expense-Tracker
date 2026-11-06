import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const Icon = isDark ? Sun : Moon;
  const action = `Switch to ${isDark ? 'light' : 'dark'} mode`;
  return (
    <button type="button" className="theme-toggle" aria-label={action} title={action} onClick={toggleTheme}>
      <Icon size={18} aria-hidden="true" />
      <span className="theme-toggle-label">{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
}
