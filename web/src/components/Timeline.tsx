import { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Check, ChevronDown, Circle, CircleAlert, Eye, ListFilter, MessageCircle, Phone, Search, Sparkles, X } from 'lucide-react';
import type { Event, EventKind } from '../api/types';
import { CallTranscript, formatEventTime } from './CallTranscript';

const icons = {
  session_started: Sparkles,
  session_ended: Check,
  text_in: ArrowDownLeft,
  text_out: MessageCircle,
  verdict: Eye,
  call_started: Phone,
  call_ended: Phone,
  error: CircleAlert,
} satisfies Record<EventKind, typeof Circle>;

function searchableText(event: Event): string {
  const data = event.data && typeof event.data === 'object' ? event.data : {};
  const transcript = Array.isArray(data.transcript) ? data.transcript.flatMap((line) => line && typeof line === 'object' && typeof line.message === 'string' ? [line.message] : []) : [];
  return [event.summary, ...Object.values(data).filter((value) => typeof value === 'string'), ...transcript].join(' ').toLowerCase();
}

export function Timeline({ events, emptyMessage }: { events: Event[]; emptyMessage: string }) {
  const [search, setSearch] = useState('');
  const rows = useMemo(() => [...events].sort((a, b) => b.id - a.id).filter((event) => !search.trim() || searchableText(event).includes(search.trim().toLowerCase())), [events, search]);

  return (
    <section className="timeline-section" aria-labelledby="timeline-heading">
      <div className="timeline-topline">
        <div className="timeline-title"><h2 id="timeline-heading" className="section-label">TODAY</h2><span className="timeline-count">{events.length}</span></div>
        <label className="timeline-search"><Search size={18} aria-hidden="true" /><span className="visually-hidden">Search today’s activity</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search activity" type="search" /></label>
      </div>
      {rows.length ? (
        <ol className="timeline-list">
          {rows.map((event) => {
            const Icon = icons[event.kind] ?? Circle;
            return (
              <li key={event.id} className={`timeline-row timeline-${event.kind}`}>
                <time className="timeline-time" dateTime={event.at}>{formatEventTime(event.at)}</time>
                <span className="timeline-icon"><Icon size={20} strokeWidth={1.7} aria-hidden="true" /></span>
                {event.kind === 'call_ended' ? (
                  <details className="timeline-disclosure">
                    <summary><span className="timeline-summary">{event.summary || 'Call ended'}</span><span className="transcript-action">Transcript <ChevronDown size={17} aria-hidden="true" /></span></summary>
                    <CallTranscript event={event} />
                  </details>
                ) : <p className="timeline-summary">{event.summary || 'Activity updated'}</p>}
                {event.kind === 'text_out' && <ArrowUpRight className="timeline-direction" size={16} aria-hidden="true" />}
              </li>
            );
          })}
        </ol>
      ) : (
        <div className="timeline-empty"><span className="empty-illustration">{search ? <ListFilter size={28} aria-hidden="true" /> : <Sparkles size={28} aria-hidden="true" />}</span><p>{search ? 'No matching activity.' : emptyMessage}</p>{search && <button className="button button-secondary" onClick={() => setSearch('')}><X size={17} aria-hidden="true" />Clear search</button>}</div>
      )}
    </section>
  );
}
