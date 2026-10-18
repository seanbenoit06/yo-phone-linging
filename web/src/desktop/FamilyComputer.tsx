import { useEffect, useReducer, useRef, useState } from 'react';
import { Activity, ArrowUpRight, Eye, FolderOpen, Heart, Home, MessageCircle, Monitor, Phone, RotateCcw, Settings2, Terminal, Wifi, WifiOff } from 'lucide-react';
import { useDashboard, useTasks } from '../api/client';
import { useApiSource, useServerClock } from '../api/ui';
import { useSettings } from '../api/settings';
import type { Event, State, Task } from '../api/types';
import { ExcusesCard, Ladder, MoodMeter, RightNow, StatsCard, timeLabel } from '../components/dashboard';
import { Timeline } from '../components/Timeline';
import { Tasks } from '../views/Tasks';
import { Calls } from '../views/Calls';
import { Settings } from '../views/Settings';
import { conceptAccents, themes } from '../themes/themes';
import { DesktopWindow } from './DesktopWindow';
import { StudyControl } from './StudyControl';
import { IncomingCall } from './IncomingCall';
import { initialWindows, windowReducer, type WindowId } from './windowState';
import { recentMessages } from './selectors';
import { MomEyes } from './MomEyes';
import { MomLog } from './MomLog';
import { ControlSettings } from './ControlSettings';
import { GuestCall } from './GuestCall';
import './desktop.css';

function GuestPhoneIcon(props: { size?: number; strokeWidth?: number }) {
  return <Phone {...props}><path d="M16 5h6m-3-3v6" /></Phone>;
}

const applications = [
  { id: 'today' as const, title: 'Study Control', label: 'Today', icon: Home },
  { id: 'tasks' as const, title: 'My Homework', label: 'Tasks', icon: FolderOpen },
  { id: 'calls' as const, title: 'Call History', label: 'Calls', icon: Phone },
  { id: 'guest' as const, title: 'Let Mom call you', label: 'Guest Call', icon: GuestPhoneIcon },
  { id: 'eyes' as const, title: "Mom's Eyes", label: 'Eyes', icon: Eye },
  { id: 'logs' as const, title: "Mom's Log", label: 'Log', icon: Terminal },
  { id: 'settings' as const, title: 'Control Panel', label: 'Settings', icon: Settings2 },
];

function Messenger({ state, events }: { state: State | null; events: Event[] }) {
  const messages = recentMessages(events);
  const logRef = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (logRef.current && followLatest.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lastMessageId]);
  return <div className="fc-messenger">
    <div className="fc-contact"><span><Heart size={25} fill="currentColor" /></span><div><strong>Mom</strong><p>{state?.stage === 'calling' ? 'On the phone' : 'A little tough love. Always on your side.'}</p></div></div>
    <div className="fc-messages" ref={logRef} onScroll={(event) => { const element = event.currentTarget; followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 40; }} role="log" aria-label="Recent messages" aria-live="polite" aria-relevant="additions text">
      {messages.length ? messages.map((entry) => <div className={`fc-message ${entry.kind === 'text_in' ? 'fc-message-you' : ''}`} key={entry.id}>
        <strong>{entry.kind === 'text_in' ? 'You said:' : 'Mom says:'}</strong><p>{typeof entry.data.text === 'string' ? entry.data.text : entry.summary}</p><time className="fc-message-time" dateTime={entry.at}>{timeLabel(entry.at)}</time>
      </div>) : <div className="fc-message-empty"><MessageCircle size={30} /><p>No messages yet.<br />Tell Mom your plan to get started.</p></div>}
    </div>
    {state?.last_promise && <div className="fc-promise"><strong>You promised Mom</strong><p>“{state.last_promise}”</p></div>}
  </div>;
}

