import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient, Settings, SettingsResponse, State } from './types';

export type SettingKey = keyof Settings;
export interface SettingsSnapshot {
  data: SettingsResponse | null;
  loading: boolean;
  error: string | null;
  errorKey: SettingKey | null;
  saving: SettingKey | null;
  savedKey: SettingKey | null;
}

type SettingsApi = Pick<ApiClient, 'getSettings' | 'updateSettings'>;
const emptySnapshot = (): SettingsSnapshot => ({ data: null, loading: true, error: null, errorKey: null, saving: null, savedKey: null });
const noopRefresh = async () => undefined;
const keysOf = (settings: Partial<Settings>) => Object.keys(settings) as SettingKey[];
const matches = (settings: Settings, expected: Partial<Settings>) => keysOf(expected).every((key) => settings[key] === expected[key]);

/** Owns acknowledged settings and rejects late reads from an older request or source. */
export function createSettingsController(api: SettingsApi, onChange: (snapshot: SettingsSnapshot) => void, refresh: () => Promise<void> = noopRefresh) {
  let active = true;
  let generation = 0;
  let snapshot = emptySnapshot();
  let reading: Promise<void> | null = null;
  let acknowledged: Partial<Settings> | null = null;

  function publish(patch: Partial<SettingsSnapshot>) {
    if (!active) return;
    snapshot = { ...snapshot, ...patch };
    onChange(snapshot);
  }

  function reload(background = false): Promise<void> {
    if (!active || snapshot.saving) return Promise.resolve();
    if (reading) return reading;
    const current = ++generation;
    if (!background || !snapshot.data) publish({ loading: true, error: null, errorKey: null });
    const request = (async () => {
      try {
        const response = await api.getSettings();
        if (!active || current !== generation) return;
        // This read is authoritative even if another client changed a saved value.
        // Keep its values until state polling catches up; the next read can replace them.
        acknowledged = { ...response.settings };
        publish({ data: response, loading: false, ...(snapshot.errorKey ? {} : { error: null, errorKey: null }) });
      } catch (failure) {
        if (active && current === generation) publish({ loading: false, errorKey: null, error: failure instanceof Error ? failure.message : 'Mom could not load the settings. Please try again.' });
      }
    })();
    reading = request;
    void request.finally(() => { if (reading === request) reading = null; });
    return request;
  }

  async function update(patch: Partial<Settings>): Promise<boolean> {
    const key = keysOf(patch)[0];
    if (!active || !key || !snapshot.data || snapshot.saving || snapshot.loading) return false;
    const current = ++generation;
    publish({ saving: key, savedKey: null, error: null, errorKey: null });
    let applied = false;
    try {
      const response = await api.updateSettings(patch);
      if (!active || current !== generation) return false;
      if (!response.ok) throw new Error('Mom could not save this setting. Please try again.');
      const { settings, available, unavailable_reason } = response;
      // A state request started before this command may still return old values.
      acknowledged = { ...acknowledged };
      for (const changedKey of keysOf(patch)) Object.assign(acknowledged, { [changedKey]: settings[changedKey] });
      applied = true;
      publish({ data: { settings, available, unavailable_reason }, savedKey: key });
      try {
        await refresh();
      } catch {
        if (active && current === generation) publish({ error: 'Saved, but the live dashboard has not refreshed yet. It will retry automatically.', errorKey: key });
      }
      return active && current === generation;
    } catch (failure) {
      if (active && current === generation) publish({ error: failure instanceof Error ? failure.message : 'Mom could not save this setting. Please try again.', errorKey: key });
      return false;
    } finally {
      if (active && current === generation) publish({ saving: null, ...(applied ? {} : { savedKey: null }) });
    }
  }

  function sync(settings: Settings | undefined) {
    if (!active || !settings || !snapshot.data || snapshot.saving || snapshot.loading) return;
    if (acknowledged && !matches(settings, acknowledged)) return;
    acknowledged = null;
    if (!matches(settings, snapshot.data.settings)) publish({ data: { ...snapshot.data, settings } });
  }

  return {
    reload,
    update,
    sync,
    getSnapshot: () => snapshot,
    stop() { active = false; generation += 1; },
  };
}

export function useSettings(api: ApiClient, state: State | null, refresh: () => Promise<void> = noopRefresh) {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot & { source: ApiClient }>(() => ({ ...emptySnapshot(), source: api }));
  const controllerRef = useRef<{ source: ApiClient; controller: ReturnType<typeof createSettingsController> } | null>(null);
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const controller = createSettingsController(api, (next) => setSnapshot({ ...next, source: api }), () => refreshRef.current());
    controllerRef.current = { source: api, controller };
    setSnapshot({ ...emptySnapshot(), source: api });
    void controller.reload();
    const timer = window.setInterval(() => { void controller.reload(true); }, 10_000);
    return () => { window.clearInterval(timer); controller.stop(); if (controllerRef.current?.controller === controller) controllerRef.current = null; };
  }, [api]);

  useEffect(() => {
    if (controllerRef.current?.source === api) controllerRef.current.controller.sync(state?.settings);
  }, [api, state?.settings, snapshot.saving, snapshot.loading]);

  const update = useCallback((patch: Partial<Settings>) => controllerRef.current?.source === api ? controllerRef.current.controller.update(patch) : Promise.resolve(false), [api]);
  const reload = useCallback(() => controllerRef.current?.source === api ? controllerRef.current.controller.reload() : Promise.resolve(), [api]);
  const current = snapshot.source === api ? snapshot : emptySnapshot();

  useEffect(() => {
    if (current.data || !current.error || current.loading || current.saving) return;
    const timer = window.setTimeout(() => { void reload(); }, 5000);
    return () => window.clearTimeout(timer);
  }, [current.data, current.error, current.loading, current.saving, reload]);

  return { data: current.data, loading: current.loading, error: current.error, errorKey: current.errorKey, saving: current.saving, savedKey: current.savedKey, update, reload };
}

export type SettingsController = ReturnType<typeof useSettings>;
