import { useEffect, useRef, useState } from 'react';
import type { State } from './types';

function initialMock() {
  const query = new URLSearchParams(window.location.search).get('mock');
  if (query !== null) return query === '1';
  try { return localStorage.getItem('mom-mock') === '1' || import.meta.env.VITE_USE_MOCK === '1'; }
  catch { return import.meta.env.VITE_USE_MOCK === '1'; }
}

export function useApiSource(): [boolean, (value: boolean) => void] {
  const [mock, setMock] = useState(initialMock);
  function changeMock(value: boolean) {
    setMock(value);
    try { localStorage.setItem('mom-mock', value ? '1' : '0'); } catch { /* The selected source works without storage. */ }
    const url = new URL(window.location.href);
    url.searchParams.set('mock', value ? '1' : '0');
    window.history.replaceState({}, '', url);
  }
  return [mock, changeMock];
}

export function useServerClock(state: State | null) {
  const anchor = useRef({ server: Date.now(), local: Date.now() });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!state?.now) return;
    const server = Date.parse(state.now);
    if (Number.isFinite(server)) {
      anchor.current = { server, local: Date.now() };
      setNow(server);
    }
  }, [state?.now]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(anchor.current.server + Date.now() - anchor.current.local), 250);
    return () => clearInterval(timer);
  }, []);
  return now;
}
