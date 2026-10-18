import { useState } from 'react';
import { ArrowRight, Check, CheckCheck, ChevronRight, Clock3, Coffee, Eye, Heart, LoaderCircle, MessageCircle, Monitor, Phone, ShieldCheck, Sparkles, Volume2 } from 'lucide-react';
import type { ApiClient, Event, State, Stage, Task } from '../api/types';
import type { Theme } from '../themes/themes';
import { TaskStartPicker } from './TaskStartPicker';

export function duration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

export function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function MomPortrait({ small = false }: { small?: boolean }) {
  return <svg className={small ? 'mom-portrait small' : 'mom-portrait'} viewBox="0 0 160 180" fill="none" aria-hidden="true">
    <path d="M39 95C19 69 35 28 71 27c38-9 68 24 53 65" fill="currentColor" opacity=".2" />
    <path d="M62 29C46 12 72 3 83 18c4-21 33-6 17 13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    <path d="M39 70c-14-2-13 25 1 26 1 31 20 48 40 48s39-18 40-48c13 0 16-28 1-27-17 0-36-17-41-29-4 18-26 27-41 30Z" stroke="currentColor" strokeWidth="3" />
    <path d="M35 77h18m54 0h18M73 79h14" stroke="currentColor" strokeWidth="3" />
    <rect x="47" y="68" width="27" height="23" rx="9" stroke="currentColor" strokeWidth="3" /><rect x="87" y="68" width="27" height="23" rx="9" stroke="currentColor" strokeWidth="3" />
    <path d="M58 79h3m38 0h3m-22 6-3 17h7m-18 13c8 9 22 9 30 0M57 137l-22 14-6 21h102l-7-21-22-14M59 140l21 17 21-17" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="m130 26 3-8 3 8 8 3-8 3-3 8-3-8-8-3 8-3Z" fill="currentColor" />
  </svg>;
}

interface ActionProps { state: State; api: ApiClient; refresh: () => Promise<void>; now: number; theme: Theme; tasks: Task[] }
export function SessionCard({ state, api, refresh, now, theme, tasks }: ActionProps) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const soonestTasks = [...tasks].sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)).slice(0, 3);
  const examples = ['CSE homework until 9 PM', 'Finish the essay by 11 PM', 'Study for the midterm until 10'];
  async function run(name: string, action: () => Promise<unknown>) {
    setPending(name); setError(''); setNotice('');
    try { await action(); await refresh(); setConfirmStop(false); if (name === 'override') setNotice('Got it. Mom will trust this app for this session.'); }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.'); }
    finally { setPending(''); }
  }
  const remaining = state.session?.until ? Math.max(0, Math.ceil((Date.parse(state.session.until) - now) / 60000)) : null;
  return <section className={`session-card ${state.session ? 'is-active' : ''}`} aria-label="Focus session">
    <div className="hero-glow" aria-hidden="true" />
    <div className="hero-illustration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><MomPortrait /><span className="illustration-label">a gentle nudge.</span></div>
    <div className="hero-content">
      <div className="hero-eyebrow"><span className="live-dot" />{state.session ? 'YOUR FOCUS SESSION' : theme.heroEyebrow}</div>
      {state.session ? <>
        <h2>{state.session.goal}</h2>
        <div className="session-deadline"><Clock3 size={18} />{state.session.until ? <>until {timeLabel(state.session.until)}<span className="deadline-separator">·</span><strong>{remaining === 0 ? 'Wrapping up' : `${remaining} min left`}</strong></> : 'No deadline. One step at a time.'}</div>
        <div className="hero-actions">
          <button className="button hero-primary" disabled={!!pending} onClick={() => void run('override', () => api.notDistracted())}>{pending === 'override' ? <LoaderCircle className="spin" size={19} /> : <ShieldCheck size={19} />}I'm actually working</button>
          <button className="button hero-secondary" disabled={!!pending} onClick={() => setConfirmStop(true)}><Check size={19} />Done</button>
        </div>
        {confirmStop && <div className="inline-confirm hero-confirm" role="group" aria-label="Confirm end session"><span>All done? End this session?</span><button disabled={!!pending} onClick={() => void run('stop', () => api.stopSession())}>{pending === 'stop' ? 'Ending…' : 'Yes, I’m done'}</button><button disabled={!!pending} onClick={() => setConfirmStop(false)}>Keep going</button></div>}
      </> : <>
        <h2>What are we<br /><em>doing today?</em></h2>
        <p className="hero-note">{theme.heroNote}</p>
        <form onSubmit={(event) => { event.preventDefault(); if (text.trim()) void run('start', () => api.startSession(text.trim())); }}>
          <label className="sr-only" htmlFor="session-goal">What are we doing?</label>
          <div className="session-input"><input id="session-goal" value={text} onChange={(event) => setText(event.target.value)} placeholder="CSE homework until 9 PM" autoComplete="off" maxLength={500} disabled={!!pending} /><button type="submit" disabled={!!pending || !text.trim()}>{pending ? <LoaderCircle size={20} className="spin" /> : <>Tell Mom<ArrowRight size={19} /></>}</button></div>
        </form>
      </>}
      {error && <p className="hero-feedback error" role="alert">{error}</p>}
      {notice && <p className="hero-feedback" role="status"><CheckCheck size={18} />{notice}</p>}
    </div>
    {!state.session && <div className="example-chips" aria-label="Session examples">{examples.map((example) => <button key={example} onClick={() => setText(example)} disabled={!!pending}>{example}<ChevronRight size={15} /></button>)}</div>}
    {!state.session && soonestTasks.length > 0 && <div className="hero-task-suggestions"><p>OR MAKE A LITTLE PROGRESS ON</p><div className="hero-task-chips">{soonestTasks.map((task) => <button key={task.id} onClick={() => setSelectedTask(task)}><span>{task.context}</span>{task.title}<ArrowRight size={16} /></button>)}</div>{selectedTask && <TaskStartPicker key={selectedTask.id} task={selectedTask} api={api} refresh={refresh} now={now} onStarted={() => setSelectedTask(null)} onCancel={() => setSelectedTask(null)} />}</div>}
  </section>;
}

