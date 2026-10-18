import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarDays, Check, Clock3, GraduationCap, LayoutList, Link2, Sparkles } from 'lucide-react';
import type { ApiClient, SourceStatus, Task } from '../api/types';
import { TaskStartPicker } from '../components/TaskStartPicker';

interface TasksProps {
  tasks: Task[];
  sources: Record<string, SourceStatus>;
  loading: boolean;
  error: string | null;
  api: ApiClient;
  refresh: () => Promise<void>;
  onStarted: () => void;
  now: number;
}

// Shown as "coming soon" only while the backend doesn't report the source at all.
const integrations = [
  { key: 'trello', name: 'Trello', description: 'Mom will know your cards.', note: 'From “doing” to actually done.', icon: LayoutList, className: 'integration-trello' },
  { key: 'calendar', name: 'Google Calendar', description: 'Mom will know your deadlines.', note: 'No more “I forgot it was today.”', icon: CalendarDays, className: 'integration-calendar' },
];

const sourceIcons: Record<Task['source'], typeof GraduationCap> = { canvas: GraduationCap, trello: LayoutList, calendar: CalendarDays };

function timestamp(value: string | null): number {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Infinity;
}

function safeLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function contextColor(context: string): number {
  return [...context].reduce((total, character) => total + character.charCodeAt(0), 0) % 4;
}

