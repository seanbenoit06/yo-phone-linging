import { MessageCircle, Quote } from 'lucide-react';
import type { Event } from '../api/types';

interface TranscriptLine {
  role: 'agent' | 'user' | 'unknown';
  message: string;
  seconds: number | null;
}

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function getCallDetails(event: Event) {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const labels: Record<string, string> = { nudge: 'A little nudge', callback: 'Promise check-in', snitch: 'Friend check-in' };
  const type = textValue(data.call_type);
  const transcript: TranscriptLine[] = Array.isArray(data.transcript)
    ? data.transcript.flatMap((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return [];
        const line = entry as Record<string, unknown>;
        const message = textValue(line.message);
        if (!message) return [];
        const role: TranscriptLine['role'] = line.role === 'agent' || line.role === 'user' ? line.role : 'unknown';
        return [{ role, message, seconds: typeof line.time_in_call_secs === 'number' && Number.isFinite(line.time_in_call_secs) ? Math.max(0, line.time_in_call_secs) : null }];
      })
    : [];

  return {
    type,
    label: labels[type] ?? 'Mom call',
    answered: typeof data.answered === 'boolean' ? data.answered : null,
    duration: typeof data.duration_secs === 'number' && Number.isFinite(data.duration_secs) ? Math.max(0, data.duration_secs) : null,
    promise: textValue(data.promised_step),
    excuse: textValue(data.excuse),
    transcript,
  };
}

export function formatCallTime(seconds: number | null): string {
  if (seconds === null) return '—';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function formatEventTime(at: string, includeDate = false): string {
  const date = new Date(at);
  if (!Number.isFinite(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-US', { ...(includeDate ? { month: 'short', day: 'numeric' } as const : {}), hour: 'numeric', minute: '2-digit' }).format(date);
}

export function CallTranscript({ event }: { event: Event }) {
  const call = getCallDetails(event);

  return (
    <div className="call-transcript">
      {(call.promise || call.excuse) && (
        <div className="call-takeaways">
          {call.promise && <div className="call-takeaway"><Quote size={19} aria-hidden="true" /><div><span className="section-label">THE PROMISE</span><p>{call.promise}</p></div></div>}
          {call.excuse && <div className="call-takeaway call-excuse"><MessageCircle size={19} aria-hidden="true" /><div><span className="section-label">WHAT WAS GETTING IN THE WAY</span><p>“{call.excuse}”</p></div></div>}
        </div>
      )}
      <div className="transcript-heading"><span className="section-label">THE CONVERSATION</span><span className="muted">Mom + you</span></div>
      {call.transcript.length ? (
        <ol className="transcript-lines" aria-label="Call transcript">
          {call.transcript.map((line, index) => (
            <li className={`transcript-line transcript-${line.role}`} key={`${index}-${line.seconds}`}>
              <div className="transcript-speaker"><strong>{line.role === 'agent' ? 'Mom' : line.role === 'user' ? 'You' : 'Speaker'}</strong><span className="transcript-time">{formatCallTime(line.seconds)}</span></div>
              <p>{line.message}</p>
            </li>
          ))}
        </ol>
      ) : <p className="transcript-empty muted">{call.answered === false ? 'This call was not answered. No conversation to show.' : 'No transcript is available for this call.'}</p>}
    </div>
  );
}