function HomeworkPreview({ tasks, onOpen }: { tasks: Task[]; onOpen: () => void }) {
  const soonest = [...tasks].sort((a, b) => (a.due_at ? Date.parse(a.due_at) : Infinity) - (b.due_at ? Date.parse(b.due_at) : Infinity)).slice(0, 3);
  return <div className="fc-homework-preview">
    {soonest.map((task) => <button className="fc-preview-task" key={task.id} onClick={onOpen}><FolderOpen size={20} /><span><small>{task.context}</small><strong>{task.title}</strong></span><ArrowUpRight size={18} /></button>)}
    <button className="button button-secondary" onClick={onOpen}>{tasks.length ? `Open all ${tasks.length} assignments` : 'Open homework and source status'}<ArrowUpRight size={17} /></button>
  </div>;
}

export function FamilyComputer() {
  const [mock, changeMock] = useApiSource();
  const { state, events, connection, loading, api, refresh } = useDashboard(mock);
  const controls = useSettings(api, state, refresh);
  const taskData = useTasks(mock);
  const now = useServerClock(state);
  const [windows, dispatch] = useReducer(windowReducer, initialWindows);
  const [menuOpen, setMenuOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const previousActive = useRef(windows.active);

  useEffect(() => {
    document.documentElement.dataset.theme = 'computer';
    document.title = 'Mom.exe — The Family Computer';
    return () => { delete document.documentElement.dataset.theme; };
  }, []);

  useEffect(() => {
    if (previousActive.current === windows.active) return;
    previousActive.current = windows.active;
    mainRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [windows.active]);

  useEffect(() => {
    if (!menuOpen) return;
    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function closeOutside(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target) && !menuButtonRef.current?.contains(event.target)) setMenuOpen(false);
    }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') { setMenuOpen(false); menuButtonRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); };
  }, [menuOpen]);

  function open(id: WindowId) { dispatch({ type: 'open', id }); setMenuOpen(false); }
  const source = mock ? 'MOCK DEMO' : 'LOCAL API';
  const sourceStatus = connection === 'connected' ? mock ? 'Mock API connected' : 'Mom is connected' : connection === 'offline' ? 'Reconnecting to Mom…' : 'Connecting to Mom…';
  const appearance = <section className="card fc-edition-card"><Monitor size={30} /><div><h2>The Family Computer</h2><p>Your home edition. A little accountability, installed with love.</p><div className="fc-edition-links"><a href={`/style-lab.html?concept=momOS`}>Browse design studies <ArrowUpRight size={16} /></a><a href={`/?edition=classic&mock=${mock ? 1 : 0}`}>Open classic themes <ArrowUpRight size={16} /></a></div></div></section>;

  return <div className={`family-desktop ${windows.maximized ? 'fc-maximized' : ''}`}>
    <a className="skip-link" href="#desktop-main">Skip to desktop windows</a>
    <header className="fc-desktop-header">
      <a href="#desktop-main" className="fc-brand" onClick={(event) => { event.preventDefault(); open('today'); }}><Home size={28} /><strong>MomOS <span>2002</span></strong><span>HOME EDITION</span></a>
      <div className="fc-header-links"><span className="fc-source-badge">{source}{state?.demo_mode && !mock ? ' · DEMO TIMING' : ''}</span><span className="fc-header-status"><i className={`status-dot ${connection === 'connected' ? 'ok' : connection === 'offline' ? 'error' : 'off'}`} /><span lang="zh-Hant">{connection === 'connected' ? conceptAccents.momOS.secondary : conceptAccents.momOS.primary}</span><span>{sourceStatus}</span></span></div>
    </header>
    {connection === 'offline' && <div className="fc-offline" role="status"><WifiOff size={21} /><div><strong>Can’t reach Mom. Is <code>python main.py</code> running?</strong><p>{state ? 'Showing the last update. Reconnecting automatically.' : 'Start the local API, or explore with the mock demo.'}</p></div><button className="button" onClick={() => void refresh()}>Retry</button>{!mock && <button className="button" onClick={() => changeMock(true)}>Use mock demo</button>}</div>}
    <div className="fc-desktop-layout">
      <nav className="fc-shortcuts" aria-label="Desktop applications">
        {applications.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={windows.active === id ? 'active' : ''} aria-current={windows.active === id ? 'page' : undefined} onClick={() => open(id)}><Icon size={37} strokeWidth={1.8} /><span>{label}</span></button>)}
        <button type="button" onClick={() => {
          if (windows.maximized) { dispatch({ type: 'maximize' }); if (!windows.messenger) dispatch({ type: 'messenger' }); }
          else dispatch({ type: 'messenger' });
        }} aria-pressed={windows.messenger && !windows.maximized}><MessageCircle size={37} strokeWidth={1.8} /><span>Messenger</span></button>
      </nav>
      <main id="desktop-main" className="fc-workspace" ref={mainRef} tabIndex={-1}>
        <div className="fc-main-column">
          {windows.active === null && <div className="fc-minimized-state"><Monitor size={45} /><h1>A little room to breathe.</h1><p>Your windows are minimized. Your session keeps running.</p><button className="button" onClick={() => open('today')}>Restore Study Control</button></div>}
          {applications.filter(({ id }) => windows.open.includes(id)).map(({ id, title, icon: Icon }) => <DesktopWindow key={id} title={title} icon={<Icon size={20} />} hidden={windows.active !== id} active onMinimize={() => dispatch({ type: 'minimize', id })} onMaximize={() => dispatch({ type: 'maximize' })} maximized={windows.maximized} footer={<><span>{sourceStatus}</span><span>{id === 'today' ? 'One small step at a time.' : 'Installed with love.'}</span></>}>
            {id === 'today' ? state ? <div className="fc-study-slot"><StudyControl key={mock ? 'mock' : 'real'} state={state} api={api} refresh={refresh} now={now} tasks={taskData.tasks} disabled={connection !== 'connected'} />{state.session && <Ladder state={state} now={now} events={events} />}<RightNow state={state} /></div> : <div className="fc-loading" aria-busy={loading} aria-label="Loading Study Control"><div className="skeleton skeleton-hero" /><p>{loading ? 'Mom is getting everything ready…' : 'Waiting for the local API. You can use the mock demo to explore.'}</p><button className="button" onClick={() => open('settings')}>Open Control Panel</button></div> :
              id === 'tasks' ? <div className="fc-secondary-content"><Tasks key={mock ? 'mock' : 'real'} tasks={taskData.tasks} sources={taskData.sources} loading={taskData.loading} error={taskData.error} api={api} refresh={refresh} onStarted={() => open('today')} now={now} /></div> :
              id === 'calls' ? <div className="fc-secondary-content"><Calls events={events} /></div> :
              id === 'guest' ? <GuestCall key={mock ? 'mock' : 'real'} state={state} events={events} tasks={taskData.tasks} api={api} refresh={refresh} mock={mock} connected={connection === 'connected'} active={windows.active === 'guest'} onOpenCalls={() => open('calls')} /> :
              id === 'eyes' ? <MomEyes key={mock ? 'mock' : 'real'} state={state} settings={controls.data} settingsError={controls.errorKey ? null : controls.error} api={api} active={windows.active === 'eyes'} now={now} mock={mock} /> :
              id === 'logs' ? <MomLog key={mock ? 'mock' : 'real'} api={api} active={windows.active === 'logs'} mock={mock} /> :
              <div className="fc-secondary-content"><Settings state={state} mock={mock} onMockChange={changeMock} api={api} refresh={refresh} appearance={appearance} controls={<ControlSettings state={state} controller={controls} />} /></div>}
          </DesktopWindow>)}
          {windows.active === 'today' && <>
            <DesktopWindow title="My Homework · Up next" icon={<FolderOpen size={20} />} footer={<span>{taskData.error ? 'Source update unavailable. Open Tasks for details.' : 'Assignments and deadlines from your connected sources.'}</span>}><HomeworkPreview tasks={taskData.tasks} onOpen={() => open('tasks')} /></DesktopWindow>
            <DesktopWindow title="Today’s Activity" icon={<Activity size={20} />}><div className="fc-timeline"><Timeline events={events} emptyMessage="A fresh page. Your story begins with a session." /></div></DesktopWindow>
          </>}
        </div>
        <aside className="fc-side-column" aria-label="Messages and daily insights">
          {windows.messenger && <DesktopWindow title="Mom Messenger" icon={<MessageCircle size={20} />} onMinimize={() => dispatch({ type: 'messenger' })} footer={<span>{mock ? 'Simulated messages · no phone connection' : 'Messages from your local app'}</span>}><Messenger state={state} events={events} /></DesktopWindow>}
          {state && <><DesktopWindow title="Today’s Report Card" icon={<Monitor size={20} />}><div className="fc-report"><StatsCard state={state} /></div></DesktopWindow><DesktopWindow title="Mom’s Mood" icon={<Heart size={20} />}><div className="fc-mood"><MoodMeter state={state} theme={themes.mom} /><ExcusesCard state={state} /></div></DesktopWindow></>}
          <DesktopWindow title="System Status" icon={<Settings2 size={20} />}><ul className="fc-health">{(['imessage', 'detector', 'calls', 'webcam'] as const).map((name) => <li key={name} className="fc-health-item" data-status={state?.modules[name]?.status || 'off'}><span><i className={`status-dot ${state?.modules[name]?.status || 'off'}`} /><strong>{name}</strong></span><span>{state?.modules[name]?.status || 'waiting'}</span>{state?.modules[name]?.message && <p>{state.modules[name].message}</p>}</li>)}</ul></DesktopWindow>
          <div className="fc-desktop-note"><p>Mom’s daily reminder</p><strong>You don’t have to finish everything.<br /><em>Just start one thing.</em></strong><span>♡ Love, Mom</span></div>
        </aside>
      </main>
    </div>
    {state && !(windows.active === 'guest' && state.call_in_progress?.guest_name) && <IncomingCall key={mock ? 'mock' : 'real'} state={state} now={now} mock={mock} onShowCalls={() => open('calls')} />}
    {menuOpen && <div className="fc-start-menu" ref={menuRef} id="mom-menu"><strong>MomOS 2002</strong><nav aria-label="Mom menu">{applications.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => open(id)}><Icon size={21} />{label}</button>)}<button onClick={() => { dispatch({ type: 'reset' }); setMenuOpen(false); }}><RotateCcw size={21} />Reset window layout</button><a href="/style-lab.html?concept=momOS"><Monitor size={21} />Style room</a><a href={`/?edition=classic&mock=${mock ? 1 : 0}`}><ArrowUpRight size={21} />Classic dashboard</a></nav><p>Your session continues when a window is minimized.</p></div>}
    <footer className="fc-taskbar">
      <button className="fc-menu-button" ref={menuButtonRef} type="button" aria-controls="mom-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Home size={23} fill="currentColor" /><strong>Mom Menu</strong></button>
      <div className="fc-taskbar-apps">{windows.open.map((id) => { const application = applications.find((app) => app.id === id)!; const Icon = application.icon; return <button className="fc-taskbar-app" key={id} aria-label={`${windows.active === id ? 'Minimize' : 'Restore'} ${application.title} from taskbar`} aria-pressed={windows.active === id} onClick={() => dispatch({ type: 'taskbar', id })}><Icon size={18} /><span>{application.label}</span></button>; })}</div>
      <div className="fc-tray" title={sourceStatus}>{connection === 'offline' ? <WifiOff size={18} /> : <Wifi size={18} />}<span>{mock ? 'Mock' : connection === 'connected' ? 'Connected' : connection === 'connecting' ? 'Connecting' : 'Offline'}</span><time dateTime={new Date(now).toISOString()}>{new Date(now).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time></div>
    </footer>
  </div>;
}
