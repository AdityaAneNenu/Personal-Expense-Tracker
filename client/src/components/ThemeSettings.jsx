import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

const options = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export default function ThemeSettings() {
  const { preference, setThemePreference } = useTheme();
  return (
    <section className="panel appearance-settings" aria-labelledby="appearance-heading">
      <div>
        <h2 id="appearance-heading">Appearance</h2>
        <p>Choose your theme. System follows your device settings.</p>
      </div>
      <fieldset className="theme-options">
        <legend className="sr-only">Color theme</legend>
        {options.map(({ value, label, icon: Icon }) => (
          <label key={value} className="theme-option">
            <input type="radio" name="color-theme" value={value} checked={preference === value} onChange={() => setThemePreference(value)} />
            <Icon size={18} aria-hidden="true" />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
    </section>
  );
}