const stepIndex: Record<Stage, number> = { idle: 0, watching: 0, distracted: 0, texted: 1, calling: 2, waiting_callback: 3 };
export function Ladder({ state, now, events }: { state: State; now: number; events: Event[] }) {
  const elapsed = state.distracted_since ? Math.max(0, (now - Date.parse(state.distracted_since)) / 1000) : 0;
  const next = state.stage === 'texted' ? state.ladder.call_after_secs : state.ladder.text_after_secs;
  const current = state.call_in_progress?.call_type === 'callback' ? 3 : stepIndex[state.stage];
  const steps = [{ label: 'Watching', icon: Eye }, { label: 'Check-in text', icon: MessageCircle }, { label: 'Call', icon: Phone }, { label: 'Callback', icon: Clock3 }];
  const snitched = events.some((event) => (event.kind === 'call_started' || event.kind === 'call_ended') && event.data.call_type === 'snitch' && Date.parse(event.at) >= Date.parse(state.session!.started_at));
  return <section className="card ladder-card" aria-label="Escalation ladder">
    <div className="card-title-row"><h3 className="section-label">A LITTLE ACCOUNTABILITY</h3><span className="muted">Mom’s got your back</span></div>
    <ol className="ladder-steps">{steps.map(({ label, icon: Icon }, index) => <li key={label} className={`${index === current ? 'current' : ''} ${index < current ? 'complete' : ''} ${state.stage === 'calling' && index === current ? 'calling' : ''}`} aria-current={index === current ? 'step' : undefined}><span className="step-icon">{index < current ? <Check size={20} /> : <Icon size={20} />}</span><span>{label}</span>{index < 3 && <span className="step-connector" />}</li>)}</ol>
    {(state.stage === 'distracted' || state.stage === 'texted') && <div className="ladder-timer"><div><span><span className="status-dot warning" />Distracted {duration(elapsed)}</span><strong>{state.stage === 'texted' ? 'call' : 'text'} at {duration(next)}</strong></div><div className="progress-track" role="progressbar" aria-label="Time toward next intervention" aria-valuemin={0} aria-valuemax={next} aria-valuenow={Math.min(Math.floor(elapsed), next)}><span style={{ width: `${Math.min(100, elapsed / Math.max(next, 1) * 100)}%` }} /></div></div>}
    {state.stage === 'calling' && <p className="ladder-status"><Volume2 size={18} />Mom is on the phone… {state.call_in_progress?.call_type === 'callback' && 'Checking your promise.'}</p>}
    {state.stage === 'waiting_callback' && state.callback_at && <p className="ladder-status"><Clock3 size={18} />Mom calls back in <strong>{duration((Date.parse(state.callback_at) - now) / 1000)}</strong>. You’ve got this.</p>}
    {snitched && <p className="pill snitch-marker"><Phone size={16} />Snitch · Mom called your friend</p>}
  </section>;
}