function relativeDue(value: string | null, now: number): string {
  const due = timestamp(value);
  if (!Number.isFinite(due)) return 'No due date';
  const date = new Date(due);
  const today = new Date(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const day = date.toDateString() === today.toDateString() ? 'today' : date.toDateString() === tomorrow.toDateString() ? 'tomorrow' : date.toDateString() === yesterday.toDateString() ? 'yesterday' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' as const } : {}) });
  const time = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${due < now ? 'Overdue ·' : 'Due'} ${day} ${time}`;
}

function syncTime(value: string | null, now: number): string {
  const synced = timestamp(value);
  if (!Number.isFinite(synced)) return 'Waiting to sync';
  const minutes = Math.max(0, Math.floor((now - synced) / 60_000));
  if (minutes < 1) return 'Synced just now';
  if (minutes < 60) return `Synced ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synced ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `Synced ${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function Tasks({ tasks, sources, loading, error, api, refresh, onStarted, now }: TasksProps) {
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [pickerPending, setPickerPending] = useState(false);
  const pickerBusy = useRef(false);
  const onPickerPendingChange = useCallback((pending: boolean) => {
    pickerBusy.current = pending;
    setPickerPending(pending);
  }, []);
  useEffect(() => {
    setSelectedTask(null);
    onPickerPendingChange(false);
  }, [api, onPickerPendingChange]);
  function selectTask(taskId: string | null) {
    if (pickerBusy.current) return;
    setSelectedTask(taskId);
  }
  const endOfToday = new Date(now);
  endOfToday.setHours(24, 0, 0, 0);
  const endOfWeek = new Date(now);
  endOfWeek.setDate(endOfWeek.getDate() + 7);
  endOfWeek.setHours(24, 0, 0, 0);
  const groups: { label: string; tasks: Task[] }[] = ['Overdue', 'Today', 'This week', 'Later'].map((label) => ({ label, tasks: [] }));
  [...tasks].sort((a, b) => timestamp(a.due_at) - timestamp(b.due_at) || a.title.localeCompare(b.title)).forEach((task) => {
    const due = timestamp(task.due_at);
    const group = due < now ? 0 : due < endOfToday.getTime() ? 1 : due < endOfWeek.getTime() ? 2 : 3;
    groups[group].tasks.push(task);
  });
  const comingSoon = integrations.filter(({ key }) => !(key in sources));

  return (
    <div className="secondary-view tasks-view">
      <div className="task-source-line" aria-label="Task sources">{Object.entries(sources).length ? Object.entries(sources).map(([name, source]) => <span key={name} className={`task-source task-source-${source.status}`}><span className={`status-dot ${source.status}`} aria-hidden="true" /><strong>{name === 'canvas' ? 'Canvas' : name === 'trello' ? 'Trello' : name === 'calendar' ? 'Google Calendar' : name.charAt(0).toUpperCase() + name.slice(1)}</strong><span>·</span><span>{source.status === 'error' ? source.message || 'Could not sync. Trying again automatically.' : source.status === 'off' ? source.message || 'Not connected' : syncTime(source.synced_at, now)}</span></span>) : <span className="muted">{loading ? 'Checking your task sources…' : 'No task sources connected yet.'}</span>}</div>
      {error && <div className="task-load-error" role="status"><AlertCircle size={19} aria-hidden="true" /><span>{error}{tasks.length > 0 ? ' Showing your last synced tasks.' : ''}</span></div>}
      <section className="tasks-intro card"><span className="tasks-intro-icon"><Check size={28} aria-hidden="true" /></span><div><span className="section-label">LESS PLANNING. MORE STARTING.</span><h2>Your next small step, already picked.</h2><p className="muted">Pick an assignment. Choose a little time. Mom will help you follow through.</p></div><ArrowUpRight size={28} className="tasks-intro-arrow" aria-hidden="true" /></section>
      {loading && !tasks.length ? <div className="task-loading" role="status" aria-label="Loading tasks"><div className="skeleton task-skeleton" /><div className="skeleton task-skeleton" /><div className="skeleton task-skeleton" /><span className="visually-hidden">Loading your assignments.</span></div> : tasks.length ? <div className="task-groups">{groups.filter((group) => group.tasks.length).map((group) => <section className={`task-group ${group.label === 'Overdue' ? 'task-group-overdue' : ''}`} key={group.label} aria-label={`${group.label} tasks`}><div className="view-section-heading"><h2 className="section-label">{group.label.toUpperCase()}</h2><span className="pill">{group.tasks.length} {group.tasks.length === 1 ? 'task' : 'tasks'}</span></div><div className="card task-group-card">{group.tasks.map((task) => {
        const url = safeLink(task.url);
        const selected = selectedTask === task.id;
        const SourceIcon = sourceIcons[task.source] || GraduationCap;
        return <article className="task-row" key={task.id}><div className="task-row-main"><span className="task-item-icon"><SourceIcon size={23} aria-hidden="true" /></span><div className="task-row-content"><div className="task-row-context"><span className={`pill task-context task-context-${contextColor(task.context)}`}>{task.context || 'Your task'}</span>{typeof task.points === 'number' && Number.isFinite(task.points) && <span className="task-points">{task.points} {task.points === 1 ? 'pt' : 'pts'}</span>}</div><h3>{task.title}</h3><div className={`task-due ${timestamp(task.due_at) < now ? 'is-overdue' : ''}`}><Clock3 size={16} aria-hidden="true" /><time dateTime={task.due_at || undefined}>{relativeDue(task.due_at, now)}</time></div></div><div className="task-row-actions">{url ? <a className="task-open" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${task.title} in a new tab`}>Open <ArrowUpRight size={17} aria-hidden="true" /></a> : <button className="task-open" type="button" disabled title="No link available for this task" aria-label={`No link available for ${task.title}`}>Open <ArrowUpRight size={17} aria-hidden="true" /></button>}<button className="button button-secondary" disabled={pickerPending} onClick={() => selectTask(selected ? null : task.id)} aria-expanded={selected}>Start with Mom <ArrowUpRight size={17} aria-hidden="true" /></button></div></div>{selected && <TaskStartPicker key={task.id} task={task} api={api} refresh={refresh} onStarted={onStarted} onCancel={() => selectTask(null)} onPendingChange={onPickerPendingChange} now={now} />}</article>;
      })}</div></section>)}</div> : <div className="task-empty card"><Sparkles size={28} aria-hidden="true" /><h2>No tasks to show yet.</h2><p className="muted">Your assignments will appear here when a task source is connected and synced. You can always start a session from Today.</p></div>}
      {comingSoon.length > 0 && <><div className="view-section-heading"><h2 className="section-label">MORE WAYS TO STAY ON TRACK</h2><span className="pill">Coming soon</span></div>
      <div className="integration-grid task-integrations">{comingSoon.map(({ name, description, note, icon: Icon, className }) => <article className={`card integration-card ${className}`} key={name}><div className="integration-top"><span className="integration-icon"><Icon size={30} strokeWidth={1.6} aria-hidden="true" /></span><span className="pill">Soon</span></div><h2>{name}</h2><p>{description}</p><p className="integration-note muted">{note}</p><button className="button button-secondary" disabled><Link2 size={18} aria-hidden="true" />Connect</button></article>)}</div></>}
    </div>
  );
}
