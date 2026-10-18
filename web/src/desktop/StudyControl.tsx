import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCheck, ChevronRight, Clock3, Info, LoaderCircle, Monitor, ShieldCheck } from 'lucide-react';
import type { ApiClient, CommandResult, State, Task } from '../api/types';
import { TaskStartPicker } from '../components/TaskStartPicker';
import { conceptAccents } from '../themes/themes';
import './study.css';

export interface StudyControlProps {
  state: State;
  api: ApiClient;
  refresh: () => Promise<void>;
  now: number;
  tasks: Task[];
  disabled?: boolean;
}

type CommandName = 'start' | 'trust' | 'stop';

const examples = ['CSE homework until 9 PM', 'Finish the essay by 11 PM', 'Study for the midterm until 10'];
const successMessages: Record<CommandName, string> = {
  start: 'Session started. One small task. Mom is on your side.',
  trust: 'Got it. Mom will trust this app for this session.',
  stop: 'Session finished. Your effort counts. Take a breath.',
};

function deadlineTime(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Time unavailable';
}

function dueTime(task: Task) {
  const time = task.due_at ? Date.parse(task.due_at) : NaN;
  return Number.isFinite(time) ? time : Infinity;
}

export function StudyControl({ state, api, refresh, now, tasks, disabled = false }: StudyControlProps) {
  const [text, setText] = useState('');
  const [pending, setPending] = useState<CommandName | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const expectedSessionChange = useRef<'start' | 'stop' | null>(null);
  const previousSessionId = useRef(state.session?.started_at ?? null);
  const inputId = useId();
  const feedbackId = useId();
  const active = state.session;
  const soonestTasks = [...tasks].sort((first, second) => dueTime(first) - dueTime(second)).slice(0, 3);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? null;
  const blocked = disabled || pending !== null;
  const until = active?.until ? Date.parse(active.until) : NaN;
  const remaining = Number.isFinite(until) ? Math.max(0, Math.ceil((until - now) / 60_000)) : null;
  const focusedMinutes = Math.floor(Math.max(0, state.stats.focused_secs) / 60);
  const distracted = state.stage === 'distracted' || state.stage === 'texted';

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setPending(null);
    setError('');
    setNotice('');
    setConfirmStop(false);
    setSelectedTaskId(null);
    expectedSessionChange.current = null;
    return () => { generation.current += 1; };
  }, [api]);

  useEffect(() => {
    const sessionId = state.session?.started_at ?? null;
    if (previousSessionId.current !== sessionId) {
      const ownChange = expectedSessionChange.current === (sessionId ? 'start' : 'stop');
      previousSessionId.current = sessionId;
      expectedSessionChange.current = null;
      setError('');
      if (!ownChange) setNotice('');
    }
    setConfirmStop(false);
    if (state.session) setSelectedTaskId(null);
  }, [state.session?.started_at]);

  async function run(name: CommandName, action: () => Promise<CommandResult>) {
    if (busy.current || disabled) return;
    busy.current = true;
    const current = generation.current;
    setPending(name);
    setError('');
    setNotice('');
    if (name === 'start' || name === 'stop') expectedSessionChange.current = name;
    let applied = false;
    try {
      const result = await action();
      if (current !== generation.current) return;
      if (!result.ok) throw new Error(result.error || 'Mom could not complete that request. Please try again.');
      applied = true;
      setConfirmStop(false);
      if (name === 'start') setSelectedTaskId(null);
      if (name === 'stop') setText('');
      await refresh();
      if (current !== generation.current) return;
      setNotice(successMessages[name]);
    } catch (failure) {
      if (current !== generation.current) return;
      if (!applied) expectedSessionChange.current = null;
      setError(applied ? 'Your change was saved, but the dashboard has not refreshed yet. It will retry automatically.' : failure instanceof Error ? failure.message : 'Mom could not complete that request. Please try again.');
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setPending(null);
      }
    }
  }

  function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || disabled || selectedTask) return;
    const goal = text.trim();
    if (!goal) {
      setError('Tell Mom one thing you want to work on.');
      setNotice('');
      return;
    }
    void run('start', () => api.startSession(goal));
  }

  return <section className={`fc-study ${active ? 'fc-study-active' : ''} ${distracted ? 'fc-study-distracted' : ''}`} aria-label="Study Control" aria-busy={pending !== null}>
    <header className="fc-study-welcome">
      <div className="fc-study-stamp" aria-hidden="true">{conceptAccents.momOS.primary}</div>
      <div><p className="fc-study-eyebrow">Welcome home, {state.user_name}.</p><h1>{active ? state.stage === 'calling' ? 'Mom would like a word.' : distracted ? 'Let’s find our focus.' : 'Good. Now keep going.' : 'Homework before internet.'}</h1><p className="fc-study-subtitle">{active ? 'A little accountability, installed with love.' : 'Your future is loading. Let’s give it a head start.'}</p></div>
    </header>

    {active ? <div className="fc-study-session">
      <div className="fc-study-session-label"><span><i /> Session in progress</span><span>{state.demo_mode ? 'Demo mode' : 'Focus mode'}</span></div>
      <h2>{active.goal}</h2>
      <p className="fc-study-deadline"><Clock3 size={19} aria-hidden="true" />{active.until ? <><span>until {deadlineTime(active.until)}</span><span aria-hidden="true">·</span><strong>{remaining === null ? 'Time unavailable' : remaining === 0 ? 'Wrapping up' : `${remaining} min left`}</strong></> : <span>No deadline. One step at a time.</span>}</p>
      <div className="fc-study-meter"><div><strong>{focusedMinutes}<span> min</span></strong><p>Total focused time today</p></div><span className="fc-study-monitor" aria-hidden="true"><Monitor size={49} /><Check size={21} /></span></div>
      <div className="fc-study-actions"><button type="button" className="fc-study-button" disabled={blocked} onClick={() => void run('trust', () => api.notDistracted())}>{pending === 'trust' ? <LoaderCircle size={18} className="fc-study-spin" aria-hidden="true" /> : <ShieldCheck size={18} aria-hidden="true" />}I’m actually working</button><button type="button" className="fc-study-button fc-study-primary" disabled={blocked} onClick={() => { setConfirmStop(true); setError(''); setNotice(''); }}><Check size={18} aria-hidden="true" />Done</button></div>
      {confirmStop && <div className="fc-study-confirm" role="group" aria-label="Confirm end session"><p>All done? Save your progress and end this session?</p><div><button type="button" className="fc-study-button fc-study-primary" disabled={blocked} onClick={() => void run('stop', () => api.stopSession())}>{pending === 'stop' && <LoaderCircle size={18} className="fc-study-spin" aria-hidden="true" />}{pending === 'stop' ? 'Ending session…' : 'Yes, I’m done'}</button><button type="button" className="fc-study-button" disabled={blocked} onClick={() => setConfirmStop(false)}>Keep going</button></div></div>}
    </div> : <>
      <form className="fc-study-form" onSubmit={start}>
        <label htmlFor={inputId}>What are we working on?</label>
        <div className="fc-study-input-row"><input id={inputId} value={text} onChange={(event) => { setText(event.target.value); setError(''); }} placeholder="CSE homework until 9 PM" maxLength={500} autoComplete="off" disabled={blocked || !!selectedTask} aria-invalid={!!error} aria-describedby={error ? feedbackId : undefined} /><button type="submit" className="fc-study-button fc-study-primary" disabled={blocked || !!selectedTask}>{pending === 'start' ? <><LoaderCircle size={19} className="fc-study-spin" aria-hidden="true" />Starting…</> : <>Tell Mom<ArrowRight size={19} aria-hidden="true" /></>}</button></div>
        <p className="fc-study-help"><Info size={17} aria-hidden="true" />One small task. One promise. Mom handles the rest.</p>
      </form>
      <div className="fc-study-examples" aria-label="Session examples">{examples.map((example) => <button type="button" key={example} disabled={blocked || !!selectedTask} onClick={() => { setText(example); setError(''); setNotice(''); }}>{example}<ChevronRight size={16} aria-hidden="true" /></button>)}</div>
      {soonestTasks.length > 0 && <div className="fc-study-task-suggestions"><h2>Or make a little progress on</h2><div className="fc-study-task-chips">{soonestTasks.map((task) => <button type="button" key={task.id} aria-expanded={selectedTaskId === task.id} disabled={blocked || !!selectedTask} onClick={() => { setSelectedTaskId(task.id); setError(''); setNotice(''); }}><span>{task.context}</span><strong>{task.title}</strong><ArrowRight size={17} aria-hidden="true" /></button>)}</div>{selectedTask && <fieldset className="fc-study-task-picker" disabled={disabled}><legend className="fc-study-sr-only">Start {selectedTask.title}</legend><p className="fc-study-selected-task">{selectedTask.context} · {selectedTask.title}</p><TaskStartPicker key={selectedTask.id} task={selectedTask} api={api} refresh={refresh} now={now} onStarted={() => { setSelectedTaskId(null); setNotice(successMessages.start); }} onCancel={() => setSelectedTaskId(null)} /></fieldset>}</div>}
    </>}

    {error && <p id={feedbackId} className="fc-study-feedback fc-study-error" role="alert"><Info size={19} aria-hidden="true" />{error}</p>}
    {notice && <p className="fc-study-feedback fc-study-success" role="status" aria-live="polite"><CheckCheck size={19} aria-hidden="true" />{notice}</p>}
    {disabled && <p className="fc-study-offline" role="status">Waiting for Mom’s connection. Your last session details are still here.</p>}
    <footer className="fc-study-footnote"><span><i />A little tough love. A lot of faith in you.</span><span>Mom.exe</span></footer>
  </section>;
}
