import { useEffect, useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Check, ChevronRight, Clock3, History, LoaderCircle, Phone, PhoneCall, PhoneIncoming, ShieldCheck, UserRound } from 'lucide-react';
import type { ApiClient, Event, State, Task } from '../api/types';
import { advanceGuestAttempt, beginGuestAttempt, createGuestRequestGuard, guestDistractions, guestGoalSuggestions, parseGuestPhone, safeGuestError, sameGuestAttempt, validateGuestForm } from './guestModel';
import type { GuestAttempt, GuestDistraction, GuestFieldErrors } from './guestModel';
import './guest.css';

export interface GuestCallProps {
  state: State | null;
  events: Event[];
  tasks: Task[];
  api: ApiClient;
  refresh: () => Promise<void>;
  mock: boolean;
  connected: boolean;
  active: boolean;
  onOpenCalls: () => void;
}

export function GuestCall({ state, events, tasks, api, refresh, mock, connected, active, onOpenCalls }: GuestCallProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [goal, setGoal] = useState('');
  const [distraction, setDistraction] = useState<GuestDistraction>('TikTok');
  const [consent, setConsent] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<GuestFieldErrors>({});
  const [attempt, setAttempt] = useState<GuestAttempt | null>(null);
  const guard = useRef(createGuestRequestGuard());
  const source = useRef(api);
  source.current = api;
  const formId = useId();
  const confirmRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLElement>(null);
  const restoreFieldFocus = useRef(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const anyCall = Boolean(state?.call_in_progress);
  const unresolvedAttempt = Boolean(attempt && attempt.phase !== 'ended');
  const blocked = sending || unresolvedAttempt || anyCall || !connected || !active;
  const fieldsDisabled = blocked || confirmation;
  const suggestions = guestGoalSuggestions(tasks);

  useEffect(() => {
    const next = createGuestRequestGuard();
    guard.current = next;
    setPhone(''); setConsent(false); setConfirmation(false); setSending(false); setAttempt(null); setError(''); setFieldErrors({});
    return () => next.dispose();
  }, [api]);

  useEffect(() => {
    if (!active || anyCall || !connected) { setConfirmation(false); setConsent(false); }
  }, [active, anyCall, connected]);

  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== 'visible') { setConfirmation(false); setConsent(false); }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);

  useEffect(() => {
    if (!attempt) return;
    const next = advanceGuestAttempt(attempt, state, events, connected);
    if (!sameGuestAttempt(attempt, next)) setAttempt(next);
  }, [attempt, state, events, connected]);

  useEffect(() => {
    if (confirmation) confirmRef.current?.focus({ preventScroll: true });
    else if (restoreFieldFocus.current) { restoreFieldFocus.current = false; nameRef.current?.focus(); }
  }, [confirmation]);

  useEffect(() => {
    if (!sending && !attempt) return;
    statusRef.current?.scrollIntoView({ block: 'center' });
    statusRef.current?.focus({ preventScroll: true });
  }, [sending, attempt?.afterId]);

  function clearFieldError(field: keyof GuestFieldErrors) {
    setFieldErrors((previous) => { const next = { ...previous }; delete next[field]; return next; });
    setError('');
  }

  function review(event: FormEvent) {
    event.preventDefault();
    if (blocked || guard.current.pending || document.visibilityState !== 'visible') return;
    const result = validateGuestForm({ name, phone, goal, distraction, consent });
    setFieldErrors(result.errors); setError('');
    if (!result.payload) {
      const first = Object.keys(result.errors)[0];
      document.getElementById(`${formId}-${first}`)?.focus();
      return;
    }
    setPhone(parseGuestPhone(phone).display);
    if (attempt?.phase === 'ended') setAttempt(null);
    setConfirmation(true);
  }

  function confirmCall() {
    if (!confirmation || blocked || guard.current.pending || document.visibilityState !== 'visible') return;
    const result = validateGuestForm({ name, phone, goal, distraction, consent });
    if (!result.payload) { setFieldErrors(result.errors); setConfirmation(false); return; }
    const payload = result.payload;
    const nextAttempt = beginGuestAttempt(payload.name, events, state?.now || new Date().toISOString());
    const requestApi = api;
    setSending(true); setConfirmation(false); setError('');
    void guard.current.run(async () => {
      const response = await requestApi.guestCall(payload);
      if (!response.ok) throw new Error(response.error || 'The call request did not go through. Please try again.');
      return response;
    }, () => {
      if (source.current !== requestApi) return;
      setPhone(''); setConsent(false); setSending(false); setFieldErrors({}); setAttempt(nextAttempt);
      void refresh().catch(() => { /* The accepted request remains accepted while polling reconnects. */ });
    }, (reason) => {
      if (source.current !== requestApi) return;
      setSending(false); setConsent(false); setError(safeGuestError(reason, payload.phone));
    });
  }

  const blockingReason = !connected ? 'Mom is offline. Reconnect before asking for a call.' : anyCall ? 'Mom is already on a call. Please wait until it ends.' : unresolvedAttempt ? 'Your guest call is already requested. Waiting for its result.' : '';
  const statusTitle = sending ? 'Sending your request…' : attempt?.phase === 'calling' ? `Calling ${attempt.name}…` : attempt?.phase === 'dialing' ? `Dialing ${attempt.name}…` : attempt?.phase === 'ended' ? 'Call ended' : attempt?.phase === 'awaiting-end' ? 'Waiting for the call result…' : 'Getting Mom on the line…';

  return <section className="guest-call" aria-label="Ask Mom for one guest call">
    <header className="guest-heading"><div><span className="guest-eyebrow"><UserRound size={17} />GUEST PASS · ONE CALL</span><h1>Meet Mom.<br /><em>She has questions.</em></h1><p>Tell her your name and what you should be doing.<br />Then pick up. She’s been waiting to meet you.</p></div><div className="guest-phone-art" aria-hidden="true"><span className="guest-phone-rays">✦</span><PhoneCall size={64} strokeWidth={1.5} /><span>WITH LOVE,<br />MOM</span></div></header>

    <div className={`guest-mode ${mock ? 'guest-mode-mock' : ''}`}><ShieldCheck size={20} /><div><strong>{mock ? 'Mock demo · your phone will not ring' : 'One real voice call, just for you'}</strong><p>{mock ? 'This preview simulates Mom’s call and adds a short conversation to Call History.' : 'Answer on your phone. No texts are sent, and the running study session stays as it is.'}</p></div></div>

    {(sending || attempt) && <section className={`guest-status guest-status-${sending ? 'sending' : attempt?.phase}`} ref={statusRef} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true">
      <span className="guest-status-icon" aria-hidden="true">{sending || attempt?.phase === 'awaiting' ? <LoaderCircle className="guest-spinning" size={30} /> : attempt?.phase === 'ended' ? <Check size={32} /> : attempt?.phase === 'calling' ? <PhoneIncoming size={32} /> : <Clock3 size={30} />}</span>
      <div><h2>{statusTitle}</h2><p>{sending ? 'Sending one call request. Please keep this window open.' : attempt?.phase === 'calling' ? mock ? 'This simulated call finishes automatically.' : 'Answer on your phone. Mom will take it from here.' : attempt?.phase === 'ended' ? 'See Call History for the conversation.' : attempt?.phase === 'dialing' ? 'Mom has started the call. Waiting for the live call status.' : attempt?.phase === 'awaiting-end' ? 'The call status changed. Waiting for the completed conversation.' : 'Your request was accepted. Waiting for Mom’s call status.'}</p>{!connected && attempt?.phase !== 'ended' && <p className="guest-status-reconnecting">Reconnecting for the latest status. Your request has not been sent again.</p>}{attempt?.phase === 'ended' && <button type="button" className="guest-history-button" onClick={onOpenCalls}><History size={18} />Open Calls<ArrowRight size={17} /></button>}</div>
    </section>}

    <form className="guest-form" noValidate autoComplete="off" onSubmit={review}>
      <div className="guest-form-topline"><h2>Your introduction</h2><span>Required fields marked *</span></div>
      <div className="guest-fields-grid">
        <label className="guest-field" htmlFor={`${formId}-name`}><span>Name <b aria-hidden="true">*</b></span><input ref={nameRef} id={`${formId}-name`} type="text" value={name} onChange={(event) => { setName(event.target.value); clearFieldError('name'); }} maxLength={40} required disabled={fieldsDisabled} placeholder="What should Mom call you?" autoComplete="off" aria-invalid={Boolean(fieldErrors.name)} aria-describedby={fieldErrors.name ? `${formId}-name-error` : undefined} />{fieldErrors.name && <span className="guest-field-error" id={`${formId}-name-error`}>{fieldErrors.name}</span>}</label>
        <label className="guest-field" htmlFor={`${formId}-phone`}><span>Phone <b aria-hidden="true">*</b></span><input id={`${formId}-phone`} type="tel" inputMode="tel" value={phone} onChange={(event) => { setPhone(event.target.value); clearFieldError('phone'); }} onBlur={() => { const parsed = parseGuestPhone(phone); if (parsed.valid) setPhone(parsed.display); }} maxLength={40} required disabled={fieldsDisabled} placeholder="Your number, or +country code" autoComplete="off" aria-invalid={Boolean(fieldErrors.phone)} aria-describedby={`${formId}-phone-help${fieldErrors.phone ? ` ${formId}-phone-error` : ''}`} /><span className="guest-field-help" id={`${formId}-phone-help`}>US by default. Start with + for another country.</span>{fieldErrors.phone && <span className="guest-field-error" id={`${formId}-phone-error`}>{fieldErrors.phone}</span>}</label>
      </div>
      <label className="guest-field guest-goal-field" htmlFor={`${formId}-goal`}><span>What should you be doing? <small>Optional</small></span><input id={`${formId}-goal`} type="text" list={`${formId}-suggestions`} value={goal} onChange={(event) => { setGoal(event.target.value); clearFieldError('goal'); }} maxLength={120} disabled={fieldsDisabled} placeholder="Choose a class, or tell Mom your task" autoComplete="off" aria-invalid={Boolean(fieldErrors.goal)} aria-describedby={fieldErrors.goal ? `${formId}-goal-error` : undefined} /><datalist id={`${formId}-suggestions`}>{suggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}</datalist>{fieldErrors.goal && <span className="guest-field-error" id={`${formId}-goal-error`}>{fieldErrors.goal}</span>}</label>
      <label className="guest-field guest-distraction-field" htmlFor={`${formId}-distraction`}><span>What are you doing instead? <small>Optional</small></span><select id={`${formId}-distraction`} value={distraction} disabled={fieldsDisabled} onChange={(event) => { setDistraction(event.target.value as GuestDistraction); clearFieldError('distraction'); }}>{guestDistractions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <div className={`guest-consent ${fieldErrors.consent ? 'guest-consent-error' : ''}`}><label htmlFor={`${formId}-consent`}><input id={`${formId}-consent`} type="checkbox" required checked={consent} disabled={fieldsDisabled} onChange={(event) => { setConsent(event.target.checked); clearFieldError('consent'); }} aria-invalid={Boolean(fieldErrors.consent)} aria-describedby={fieldErrors.consent ? `${formId}-consent-error` : undefined} /><span>I agree to get one phone call from Mom.exe, an AI, right now.</span></label>{fieldErrors.consent && <p className="guest-field-error" id={`${formId}-consent-error`}>{fieldErrors.consent}</p>}</div>
      {error && <p className="guest-error" role="alert"><AlertTriangle size={20} />{error}</p>}
      {blockingReason && !sending && <p className="guest-blocked" role="status"><Clock3 size={18} />{blockingReason}</p>}
      {confirmation ? <div className="guest-confirm" ref={confirmRef} tabIndex={-1} role="group" aria-label="Confirm the guest call"><div><PhoneIncoming size={27} /><div><h3>Your phone will ring in a few seconds.</h3><p>{mock ? 'In this mock demo, the call is simulated.' : 'Answer when Mom calls. This is one AI voice call.'}</p></div></div><div className="guest-confirm-actions"><button type="button" className="guest-primary" disabled={blocked} onClick={confirmCall}><Phone size={19} />{mock ? 'Start simulated call' : 'Call now'}</button><button type="button" className="guest-cancel" onClick={() => { restoreFieldFocus.current = true; setConfirmation(false); setConsent(false); }}>Not yet</button></div></div> : <button className="guest-primary guest-submit" type="submit" disabled={blocked || !consent}>{sending ? <LoaderCircle className="guest-spinning" size={20} /> : <PhoneCall size={20} />}Have Mom call me<ChevronRight size={19} /></button>}
      <p className="guest-privacy"><ShieldCheck size={17} />Your phone number is cleared from this form after a successful request.</p>
    </form>
    <footer className="guest-footer"><span>One call. No texts. A little tough love.</span><span>♡ Mom.exe</span></footer>
  </section>;
}
