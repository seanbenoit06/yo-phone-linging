import { Check } from 'lucide-react';
import { themeIds, themes, type ThemeId } from '../themes/themes';

export function ThemePicker({ theme, onChange }: { theme: ThemeId; onChange: (id: ThemeId) => void }) {
  return (
    <fieldset className="theme-picker">
      <legend className="visually-hidden">Choose a dashboard theme</legend>
      {themeIds.map((id) => (
        <label className="theme-choice" key={id}>
          <input className="theme-choice-input" type="radio" name="dashboard-theme" value={id} checked={theme === id} onChange={() => onChange(id)} />
          <span className="theme-choice-card">
            <span className="theme-preview" data-preview={id} aria-hidden="true">
              <span className="preview-sidebar"><span className="preview-logo">m.</span><i /><i /><i /></span>
              <span className="preview-content"><span className="preview-greeting">{id === 'flow' ? 'Hello, focus.' : id === 'mom' ? 'You ate yet?' : 'YOUR TIME IS NOW'}</span><span className="preview-hero"><span>{themes[id].accent || 'One small step.'}</span><i /></span><span className="preview-bottom"><span className="preview-list"><i /><i /><i /></span><span className="preview-stat">24<span>min</span></span></span></span>
            </span>
            <span className="theme-choice-description"><span className="theme-choice-name">{themes[id].name}<span className="theme-selected">{theme === id ? <><Check size={16} aria-hidden="true" />Selected</> : 'Try it'}</span></span><span className="muted">{themes[id].description}</span></span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
