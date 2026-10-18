import type { SettingsResponse, State } from '../api/types';
import type { PhotoFeedSnapshot } from './photoFeed';

export type EyeMode = 'loading' | 'settings-error' | 'unavailable' | 'off' | 'error' | 'waiting-session' | 'ready';
export interface EyeStatus { mode: EyeMode; title: string; detail: string }

export function screenStatus(state: State | null, settings: SettingsResponse | null, settingsError?: string | null): EyeStatus {
  if (!settings) return settingsError
    ? { mode: 'settings-error', title: 'Screen status unavailable', detail: settingsError }
    : { mode: 'loading', title: 'Checking screen availability…', detail: 'Waiting for the computer’s settings.' };
  if (!settings.available.screen) return { mode: 'unavailable', title: 'Not available on this computer', detail: settings.unavailable_reason.screen || 'Screen monitoring is unavailable on this computer.' };
  if (!settings.settings.screen_monitoring) return { mode: 'off', title: 'Paused', detail: 'Screen monitoring is off. Turn it on in Control Panel.' };
  if (!state) return { mode: 'loading', title: 'Waiting for screen status…', detail: 'Mom has not sent a state update yet.' };
  if (state.modules.detector.status === 'error') return { mode: 'error', title: 'Can’t see the screen', detail: state.modules.detector.message || 'The screen detector reported an error.' };
  if (!state.session) return { mode: 'waiting-session', title: 'Waiting for a session', detail: 'Tell Mom what you’re working on in Study Control.' };
  if (!state.monitor?.screen) return { mode: 'loading', title: 'Waiting for monitor details…', detail: 'No screen-monitor update has arrived yet.' };
  if (!state.monitor.screen.enabled) return { mode: 'off', title: 'Paused', detail: 'The screen monitor is not currently enabled.' };
  return { mode: 'ready', title: 'Mom is watching', detail: '' };
}

export function cameraStatus(state: State | null, settings: SettingsResponse | null, settingsError?: string | null): EyeStatus {
  if (!settings) return settingsError
    ? { mode: 'settings-error', title: 'Camera status unavailable', detail: settingsError }
    : { mode: 'loading', title: 'Checking camera availability…', detail: 'Waiting for the computer’s settings.' };
  if (!settings.available.webcam) return { mode: 'unavailable', title: 'Not available on this computer', detail: settings.unavailable_reason.webcam || 'The webcam is unavailable on this computer.' };
  if (!settings.settings.webcam) return { mode: 'off', title: 'Camera off', detail: 'Turn on Camera in Control Panel to see a preview.' };
  if (!state) return { mode: 'loading', title: 'Waiting for camera status…', detail: 'Mom has not sent a state update yet.' };
  if (state.modules.webcam.status === 'error') return { mode: 'error', title: 'Camera needs attention', detail: state.modules.webcam.message || 'The webcam reported an error.' };
  if (!state.monitor?.webcam) return { mode: 'loading', title: 'Waiting for camera details…', detail: 'No camera-monitor update has arrived yet.' };
  if (!state.monitor.webcam.enabled) return { mode: 'off', title: 'Camera off', detail: 'The camera monitor is not currently enabled.' };
  return { mode: 'ready', title: state.session ? 'Camera on' : 'Preview on', detail: '' };
}

export function cameraCanRefresh(state: State | null, settings: SettingsResponse | null, active: boolean, visible: boolean) {
  return Boolean(active && visible && settings?.available.webcam && settings.settings.webcam && state?.monitor?.webcam.enabled);
}

export function urlHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.hostname || null;
  } catch { return null; }
}

export function ageLabel(value: string | null | undefined, now: number): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const seconds = Math.max(0, Math.floor((now - parsed) / 1000));
  if (seconds < 60) return `${seconds} s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  return `${Math.floor(seconds / 3600)} h ago`;
}

export function photoDownloadAge(photo: PhotoFeedSnapshot, clientNow: number): string | null {
  return photo.url && photo.receivedAt !== null && Number.isFinite(photo.receivedAt)
    ? ageLabel(new Date(photo.receivedAt).toISOString(), clientNow)
    : null;
}

export function screenSchedule(state: State | null, now: number) {
  const monitor = state?.monitor?.screen;
  const parsed = monitor?.next_check_at ? Date.parse(monitor.next_check_at) : NaN;
  const next = Number.isFinite(parsed) ? Math.ceil((parsed - now) / 1000) : null;
  const due = Boolean(monitor?.active && next !== null && next <= 0);
  return { due, last: ageLabel(monitor?.last_check_at, now), next: monitor?.active && next !== null ? next > 0 ? `next in ${next} s` : 'next check due' : 'next check not scheduled' };
}

export function methodLabel(method: State['monitor']['screen']['method'] | undefined) {
  return method === 'rule' ? 'Rule' : method === 'ai' ? 'AI' : method === 'screenshot' ? 'AI + screenshot' : method === 'forced' ? 'Forced' : 'Awaiting first check';
}

export function latencyLabel(value: number | null | undefined): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value < 1000 ? `${Math.max(0, Math.round(value))} ms` : `${(value / 1000).toFixed(1)} s`;
}
