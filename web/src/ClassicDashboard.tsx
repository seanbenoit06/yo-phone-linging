import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, CalendarDays, Check, CircleHelp, Heart, LayoutGrid, ListTodo, Phone, Radio, Settings2, Wifi, WifiOff } from 'lucide-react';
import { useDashboard, useTasks } from './api/client';
import { useServerClock, useApiSource } from './api/ui';
import { themes, themeIds, readTheme, type ThemeId } from './themes/themes';
import { SessionCard, Ladder, RightNow, PromiseCard, StatsCard, MoodMeter, ExcusesCard } from './components/dashboard';
import { Timeline } from './components/Timeline';
import { Calls } from './views/Calls';
import { Tasks } from './views/Tasks';
import { Settings } from './views/Settings';

type View = 'today' | 'calls' | 'tasks' | 'settings';
const navigation = [{ id: 'today' as const, label: 'Today', icon: LayoutGrid }, { id: 'calls' as const, label: 'Calls', icon: Phone }, { id: 'tasks' as const, label: 'Tasks', icon: ListTodo }, { id: 'settings' as const, label: 'Settings', icon: Settings2 }];

export default function ClassicDashboard() {
  const [view, setView] = useState<View>('today');
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [mock, changeMock] = useApiSource();
  const { state, events, connection, loading, api, refresh } = useDashboard(mock);
  const taskData = useTasks(mock);
  const now = useServerClock(state);
  const copy = themes[theme];
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('mom-theme', theme); } catch { /* The theme still works when browser storage is unavailable. */ }
  }, [theme]);
  function navigate(next: View) { setView(next); window.scrollTo({ top: 0 }); }
  const title = view === 'today' ? copy.greeting(state?.user_name || 'there') : { calls: 'A little heart-to-heart.', tasks: 'Big plans. Small steps.', settings: 'Make yourself at home.' }[view];
  const description = view === 'today' ? copy.subtitle : { calls: 'Every conversation. Every small promise.', tasks: 'Your to-do list, with a little help from Mom.', settings: 'Your space, your style. Mom’s rules still apply.' }[view];
  return <div className="app-shell">
    <a href="#main" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <a className="brand" href="#today" onClick={(event) => { event.preventDefault(); navigate('today'); }} aria-label="Mom.exe home"><span className="brand-icon">m<span>.</span></span><span>Mom<span className="brand-dot">.exe</span></span><span className="beta-badge">beta</span></a>
      <div className="sidebar-intro">A nudge in the right direction.</div>
      <nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => navigate(id)} className={`nav-item ${view === id ? 'active' : ''}`} aria-current={view === id ? 'page' : undefined}><Icon size={21} strokeWidth={1.7} /><span>{label}</span>{copy.badges && id === 'tasks' && <span className="nav-new-badge">NEW</span>}{id === 'calls' && events.filter((event) => event.kind === 'call_ended').length > 0 && <span className="nav-count">{events.filter((event) => event.kind === 'call_ended').length}</span>}{view === id && <span className="nav-active-dot" />}</button>)}</nav>
      {copy.couplet && <div className="sidebar-couplet"><span>{copy.accent}</span><p>{copy.accentTranslation}</p></div>}
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Heart size={18} /><p>On your side.<br /><strong>Even when you’re on TikTok.</strong></p></div>
        <div className="theme-switch-label"><span>MAKE IT YOURS</span><span>3 styles</span></div>
        <div className="quick-themes" aria-label="Quick theme switcher">{themeIds.map((id) => <button key={id} aria-label={`Use ${themes[id].name} theme`} aria-pressed={theme === id} className={theme === id ? 'selected' : ''} onClick={() => setTheme(id)}><span className={`theme-dot ${id}`} />{themes[id].name}{theme === id && <Check size={13} />}</button>)}</div>
        <a className="style-room-link" href={`/?mock=${mock ? 1 : 0}`}>Family Computer edition <ArrowUpRight size={16} /></a>
        <a className="style-room-link" href="/style-lab.html">Explore the Style room <ArrowUpRight size={16} /></a>
        <div className="module-health" aria-label="Module health">{(['imessage', 'detector', 'calls', 'webcam'] as const).map((name) => { const health = state?.modules[name]; return <span key={name} className="module-item" tabIndex={0} title={`${name}: ${health?.status || 'off'}${health?.message ? ` — ${health.message}` : ''}`}><i className={`status-dot ${health?.status || 'off'}`} />{name}<span className="health-tooltip">{health?.message || `${name}: ${health?.status || 'waiting for API'}`}</span></span>; })}</div>
        <div className={`connection-state ${connection}`} role="status">{connection === 'offline' ? <WifiOff size={15} /> : <Wifi size={15} />}<span>{connection === 'connected' ? mock ? 'Mock API connected' : 'Mom is connected' : connection === 'offline' ? 'Reconnecting to Mom…' : 'Connecting to Mom…'}</span></div>
      </div>
    </aside>
    <main id="main" className="main-panel" ref={mainRef}>
      <div className="topbar"><div className="breadcrumb">Your space <span>/</span><strong>{navigation.find((item) => item.id === view)?.label}</strong></div><div className="topbar-right"><span className="source-badge"><Radio size={14} />{mock ? 'MOCK DEMO' : state?.demo_mode ? 'LIVE · DEMO TIMING' : connection === 'connected' ? 'LOCAL & CONNECTED' : 'LOCAL API'}</span><span className="user-avatar" title={state?.user_name || 'Your profile'}>{state?.user_name?.slice(0, 1) || 'M'}</span></div></div>
      {connection === 'offline' && <div className="offline-banner" role="status"><AlertCircle size={19} /><span>Can’t reach Mom. Is <code>python main.py</code> running?{state ? ' Showing your last update.' : ' Retrying automatically.'}</span><button onClick={() => void refresh()}>Retry</button></div>}
      {copy.marquee.length > 0 && <div className="portal-marquee"><span className="hot-badge">{copy.accent} {copy.accentTranslation}</span><div><span>{copy.marquee.join('  ✦  ')}  ✦  {copy.marquee.join('  ✦  ')}</span></div></div>}
      <header className="page-heading"><div><div className="page-eyebrow">{view === 'today' ? <><span className="status-dot" />A FRESH CHAPTER</> : 'A LITTLE ACCOUNTABILITY'}</div><h1>{title}</h1><p>{description}</p></div><span className="date-label"><CalendarDays size={17} />{new Date(now).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></header>
      {view === 'settings' ? <Settings state={state} theme={theme} onThemeChange={setTheme} mock={mock} onMockChange={changeMock} api={api} refresh={refresh} /> : view === 'tasks' ? <Tasks tasks={taskData.tasks} sources={taskData.sources} loading={taskData.loading} error={taskData.error} api={api} refresh={refresh} onStarted={() => navigate('today')} now={now} /> : view === 'calls' ? <Calls events={events} /> : state ? <div className="dashboard-grid"><div className="main-column"><SessionCard key={mock ? 'mock' : 'real'} state={state} api={api} refresh={refresh} now={now} theme={copy} tasks={taskData.tasks} />{state.session && <Ladder state={state} now={now} events={events} />}<RightNow state={state} />{state.last_promise && <PromiseCard promise={state.last_promise} />}<Timeline events={events} emptyMessage={copy.emptyTimeline} /></div><aside className="insights-column" aria-label="Your daily insights"><StatsCard state={state} /><MoodMeter state={state} theme={copy} /><ExcusesCard state={state} /><p className="insights-note"><Heart size={15} />Built on love. And mild guilt.</p></aside></div> : <div className="loading-layout" aria-label={loading ? 'Loading dashboard' : 'Waiting for Mom to connect'} aria-busy={loading}><div className="skeleton skeleton-hero" /><div className="skeleton skeleton-stats" /><div className="skeleton skeleton-wide" /><div className="waiting-message"><CircleHelp size={20} /><p>{connection === 'offline' ? 'Start the local API, or explore with the mock demo.' : 'Mom is getting everything ready…'}</p>{connection === 'offline' && <button className="button button-primary" onClick={() => changeMock(true)}>Explore mock demo <ArrowUpRight size={18} /></button>}</div></div>}
      <footer className="page-footer"><span>Mom.exe <span>·</span> Made with unreasonable love.</span><span><Heart size={14} />One small step at a time.</span></footer>
    </main>
  </div>;
}
