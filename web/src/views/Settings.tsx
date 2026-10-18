import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown, FlaskConical, LoaderCircle, Palette, Phone, Play, SlidersHorizontal, UserRound } from 'lucide-react';
import type { ApiClient, CommandResult, State } from '../api/types';
import { ThemePicker } from '../components/ThemePicker';
import type { ThemeId } from '../themes/themes';

interface SettingsProps {
  state: State | null;
  theme?: ThemeId;
  onThemeChange?: (id: ThemeId) => void;
  appearance?: ReactNode;
  mock: boolean;
  onMockChange: (value: boolean) => void;
  api: ApiClient;
  refresh: () => Promise<void>;
}

function secondsLabel(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value} sec` : '—';
}

export function Settings({ state, theme = 'flow', onThemeChange, appearance, mock, onMockChange, api, refresh }: SettingsProps) {
  const [confirmCall, setConfirmCall] = useState(false);
  const [distraction, setDistraction] = useState('TikTok');
  const [seconds, setSeconds] = useState('60');
  const [pending, setPending] = useState<'call' | 'demo' | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setConfirmCall(false);
    setFeedback(null);
    setPending(null);
  }, [api]);

  async function command(kind: 'call' | 'demo', run: () => Promise<CommandResult>, message: string) {
    if (busy.current) return;
    busy.current = true;
    const current = generation.current;
    setPending(kind);
    setFeedback(null);
    try {
      const result = await run();
      if (!result.ok) throw new Error(result.error || 'Mom could not complete that request. Please try again.');
      await refresh();
      if (current !== generation.current) return;
      setFeedback({ kind: 'success', message });
      setConfirmCall(false);
    } catch (error) {
      if (current !== generation.current) return;
      setFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Something went wrong. Please try again.' });
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setPending(null);
      }
    }
  }

  function forceDistraction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = Number(seconds);
    if (!distraction.trim() || !Number.isInteger(duration) || duration < 1) {
      setFeedback({ kind: 'error', message: 'Enter a distraction and a whole number of seconds greater than zero.' });
      return;
    }
    void command('demo', () => api.forceDistracted(distraction.trim(), duration), `Distraction set to ${distraction.trim()} for ${duration} seconds.`);
  }

  return (
    <div className="secondary-view settings-view">
      {appearance ?? (onThemeChange && <section className="card settings-theme-card" aria-labelledby="theme-heading"><div className="settings-section-title"><Palette size={22} aria-hidden="true" /><div><h2 id="theme-heading">Choose your atmosphere</h2><p className="muted">Same Mom. Three very different energies. Your choice is remembered.</p></div></div><ThemePicker theme={theme} onChange={onThemeChange} /></section>)}
      <div className="settings-grid">
        <section className="card settings-card" aria-labelledby="session-settings-heading"><div className="settings-section-title"><UserRound size={22} aria-hidden="true" /><h2 id="session-settings-heading">Behind the scenes</h2><span className="pill">Read only</span></div><dl className="settings-facts"><div><dt>Your name</dt><dd>{state?.user_name || '—'}</dd></div><div><dt>Demo mode</dt><dd>{state ? state.demo_mode ? 'On' : 'Off' : '—'}</dd></div><div><dt>Send “?” after</dt><dd>{secondsLabel(state?.ladder?.text_after_secs)}</dd></div><div><dt>Call after</dt><dd>{secondsLabel(state?.ladder?.call_after_secs)}</dd></div><div><dt>Callback delay</dt><dd>{secondsLabel(state?.ladder?.callback_after_secs)}</dd></div></dl><p className="settings-footnote muted">These settings come from Mom’s local app.</p></section>
        <section className="card settings-card" aria-labelledby="connection-settings-heading"><div className="settings-section-title"><FlaskConical size={22} aria-hidden="true" /><h2 id="connection-settings-heading">A little rehearsal</h2></div><div className="mock-control"><div><label htmlFor="mock-api-toggle">Use mock API</label><p className="muted">A complete practice run, with simulated messages and calls. No real calls are placed.</p></div><label className="toggle-control"><input id="mock-api-toggle" type="checkbox" role="switch" checked={mock} disabled={pending !== null} onChange={(event) => onMockChange(event.target.checked)} /><span aria-hidden="true" /></label></div><div className="settings-divider" /><div className="test-call-heading"><span className="call-icon"><Phone size={20} aria-hidden="true" /></span><div><h3>Test call</h3><p className="muted">{mock ? 'Hear from Mom in the simulated dashboard.' : 'Have Mom call your configured phone.'}</p></div></div>{confirmCall ? <div className="inline-call-confirm" role="group" aria-label="Confirm test call"><p>Your phone will ring. Call now?</p>{mock && <span className="muted">Mock API is on. This will only simulate a call.</span>}<div className="confirm-actions"><button className="button button-primary" disabled={pending !== null} onClick={() => { void command('call', () => api.testCall(), mock ? 'Simulated call started. Follow the conversation on Today.' : 'Test call requested. Mom will call your configured phone.'); }}>{pending === 'call' ? <LoaderCircle className="spinning" size={18} aria-hidden="true" /> : <Phone size={18} aria-hidden="true" />}{pending === 'call' ? 'Calling…' : 'Call now'}</button><button className="button button-secondary" disabled={pending !== null} onClick={() => setConfirmCall(false)}>Cancel</button></div></div> : <button className="button button-secondary test-call-button" disabled={pending !== null} onClick={() => { setFeedback(null); setConfirmCall(true); }}><Phone size={18} aria-hidden="true" />Test call</button>}</section>
      </div>
      <details className="card demo-controls"><summary><span className="demo-summary-title"><SlidersHorizontal size={22} aria-hidden="true" /><span>Demo controls</span><span className="pill">For the live demo</span></span><ChevronDown size={20} className="demo-chevron" aria-hidden="true" /></summary><div className="demo-controls-content"><p className="muted">Give the screen detector a nudge and let Mom’s escalation ladder take it from there.</p><form className="demo-form" onSubmit={forceDistraction}><label className="demo-field"><span>Distraction</span><input className="field" value={distraction} onChange={(event) => setDistraction(event.target.value)} placeholder="TikTok" required disabled={pending !== null} /></label><label className="demo-field demo-seconds"><span>Seconds</span><input className="field" type="number" min="1" step="1" value={seconds} onChange={(event) => setSeconds(event.target.value)} required disabled={pending !== null} /></label><button className="button button-primary" type="submit" disabled={pending !== null}>{pending === 'demo' ? <LoaderCircle className="spinning" size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{pending === 'demo' ? 'Setting distraction…' : 'Force distracted'}</button></form></div></details>
      {feedback && <div className={`settings-feedback settings-feedback-${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.kind === 'success' && <Check size={19} aria-hidden="true" />}<span>{feedback.message}</span></div>}
    </div>
  );
}