export function RightNow({ state }: { state: State }) {
  const focus = state.verdict?.focus;
  return <section className="card right-now"><div className="card-title-row"><h3 className="section-label">RIGHT NOW</h3><span className="live-label"><span className="status-dot" />Live</span></div>
    <div className="activity-row"><div className="activity-icon"><Monitor size={27} /></div><div className="activity-details"><h4>{state.activity?.app || 'A quiet moment'}</h4><p title={state.activity?.title}>{state.activity?.title || 'Tell Mom your plan to get started.'}</p></div><span className={`pill verdict ${focus || 'unsure'}`}>{focus === 'on_task' ? <Check size={16} /> : <Eye size={16} />}{focus === 'on_task' ? 'On task' : focus === 'distracted' ? `Distracted${state.verdict?.distraction ? `: ${state.verdict.distraction}` : ''}` : 'Not sure'}</span></div>
    <p className="activity-reason">{state.verdict?.reason || 'A fresh page, and a little room to focus.'}</p>
  </section>;
}

export function PromiseCard({ promise }: { promise: string }) {
  return <section className="promise-card"><div className="promise-symbol"><Heart size={22} /></div><div><h3 className="section-label">YOU PROMISED MOM</h3><p>“{promise}”</p><span>One small step is still a step.</span></div><Sparkles className="promise-sparkle" size={25} /></section>;
}

export function StatsCard({ state }: { state: State }) {
  const total = state.stats.focused_secs + state.stats.distracted_secs;
  const percent = total ? Math.round(state.stats.focused_secs / total * 100) : 0;
  return <section className="card stats-card"><div className="card-title-row"><h3 className="section-label">YOUR DAY, SO FAR</h3><Sparkles size={18} className="muted" /></div><div className="stat-featured"><span className="stat-number">{Math.floor(state.stats.focused_secs / 60)}</span><span>min focused</span></div><div className="focus-visual" aria-hidden="true">{Array.from({ length: 26 }, (_, index) => <i key={index} className={index < Math.round(percent * .26) ? 'filled' : ''} style={{ height: `${20 + ((index * 13) % 30)}px` }} />)}</div><p className="stats-note">{total ? `${percent}% of your time, well spent.` : 'Make a little room for progress.'}</p><div className="small-stats"><div><strong>{Math.floor(state.stats.distracted_secs / 60)}</strong><span>min distracted</span></div><div><strong>{state.stats.calls_made}</strong><span>calls</span></div><div><strong>{state.stats.texts_sent}</strong><span>texts</span></div></div></section>;
}

export function MoodMeter({ state, theme }: { state: State; theme: Theme }) {
  const moods: Record<Stage, { name: string; level: number }> = { idle: { name: 'Calm', level: 0 }, watching: { name: 'Calm', level: 0 }, distracted: { name: 'Suspicious', level: 1 }, texted: { name: 'Annoyed', level: 2 }, calling: { name: 'Furious', level: 3 }, waiting_callback: { name: 'Hopeful', level: 1 } };
  const mood = moods[state.stage];
  return <section className={`card mood-card mood-${state.stage}`}><h3 className="section-label">MOM’S MOOD</h3><div className="mood-top"><div className="mood-avatar"><MomPortrait small /></div><div><span className="mood-name">{mood.name}</span><p>{theme.moods[state.stage]}</p></div></div><div className="mood-gauge" aria-label={`Mom is ${mood.name.toLowerCase()}`} role="img">{Array.from({ length: 4 }, (_, index) => <span key={index} className={index <= mood.level ? 'lit' : ''} />)}</div><div className="gauge-labels"><span>Warm hugs</span><span>The slipper</span></div></section>;
}

export function ExcusesCard({ state }: { state: State }) {
  return <section className="card excuses-card"><h3 className="section-label">MOM REMEMBERS</h3>{state.excuses.length ? <ul>{state.excuses.map((excuse, index) => <li key={`${index}-${excuse}`}><span>“</span>{excuse}</li>)}</ul> : <div className="excuses-empty"><Coffee size={24} /><p>No excuses on the record.<br />Let’s keep it that way.</p></div>}<p className="card-footnote">A good memory. A soft spot for you.</p></section>;
}
