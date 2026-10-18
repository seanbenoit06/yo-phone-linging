import { Clock3, Phone, PhoneMissed, Sparkles } from 'lucide-react';
import type { Event } from '../api/types';
import { CallTranscript, formatCallTime, formatEventTime, getCallDetails } from '../components/CallTranscript';

export function Calls({ events }: { events: Event[] }) {
  const calls = events.filter((event) => event.kind === 'call_ended').sort((a, b) => b.id - a.id);

  return (
    <div className="secondary-view calls-view">
      <div className="view-section-heading"><h2 className="section-label">CALL HISTORY</h2><span className="pill">{calls.length} {calls.length === 1 ? 'conversation' : 'conversations'}</span></div>
      {calls.length ? <div className="call-history">{calls.map((event) => {
        const call = getCallDetails(event);
        const Icon = call.answered === false ? PhoneMissed : Phone;
        return (
          <article className="card call-card" key={event.id}>
            <header className="call-card-heading"><div className="call-card-title"><span className="call-icon"><Icon size={23} aria-hidden="true" /></span><div><span className="section-label">{call.guestName ? 'GUEST CALL' : call.type === 'callback' ? 'CALLBACK' : call.type === 'snitch' ? 'SNITCH' : call.type === 'nudge' ? 'NUDGE' : 'CALL'}</span><h2>{call.label}</h2></div></div><div className="call-meta"><time dateTime={event.at}>{formatEventTime(event.at, true)}</time><div><span className={`pill ${call.answered === false ? 'call-missed' : call.answered ? 'call-answered' : ''}`}>{call.answered === null ? 'Status unknown' : call.answered ? 'Answered' : 'Not answered'}</span><span className="call-duration"><Clock3 size={16} aria-hidden="true" />{formatCallTime(call.duration)}</span></div></div></header>
            <CallTranscript event={event} />
          </article>
        );
      })}</div> : <div className="card secondary-empty"><span className="large-empty-icon"><Phone size={32} strokeWidth={1.5} aria-hidden="true" /><Sparkles size={18} className="empty-sparkle" aria-hidden="true" /></span><h2>No calls yet. Mom is being patient.</h2><p className="muted">When Mom checks in, your conversation and promise will live here.</p></div>}
    </div>
  );
}
