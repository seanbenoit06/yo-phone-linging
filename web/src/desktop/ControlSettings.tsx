import { Camera, Check, Eye, Gauge, LoaderCircle, Settings2 } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Settings, State } from '../api/types';
import type { SettingKey, SettingsController } from '../api/settings';
import './controls.css';

interface ControlSettingsProps {
  state: State | null;
  controller: SettingsController;
}

export function ControlSettings({ state, controller }: ControlSettingsProps) {
  const { data, loading, saving, savedKey, error, errorKey, update, reload } = controller;
  const settings = data?.settings;
  const busy = loading || saving !== null;

  function feedback(key: SettingKey) {
    if (saving === key) return <span className="control-saving" role="status"><LoaderCircle size={16} className="control-spinner" aria-hidden="true" />Saving…</span>;
    if (error && errorKey === key) return <p className="control-error" role="alert">{error}</p>;
    if (savedKey === key) return <span className="control-saved" role="status"><Check size={16} aria-hidden="true" />Saved</span>;
    return null;
  }

  function toggle(key: SettingKey, label: string, checked: boolean, patch: Partial<Settings>, description: string, reason?: string, extra?: ReactNode) {
    return <div className="monitor-control" key={key}>
      <label className="monitor-control-row"><span><strong>{label}</strong><span className="monitor-control-description">{description}</span></span><span className="monitor-toggle"><input type="checkbox" role="switch" checked={checked} disabled={busy || !!reason} onChange={() => { void update(patch); }} aria-label={label} /><span aria-hidden="true" /></span></label>
      {reason && <p className="monitor-control-reason">{reason}</p>}{extra}{feedback(key)}
    </div>;
  }

  const ladder = settings && state?.settings?.demo_mode === settings.demo_mode && state.demo_mode === settings.demo_mode ? state.ladder : settings?.demo_mode ? { text_after_secs: 10, call_after_secs: 25, callback_after_secs: 45 } : { text_after_secs: 120, call_after_secs: 300, callback_after_secs: 300 };
  const screenReason = data && !data.available.screen ? data.unavailable_reason.screen || 'Screen monitoring is not available on this computer.' : undefined;
  const webcamReason = data && !data.available.webcam ? data.unavailable_reason.webcam || 'The camera is not available on this computer.' : undefined;

  return <section className="card control-settings" aria-labelledby="monitoring-controls-heading" aria-busy={busy}>
    <div className="settings-section-title"><Settings2 size={23} aria-hidden="true" /><div><h2 id="monitoring-controls-heading">Mom’s control panel</h2><p className="muted">Changes take effect as soon as Mom saves them.</p></div></div>
    <div className="control-user"><span>Your name</span><strong>{state?.user_name || '—'}</strong><span className="pill">Read only</span></div>
    {error && !errorKey && <div className="control-load-error" role="alert"><p>{error}</p><button type="button" className="button button-secondary" disabled={busy} onClick={() => { void reload(); }}>Retry settings</button></div>}
    {!settings ? <div className="control-loading" role="status">{loading ? <><LoaderCircle size={20} className="control-spinner" aria-hidden="true" />Loading monitoring settings…</> : 'Settings are unavailable until Mom reconnects.'}</div> : <>
      <div className="control-group-heading"><Eye size={19} aria-hidden="true" /><h3>What Mom can see</h3></div>
      {toggle('screen_monitoring', 'Screen monitoring', settings.screen_monitoring, { screen_monitoring: !settings.screen_monitoring }, 'Let Mom check the current app and window during a session.', screenReason)}
      {toggle('screenshots', 'Screenshot second look', settings.screenshots, { screenshots: !settings.screenshots }, 'Only when the window title is unclear. Screenshots are not shown or saved here.', screenReason || (!settings.screen_monitoring ? 'Turn on Screen monitoring to enable a second look.' : undefined))}
      {toggle('webcam', 'Camera', settings.webcam, { webcam: !settings.webcam }, 'Preview in Mom’s Eyes. Mom only judges during a session.', webcamReason)}
      <div className="control-group-heading"><Gauge size={19} aria-hidden="true" /><h3>How Mom keeps you on track</h3></div>
      {toggle('detector_mode', 'Lock-in mode', settings.detector_mode === 'lockin', { detector_mode: settings.detector_mode === 'lockin' ? 'relaxed' : 'lockin' }, settings.detector_mode === 'lockin' ? 'Other work also counts as distracted. Stay with your session goal.' : 'Relaxed: other productive work is allowed.')}
      {toggle('demo_mode', 'Demo timing', settings.demo_mode, { demo_mode: !settings.demo_mode }, 'Use a faster escalation ladder for the live demo.', undefined, <dl className="control-ladder"><div><dt>Check-in text</dt><dd>{ladder.text_after_secs} sec</dd></div><div><dt>Call</dt><dd>{ladder.call_after_secs} sec</dd></div><div><dt>Callback</dt><dd>{ladder.callback_after_secs} sec</dd></div></dl>)}
      <div className="monitor-control"><div className="control-model-heading"><strong>AI model</strong><p className="monitor-control-description">Choose who takes a second look at unclear activity.</p></div><div className="control-model-options" role="group" aria-label="AI model">{(['gemini', 'jev'] as const).map((model) => <button type="button" key={model} disabled={busy} aria-pressed={settings.detector_llm === model} className={settings.detector_llm === model ? 'is-selected' : ''} onClick={() => { if (settings.detector_llm !== model) void update({ detector_llm: model }); }}>{model === 'gemini' ? 'Gemini' : 'Jev'}{settings.detector_llm === model && <Check size={17} aria-hidden="true" />}</button>)}</div>{feedback('detector_llm')}</div>
      <p className="control-storage-note"><Camera size={18} aria-hidden="true" />Photos stay in memory. Your local app saves the settings.</p>
    </>}
  </section>;
}
