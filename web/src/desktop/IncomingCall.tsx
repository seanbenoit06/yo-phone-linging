import { useId, useState } from 'react';
import { Clock3, History, Phone, X } from 'lucide-react';
import type { State } from '../api/types';
import './study.css';

export interface IncomingCallProps {
  state: State;
  now: number;
  mock: boolean;
  onShowCalls: () => void;
}

function elapsedTime(startedAt: string, now: number) {
  const started = Date.parse(startedAt);
  if (!Number.isFinite(started)) return 'Time unavailable';
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const callLabels = { nudge: 'Focus check-in', callback: 'Promise check-in', snitch: 'Friend check-in' };

export function IncomingCall({ state, now, mock, onShowCalls }: IncomingCallProps) {
  const [dismissedCall, setDismissedCall] = useState<string | null>(null);
  const titleId = useId();
  const call = state.call_in_progress;
  const identity = call ? `${call.call_type}:${call.started_at}:${call.guest_name || ''}` : null;
  if (!call || dismissedCall === identity) return null;
  const friendCall = call.call_type === 'snitch';

  return <aside className="fc-call" role="dialog" aria-modal="false" aria-labelledby={titleId}>
    <header className="fc-call-titlebar"><div><Phone size={18} aria-hidden="true" /><span>Mom.exe — Call in progress</span></div><button type="button" aria-label="Dismiss call notification" onClick={() => setDismissedCall(identity)}><X size={17} aria-hidden="true" /></button></header>
    <div className="fc-call-content"><div className="fc-call-heading"><span className="fc-call-phone" aria-hidden="true"><Phone size={37} fill="currentColor" /></span><div><p>{call.guest_name ? 'Guest call' : callLabels[call.call_type]}</p><h2 id={titleId}>{call.guest_name ? `Mom is calling ${call.guest_name}.` : friendCall ? 'Mom is calling your friend.' : call.call_type === 'callback' ? 'Mom is checking back.' : 'Mom would like a word.'}</h2><span className="fc-call-elapsed"><Clock3 size={16} aria-hidden="true" />{elapsedTime(call.started_at, now)} elapsed</span></div></div>
      <div className="fc-call-guidance"><Phone size={21} aria-hidden="true" /><div><strong>{mock ? 'Simulated call' : call.guest_name ? `${call.guest_name} answers on their phone` : friendCall ? 'Your friend answers on their phone' : 'Answer on your phone'}</strong><p>{mock ? 'This call finishes automatically. The transcript will appear in Call History.' : 'This window shows call status. The conversation happens on the phone.'}</p></div></div>
      <div className="fc-call-actions"><button type="button" className="fc-call-history" onClick={() => { setDismissedCall(identity); onShowCalls(); }}><History size={18} aria-hidden="true" />Open Call History</button><button type="button" onClick={() => setDismissedCall(identity)}>Dismiss notification</button></div><p className="fc-call-note">Dismissing this notification does not end the call.</p>
    </div>
  </aside>;
}
