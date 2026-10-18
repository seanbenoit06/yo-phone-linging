import { useEffect, useState } from 'react';
import { AlertTriangle, Camera, CameraOff, Check, Clock3, Eye, EyeOff, Globe2, Monitor, Pause, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import type { ApiClient, SettingsResponse, State } from '../api/types';
import { ageLabel, cameraCanRefresh, cameraStatus, latencyLabel, methodLabel, photoDownloadAge, screenSchedule, screenStatus, urlHost } from './eyesModel';
import { createPhotoFeed, emptyPhotoFeed, type PhotoFeedSnapshot } from './photoFeed';
import './eyes.css';

export interface MomEyesProps {
  state: State | null;
  settings: SettingsResponse | null;
  api: ApiClient;
  active: boolean;
  now: number;
  mock: boolean;
  settingsError?: string | null;
}

function PaneState({ title, detail, error = false, camera = false }: { title: string; detail: string; error?: boolean; camera?: boolean }) {
  return <div className={`eyes-empty ${error ? 'eyes-empty-error' : ''}`}>
    {error ? <AlertTriangle size={37} /> : camera ? <CameraOff size={40} /> : <EyeOff size={40} />}
    <h3>{title}</h3><p>{detail}</p>
  </div>;
}

export function MomEyes({ state, settings, api, active, now, mock, settingsError }: MomEyesProps) {
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState === 'visible');
  const [photoState, setPhotoState] = useState<{ api: ApiClient | null; snapshot: PhotoFeedSnapshot }>({ api: null, snapshot: emptyPhotoFeed });
  const [brokenPhoto, setBrokenPhoto] = useState<string | null>(null);
  const enabled = cameraCanRefresh(state, settings, true, true);
  const photo = photoState.api === api ? photoState.snapshot : emptyPhotoFeed;

  useEffect(() => {
    let mounted = true;
    setPhotoState({ api, snapshot: emptyPhotoFeed });
    const feed = createPhotoFeed({
      fetchPhoto: (timestamp, signal) => api.getWebcamPhoto(timestamp, signal),
      onChange: (snapshot) => { if (mounted) setPhotoState({ api, snapshot }); },
    });
    const syncVisibility = () => {
      const visible = document.visibilityState === 'visible';
      setPageVisible(visible);
      feed.setRunning(active && visible && enabled);
    };
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => {
      mounted = false;
      document.removeEventListener('visibilitychange', syncVisibility);
      feed.dispose();
    };
  }, [api, active, enabled]);

  const screen = screenStatus(state, settings, settingsError);
  const camera = cameraStatus(state, settings, settingsError);
  const monitor = state?.monitor;
  const schedule = screenSchedule(state, now);
  const host = urlHost(state?.activity?.url);
  const screenLatency = latencyLabel(monitor?.screen.latency_ms);
  const cameraLatency = latencyLabel(monitor?.webcam.latency_ms);
  const imageAge = ageLabel(monitor?.webcam.photo_at, now);
  const downloadAge = photoDownloadAge(photo, Date.now());
  const webcamVerdict = monitor?.webcam.verdict;
  const cameraOn = Boolean(settings?.available.webcam && settings.settings.webcam && monitor?.webcam.enabled);
  const hasPhoto = Boolean(photo.url && photo.url !== brokenPhoto && active && pageVisible && enabled);
  const errorMode = (mode: string) => mode === 'error' || mode === 'settings-error';
  const screenFocus = state?.verdict?.focus;
  const photoError = photo.error || (photo.url && photo.url === brokenPhoto ? 'The camera photo could not be displayed. Waiting for the next photo.' : null);

  return <section className="mom-eyes" aria-label="Screen and camera monitoring">
    <header className="eyes-heading"><div><p>MOM’S MONITORING DESK</p><h1>A watchful eye. A little love.</h1></div><span className="eyes-source">{mock ? 'SIMULATED FEEDS' : 'LOCAL COMPUTER'}</span></header>
    <p className="eyes-intro">See what Mom can see, and how she reached her latest verdict.</p>
    {settingsError && settings && <p className="eyes-settings-warning" role="status"><AlertTriangle size={19} />Settings could not refresh. Showing the last known configuration. {settingsError}</p>}
    <div className="eyes-panes">
      <section className="eyes-pane eyes-screen-pane" aria-labelledby="eyes-screen-title">
        <div className="eyes-pane-title"><h2 id="eyes-screen-title"><Monitor size={22} />Screen</h2><span>{screen.mode === 'ready' && monitor?.screen.active ? <><i className="eyes-live-dot" />Monitoring active</> : <><Pause size={16} />{screen.mode === 'off' ? 'Paused' : 'Standby'}</>}</span></div>
        <div className={`eyes-monitor ${screen.mode === 'ready' ? 'eyes-monitor-on' : ''} ${screen.mode === 'ready' && schedule.due && active && pageVisible ? 'eyes-check-due' : ''}`}>
          {screen.mode !== 'ready' ? <PaneState title={screen.title} detail={screen.detail} error={errorMode(screen.mode)} /> : <>
            <div className="eyes-screen-toolbar"><span><Monitor size={17} />CURRENT APPLICATION</span><span className="eyes-method">{monitor?.screen.method === 'screenshot' ? <Camera size={16} /> : monitor?.screen.method === 'ai' ? <Sparkles size={16} /> : <Eye size={16} />}{methodLabel(monitor?.screen.method)}</span></div>
            <div className="eyes-application"><span className="eyes-app-icon"><Monitor size={39} /></span><div><h3>{state?.activity?.app || 'Waiting for an app'}</h3><p>{state?.activity?.title || 'No window title has been reported yet.'}</p></div></div>
            {host && <p className="eyes-host"><Globe2 size={17} />{host}</p>}
            <div className="eyes-verdict-box"><span className={`eyes-verdict eyes-verdict-${screenFocus || 'unsure'}`}>{screenFocus === 'on_task' ? <Check size={18} /> : screenFocus === 'distracted' ? <AlertTriangle size={18} /> : <Eye size={18} />}{screenFocus === 'on_task' ? 'On task' : screenFocus === 'distracted' ? `Distracted${state?.verdict?.distraction ? `: ${state.verdict.distraction}` : ''}` : 'Not sure'}</span><p>{state?.verdict?.reason || 'Mom has not returned a verdict yet.'}</p></div>
            <div className="eyes-check-status"><span className="eyes-scan-line" aria-hidden="true" /><Clock3 size={17} /><p>{schedule.due ? 'Check due — waiting for the next result.' : monitor?.screen.active ? 'Watching for the next scheduled check.' : 'No check is currently scheduled.'}</p></div>
          </>}
        </div>
        <div className="eyes-monitor-stand" aria-hidden="true"><span /></div>
        <div className="eyes-readout"><div><Clock3 size={17} /><span>{schedule.last ? `checked ${schedule.last}` : 'No check received'}<span className="eyes-readout-separator"> · </span>{screen.mode === 'ready' ? schedule.next : 'monitoring paused'}</span></div>{screenLatency && <span>Last check took {screenLatency}</span>}</div>
        {screen.mode === 'ready' && monitor?.screen.method === 'screenshot' && <p className="eyes-screenshot-note"><ShieldCheck size={19} />Took a screenshot, looked, deleted it.</p>}
      </section>

      <section className="eyes-pane eyes-camera-pane" aria-labelledby="eyes-camera-title">
        <div className="eyes-pane-title"><h2 id="eyes-camera-title"><Camera size={22} />Camera</h2><span className={`eyes-record ${cameraOn ? 'is-recording' : ''}`} aria-label={cameraOn ? 'Camera enabled' : 'Camera disabled'}><i />{cameraOn ? 'REC' : 'OFF'}</span></div>
        <div className={`eyes-tv ${cameraOn ? 'eyes-tv-on' : ''}`}>
          <div className="eyes-tv-screen">
            {camera.mode !== 'ready' ? <PaneState title={camera.title} detail={camera.detail} error={errorMode(camera.mode)} camera /> : hasPhoto ? <><img src={photo.url!} alt={mock ? 'Simulated camera preview illustration' : 'Latest camera preview from this computer'} onError={() => setBrokenPhoto(photo.url)} /><span className="eyes-camera-overlay">{mock ? 'DEMO CAMERA' : photoError ? 'MOM CAM / LAST PHOTO' : state?.session ? 'MOM CAM / LIVE' : 'MOM CAM / PREVIEW'}</span><span className="eyes-photo-age">{downloadAge ? `downloaded ${downloadAge}` : 'Download time unavailable'}</span></> : <div className={`eyes-camera-wait ${photoError ? 'eyes-camera-error' : ''}`}>
              {photoError ? <AlertTriangle size={41} /> : !active || !pageVisible ? <Pause size={41} /> : <Camera size={41} />}
              <h3>{photoError ? 'Photo unavailable' : !active || !pageVisible ? 'Preview paused' : 'Waiting for the first photo'}</h3>
              <p>{photoError || (!active || !pageVisible ? 'The photo feed resumes when this window is visible.' : 'Camera photos refresh every 3 seconds while this window is visible.')}</p>
            </div>}
          </div>
          <div className="eyes-tv-controls" aria-hidden="true"><span className="eyes-tv-knob" /><span className="eyes-tv-knob eyes-tv-knob-small" /><span className="eyes-tv-speaker" /><span className="eyes-tv-led" /></div>
          <div className="eyes-tv-brand" aria-hidden="true">MOM VISION <span>COLOR / HOME EDITION</span></div>
        </div>
        {photoError && hasPhoto && camera.mode === 'ready' && <p className="eyes-photo-warning" role="status"><AlertTriangle size={18} />{photoError} Showing the last received photo.</p>}
        {camera.mode === 'ready' && <div className="eyes-camera-verdict">
          {!state?.session ? <><span className="eyes-verdict eyes-verdict-preview"><Eye size={18} />Preview only</span><p>Mom only judges during a session.</p></> : <><span className={`eyes-verdict eyes-verdict-${webcamVerdict?.focus || 'unsure'}`}>{webcamVerdict?.focus === 'on_task' ? <Check size={18} /> : webcamVerdict?.focus === 'distracted' ? <Smartphone size={18} /> : <Eye size={18} />}{webcamVerdict?.focus === 'on_task' ? 'Focused' : webcamVerdict?.focus === 'distracted' ? 'Phone in hand!' : 'Not sure'}</span><p>{webcamVerdict?.reason || 'Waiting for Mom’s first camera verdict.'}</p></>}
        </div>}
        {camera.mode === 'ready' && <div className="eyes-readout"><div><Clock3 size={17} /><span>{imageAge ? `Latest server photo ${imageAge}` : 'No server photo timestamp yet'}</span></div>{state?.session && cameraLatency && <span>Last judgment took {cameraLatency}</span>}</div>}
        <p className="eyes-privacy"><ShieldCheck size={20} /><span>Photos stay in memory. Nothing is saved.</span></p>
      </section>
    </div>
    <footer className="eyes-footer"><ShieldCheck size={18} /><span>Screen URLs show the host only. Camera previews pause when this window is hidden.</span></footer>
  </section>;
}
