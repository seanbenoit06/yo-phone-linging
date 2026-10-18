import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, LoaderCircle } from 'lucide-react';
import type { ApiClient, Task } from '../api/types';

interface TaskStartPickerProps {
  task: Task;
  api: ApiClient;
  refresh: () => Promise<void>;
  onStarted?: () => void;
  onCancel?: () => void;
  onPendingChange?: (pending: boolean) => void;
  now: number;
}

const durations = [
  { id: '30', label: '30 min', minutes: 30 },
  { id: '60', label: '1 hour', minutes: 60 },
  { id: '120', label: '2 hours', minutes: 120 },
  { id: 'due', label: 'Until due', minutes: null },
] as const;

export function TaskStartPicker({ task, api, refresh, onStarted, onCancel, onPendingChange, now }: TaskStartPickerProps) {
  const [choice, setChoice] = useState<string>('30');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const pendingCallback = useRef(onPendingChange);
  pendingCallback.current = onPendingChange;
  const id = useId();
  const due = task.due_at ? Date.parse(task.due_at) : NaN;
  const canUseDue = Number.isFinite(due) && due > now;

  useEffect(() => {
    generation.current += 1;
    busy.current = false;
    setPending(false);
    setError(null);
    setSuccess(false);
    return () => {
      generation.current += 1;
      if (busy.current) {
        busy.current = false;
        pendingCallback.current?.(false);
      }
    };
  }, [api]);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    const selected = durations.find((duration) => duration.id === choice) ?? durations[0];
    const until = selected.minutes === null ? due : now + selected.minutes * 60_000;
    if (!Number.isFinite(until) || until <= now) {
      setError('Choose a focus duration with an end time in the future.');
      return;
    }
    busy.current = true;
    const current = generation.current;
    setPending(true);
    setError(null);
    setSuccess(false);
    pendingCallback.current?.(true);
    try {
      const result = await api.startSession({ goal: `${task.context} ${task.title}`.trim(), until: new Date(until).toISOString() });
      if (current !== generation.current) return;
      if (!result.ok) throw new Error(result.error || 'Mom could not start this session. Please try again.');
      await refresh();
      if (current !== generation.current) return;
      setSuccess(true);
      onStarted?.();
    } catch (failure) {
      if (current === generation.current) setError(failure instanceof Error ? failure.message : 'Mom could not start this session. Please try again.');
    } finally {
      if (current === generation.current) {
        busy.current = false;
        setPending(false);
        pendingCallback.current?.(false);
      }
    }
  }

  return (
    <form className="task-start-picker" onSubmit={(event) => { void start(event); }} aria-label={`Start ${task.title} with Mom`}>
      <div className="task-picker-heading"><Clock3 size={19} aria-hidden="true" /><strong>How long shall we focus?</strong></div>
      <fieldset className="task-duration-options" disabled={pending}><legend className="visually-hidden">Focus duration</legend>{durations.map((duration) => <label className="task-duration" key={duration.id}><input type="radio" name={`task-duration-${id}`} value={duration.id} checked={choice === duration.id} disabled={duration.id === 'due' && !canUseDue} onChange={() => { setChoice(duration.id); setError(null); }} /><span>{duration.label}</span></label>)}</fieldset>
      {!canUseDue && <p className="task-duration-note">Until due is available when a task has a future deadline.</p>}
      <div className="task-picker-actions"><button className="button button-primary" type="submit" disabled={pending || (choice === 'due' && !canUseDue)}>{pending ? <LoaderCircle size={18} className="spinning" aria-hidden="true" /> : <ArrowUpRight size={18} aria-hidden="true" />}{pending ? 'Starting session…' : 'Start session'}</button>{onCancel && <button className="button button-secondary" type="button" disabled={pending} onClick={onCancel}>Cancel</button>}</div>
      {error && <p className="task-picker-error" role="alert">{error}</p>}
      {success && <p className="task-picker-success" role="status">Session started. Mom is on your side.</p>}
    </form>
  );
}
