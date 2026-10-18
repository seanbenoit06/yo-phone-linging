import type { Event, State, Task } from '../api/types';

export const guestDistractions = ['TikTok', 'Instagram', 'YouTube', 'your phone'] as const;
export type GuestDistraction = typeof guestDistractions[number];

export interface GuestForm {
  name: string;
  phone: string;
  goal: string;
  distraction: GuestDistraction;
  consent: boolean;
}

export interface GuestPayload {
  name: string;
  phone: string;
  goal: string;
  distraction: GuestDistraction;
  consent: true;
}

export type GuestFieldErrors = Partial<Record<keyof GuestForm, string>>;

export function parseGuestPhone(value: string): { valid: boolean; canonical: string; display: string } {
  const trimmed = value.trim();
  if (!trimmed || !/^\+?[\d\s().-]+$/.test(trimmed)) return { valid: false, canonical: '', display: trimmed };
  const digits = trimmed.replace(/\D/g, '');
  const international = trimmed.startsWith('+');
  let canonical = '';
  if (international) {
    if (!/^[1-9]\d{7,14}$/.test(digits)) return { valid: false, canonical: '', display: trimmed };
    canonical = `+${digits}`;
  } else if (digits.length === 10 && /^[2-9]/.test(digits)) {
    canonical = `+1${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    canonical = `+${digits}`;
  } else {
    return { valid: false, canonical: '', display: trimmed };
  }
  const local = canonical.startsWith('+1') && canonical.length === 12 ? canonical.slice(2) : null;
  const display = local ? `+1 (${local.slice(0, 3)}) ${local.slice(3, 6)}-${local.slice(6)}` : canonical;
  return { valid: true, canonical, display };
}

export function validateGuestForm(form: GuestForm): { errors: GuestFieldErrors; payload: GuestPayload | null } {
  const errors: GuestFieldErrors = {};
  const name = form.name.trim();
  const goal = form.goal.trim();
  const phone = parseGuestPhone(form.phone);
  if (!name) errors.name = 'Tell Mom your name first.';
  else if (name.length > 40) errors.name = 'Keep your name to 40 characters or fewer.';
  else if (/[\p{C}{}<>]/u.test(name)) errors.name = 'Use a printable name without braces or angle brackets.';
  if (!form.phone.trim()) errors.phone = 'Enter the phone you want Mom to call.';
  else if (!phone.valid) errors.phone = 'Enter a valid US number, or start with + and your country code.';
  if (goal.length > 120) errors.goal = 'Keep the task to 120 characters or fewer.';
  if (!guestDistractions.includes(form.distraction)) errors.distraction = 'Choose one of the listed distractions.';
  if (form.consent !== true) errors.consent = 'Please agree to this one AI phone call before continuing.';
  return {
    errors,
    payload: Object.keys(errors).length ? null : { name, phone: phone.canonical, goal: goal || 'your homework', distraction: form.distraction, consent: true },
  };
}

export function guestGoalSuggestions(tasks: Task[]): string[] {
  return [...new Set([...tasks.map((task) => task.context.trim()), 'CSE 143 homework', 'Studying for the midterm'].filter(Boolean))];
}

export function safeGuestError(error: unknown, submittedPhone: string): string {
  let message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'The call request did not go through. Please try again.';
  const parsed = parseGuestPhone(submittedPhone);
  for (const value of [...new Set([submittedPhone.trim(), parsed.canonical, parsed.display])].filter(Boolean)) {
    message = message.split(value).join('[phone hidden]');
  }
  return message.replace(/\+?\(?\d[\d\s().-]{6,}\d\)?/g, (candidate) => candidate.replace(/\D/g, '').length >= 8 ? '[phone hidden]' : candidate);
}

export interface GuestAttempt {
  name: string;
  afterId: number;
  notBefore: string;
  phase: 'awaiting' | 'dialing' | 'calling' | 'awaiting-end' | 'ended';
  startedAt: string | null;
  canFinishOnGone: boolean;
}

export function beginGuestAttempt(name: string, events: Event[], notBefore: string): GuestAttempt {
  return { name, afterId: Math.max(0, ...events.map((event) => event.id)), notBefore, phase: 'awaiting', startedAt: null, canFinishOnGone: false };
}

export function advanceGuestAttempt(attempt: GuestAttempt, state: State | null, events: Event[], connected: boolean): GuestAttempt {
  if (attempt.phase === 'ended') return attempt;
  const notBefore = Date.parse(attempt.notBefore);
  const call = state?.call_in_progress;
  const matches = call?.guest_name === attempt.name && Date.parse(call.started_at) >= notBefore && (!attempt.startedAt || call.started_at === attempt.startedAt);
  if (connected && matches && call) return { ...attempt, phase: 'calling', startedAt: call.started_at, canFinishOnGone: true };
  const eligible = events.filter((entry) => entry.id > attempt.afterId && entry.data.guest_name === attempt.name && Date.parse(entry.at) >= notBefore);
  const starts = eligible.filter((entry) => entry.kind === 'call_started' && (!attempt.startedAt || Date.parse(entry.at) >= Date.parse(attempt.startedAt)));
  const started = starts.reduce<Event | null>((latest, entry) => !latest || entry.id > latest.id ? entry : latest, null);
  const ended = started && eligible.some((entry) => entry.kind === 'call_ended' && entry.id > started.id && Date.parse(entry.at) >= Date.parse(started.at));
  if (ended) return { ...attempt, phase: 'ended', canFinishOnGone: false };
  if (!state || !connected) return started && attempt.phase === 'awaiting' ? { ...attempt, phase: 'dialing' } : attempt;
  if (!call && attempt.canFinishOnGone) return { ...attempt, phase: 'ended', canFinishOnGone: false };
  if (call && attempt.startedAt) return { ...attempt, phase: 'awaiting-end', canFinishOnGone: false };
  if (started && attempt.phase === 'awaiting') return { ...attempt, phase: 'dialing' };
  return attempt;
}

export function sameGuestAttempt(left: GuestAttempt, right: GuestAttempt) {
  return left.name === right.name && left.afterId === right.afterId && left.notBefore === right.notBefore && left.phase === right.phase && left.startedAt === right.startedAt && left.canFinishOnGone === right.canFinishOnGone;
}

export function createGuestRequestGuard() {
  let pending = false;
  let disposed = false;
  return {
    get pending() { return pending; },
    async run<T>(action: () => Promise<T>, accepted: (result: T) => void, failed: (error: unknown) => void) {
      if (disposed || pending) return false;
      pending = true;
      try {
        const result = await action();
        if (!disposed) accepted(result);
      } catch (error) {
        if (!disposed) failed(error);
      } finally {
        pending = false;
      }
      return true;
    },
    dispose() { disposed = true; },
  };
}
