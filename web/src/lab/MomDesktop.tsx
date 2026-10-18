import { useState } from 'react';
import { Check, FolderOpen, Heart, Home, MessageCircle, Minus, Monitor, Phone, Power, Square, Volume2, X } from 'lucide-react';
import { conceptAccents } from '../themes/themes';
import type { ConceptProps } from './types';
import './MomDesktop.css';

type WindowName = 'focus' | 'tasks' | 'messages';

const assignments = [
  { course: 'INFO 200', title: 'Knowledge Checkpoint Quiz', due: 'Tomorrow, 3 PM', size: '50 pts' },
  { course: 'PSYCH 210', title: 'Week 3 Writing Assignment', due: 'Tomorrow, 11:59 PM', size: '10 pts' },
  { course: 'MATH 208', title: 'Week 3 Conceptual Problems', due: 'In 2 days', size: '5 pts' },
];

export function MomDesktop(props: ConceptProps) {
  const [hidden, setHidden] = useState<WindowName[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [durationTask, setDurationTask] = useState<string | null>(null);
  const [sessionLength, setSessionLength] = useState('30 min');
  const active = props.stage !== 'ready';
  const distracted = props.stage === 'distracted';
  const restore = (name: WindowName) => { setHidden((current) => current.filter((item) => item !== name)); setMenuOpen(false); };
  const minimize = (name: WindowName) => setHidden((current) => [...new Set([...current, name])]);
  const start = (goal?: string) => { setConfirmDone(false); restore('focus'); props.onStart(goal); };

  function windowButtons(name: WindowName, canExpand = false) {
    return <div className="os-window-controls">
      <button type="button" aria-label={`Minimize ${name} window`} onClick={() => minimize(name)}><Minus size={16} /></button>
      {canExpand && <button type="button" aria-label={expanded ? 'Restore focus window size' : 'Enlarge focus window'} aria-pressed={expanded} onClick={() => setExpanded(!expanded)}><Square size={13} /></button>}
    </div>;
  }

  return <section className={`mom-os ${expanded ? 'os-expanded' : ''}`} aria-label="MomOS 2002 concept preview">
    <div className="os-desktop-brand"><Home size={23} strokeWidth={2.5} /><strong>MomOS <span>2002</span></strong><span className="os-edition">HOME EDITION</span><span className="os-desktop-status"><i /> {conceptAccents.momOS.secondary}<span>Mom is online</span></span></div>
    <div className="os-desktop">
      <nav className="os-shortcuts" aria-label="Desktop shortcuts">
        <button type="button" onClick={() => restore('focus')}><span className="os-shortcut-picture os-home"><Home size={36} strokeWidth={2} /></span><span>Mom.exe</span></button>
        <button type="button" onClick={() => restore('tasks')}><span className="os-shortcut-picture os-folder"><FolderOpen size={38} strokeWidth={1.8} /></span><span>My<br />Homework</span></button>
        <button type="button" onClick={() => restore('messages')}><span className="os-shortcut-picture os-chat"><MessageCircle size={36} strokeWidth={1.8} /></span><span>Mom<br />Messenger</span></button>
        <button type="button" onClick={() => setShowRules(!showRules)} aria-expanded={showRules}><span className="os-shortcut-picture os-rules"><Heart size={32} strokeWidth={2} /></span><span>House<br />Rules.txt</span></button>
      </nav>

      <div className="os-window-grid">
        {!hidden.includes('focus') && <section className="os-window os-focus-window">
          <header className="os-titlebar"><div><Home size={18} /><span>Mom.exe — Study Control</span></div>{windowButtons('focus', true)}</header>
          <div className="os-menubar"><span>Session</span><span>Focus</span><button type="button" onClick={() => setShowRules(!showRules)}>House rules</button><span className="os-version">v.2002</span></div>
          <div className="os-focus-content">
            <div className="os-welcome"><div className="os-mom-avatar" aria-hidden="true"><span>{conceptAccents.momOS.primary}</span></div><div><p className="os-eyebrow">WELCOME HOME, JAY.</p><h1>{active ? (distracted ? 'Caught you looking.' : props.stage === 'calling' ? 'Pick up. It’s Mom.' : 'Good. Now keep going.') : 'Homework before internet.'}</h1><p>{active ? 'A little accountability, installed with love.' : 'Your future is loading. Let’s give it a head start.'}</p></div></div>
            {active ? <div className={`os-active-session ${distracted ? 'os-warning' : ''}`}>
              <div className="os-session-label"><span><i />{distracted ? 'DISTRACTION DETECTED' : props.stage === 'calling' ? 'INCOMING CALL' : 'SESSION IN PROGRESS'}</span><span>{sessionLength} session</span></div>
              <h2>{props.goal || 'CSE homework'}</h2>
              <div className="os-session-meter"><div><strong>{props.focusedMinutes.toString().padStart(2, '0')}<span>:00</span></strong><span>total focused time today</span></div><span className="os-monitor-graphic"><Monitor size={42} /><Check size={18} /></span></div>
              <div className="os-progress-track"><span style={{ width: `${Math.min(92, 18 + props.focusedMinutes * 2)}%` }} /></div>
              <div className="os-session-actions"><button type="button" className="os-button" onClick={props.onTrust}>I’m actually working</button><button type="button" className="os-button os-primary" onClick={() => setConfirmDone(!confirmDone)}>Done studying</button></div>
              {confirmDone && <div className="os-inline-confirm"><span>Save your progress and finish?</span><button type="button" className="os-button" onClick={() => { props.onDone(); setConfirmDone(false); }}>Yes, done</button><button type="button" className="os-button" onClick={() => setConfirmDone(false)}>Keep going</button></div>}
            </div> : <form className="os-session-form" onSubmit={(event) => { event.preventDefault(); start(); }}>
              <label htmlFor="os-goal">What are we working on?</label>
              <div className="os-input-row"><input id="os-goal" value={props.goal} onChange={(event) => props.onGoalChange(event.target.value)} placeholder="CSE homework until 9 PM" /><button className="os-button os-primary" type="submit">Tell Mom <span>→</span></button></div>
              <p><span className="os-hint-icon">i</span> One small task. One promise. Mom handles the rest.</p>
            </form>}
            {props.notice && <div className="os-feedback" role="status" aria-live="polite"><span className="os-hint-icon">i</span><p>{props.notice}</p></div>}
            <div className="os-ladder" aria-label="Accountability steps">{['Watching', 'The “?” text', 'Mom calls', 'Checks back'].map((label, index) => <div key={label} className={index === (props.stage === 'calling' ? 2 : distracted ? 1 : 0) ? 'os-step-current' : ''}><span>{index + 1}</span><strong>{label}</strong></div>)}</div>
          </div>
          <footer className="os-window-status"><span><i />{distracted ? 'TikTok is not a research source.' : 'All systems running. Mom sees everything.'}</span><span>LOCAL PREVIEW</span></footer>
        </section>}

        {!hidden.includes('messages') && <section className="os-window os-messenger-window">
          <header className="os-titlebar"><div><MessageCircle size={18} /><span>Mom Messenger</span></div>{windowButtons('messages')}</header>
          <div className="os-contact"><span className="os-contact-avatar"><Heart size={24} fill="currentColor" /></span><div><strong>Mom</strong><p><i /> Always available for you</p></div></div>
          <div className="os-message-log" aria-live="polite"><div className="os-chat-date">— TODAY’S CONVERSATION —</div><div className="os-message"><span>Mom says:</span><p>You ate yet? Okay, good.<br />Now open the assignment.</p><small>9:00 PM</small></div>{props.events.slice(0, 3).reverse().map((entry) => <div className={`os-message ${entry.kind === 'call' ? 'os-message-call' : ''}`} key={entry.id}><span>{entry.kind === 'call' ? 'Call activity:' : 'Mom says:'}</span><p>{entry.text}</p><small>{entry.time}</small></div>)}</div>
          <div className="os-chat-footer"><Volume2 size={16} /><span>Notifications: impossible to miss</span></div>
        </section>}

        {!hidden.includes('tasks') && <section className="os-window os-tasks-window">
          <header className="os-titlebar"><div><FolderOpen size={19} /><span>My Homework</span></div>{windowButtons('tasks')}</header>
          <div className="os-addressbar"><span>Address</span><div><FolderOpen size={17} /> Jay / Homework / This week</div><span className="os-sync"><i /> Synced</span></div>
          <div className="os-task-table"><div className="os-task-table-head"><span>Name</span><span>Due</span><span>Open</span></div>{assignments.map((task) => <div className="os-task-group" key={task.title}><div className="os-task-row"><div><span className="os-file-icon"><span /></span><div><small>{task.course} · {task.size}</small><strong>{task.title}</strong></div></div><span>{task.due}</span><button type="button" className="os-button" onClick={() => setDurationTask(durationTask === task.title ? null : task.title)}>Start →</button></div>{durationTask === task.title && <div className="os-duration"><span>Study for:</span>{['30 min', '1 hour', '2 hours'].map((duration) => <button type="button" className="os-button" key={duration} onClick={() => { setSessionLength(duration); setDurationTask(null); start(`${task.course} ${task.title}`); }}>{duration}</button>)}</div>}</div>)}</div>
          <footer className="os-window-status"><span>3 assignments · absolutely manageable</span><span>Sample Canvas data</span></footer>
        </section>}

        <aside className="os-desktop-note"><span className="os-tape" /><p>Mom’s daily reminder</p><strong>You don’t have to<br />finish everything.<br /><span>Just start one thing.</span></strong><div><span>♡</span> Love, Mom</div></aside>
      </div>
    </div>

    {showRules && <div className="os-window os-rules-window"><header className="os-titlebar"><div><Heart size={18} /><span>House Rules.txt</span></div><button type="button" className="os-close" aria-label="Close house rules" onClick={() => setShowRules(false)}><X size={16} /></button></header><div><p>1. Drink water.</p><p>2. One assignment at a time.</p><p>3. Ask for help before giving up.</p><p>4. Call your mom sometimes.</p><p className="os-rules-signature">Installed with love. Uninstall unavailable.</p></div></div>}

    {props.stage === 'calling' && <div className="os-window os-call-window" role="dialog" aria-label="Incoming call from Mom"><header className="os-titlebar"><div><Phone size={18} /><span>Incoming call — Mom</span></div><span className="os-call-live">LIVE</span></header><div className="os-call-content"><span className="os-ringing-phone"><Phone size={40} fill="currentColor" /></span><div><p>Mom would like a word.</p><h2>“You think I don’t know?”</h2><span>Take one small step. Tell her what it is.</span></div><button type="button" className="os-button os-answer" onClick={props.onAnswer}><Phone size={18} /> Answer Mom</button></div></div>}

    {menuOpen && <div className="os-start-menu"><div>MomOS <strong>2002</strong></div><nav aria-label="Mom menu"><button type="button" onClick={() => restore('focus')}><Home /> Study Control</button><button type="button" onClick={() => restore('tasks')}><FolderOpen /> My Homework</button><button type="button" onClick={() => restore('messages')}><MessageCircle /> Mom Messenger</button><button type="button" onClick={() => { setShowRules(true); setMenuOpen(false); }}><Heart /> House Rules</button><span><Power size={18} /> Mom is always on.</span></nav></div>}
    <footer className="os-taskbar"><button type="button" className={`os-start-button ${menuOpen ? 'os-pressed' : ''}`} onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen}><Home size={22} fill="currentColor" /><strong>Mom Menu</strong></button><span className="os-taskbar-grip" /><div className="os-taskbar-tabs">{([{ key: 'focus', title: 'Mom.exe', icon: <Home size={17} /> }, { key: 'tasks', title: 'My Homework', icon: <FolderOpen size={17} /> }, { key: 'messages', title: 'Messenger', icon: <MessageCircle size={17} /> }] as const).map((item) => <button type="button" className={`os-taskbar-tab ${!hidden.includes(item.key) ? 'os-pressed' : ''}`} key={item.key} onClick={() => hidden.includes(item.key) ? restore(item.key) : minimize(item.key)} aria-label={`${hidden.includes(item.key) ? 'Restore' : 'Minimize'} ${item.title}`}>{item.icon}<span>{item.title}</span></button>)}</div><div className="os-system-tray"><Volume2 size={19} /><i /><span>Mom online</span><strong>9:41 PM</strong></div></footer>
  </section>;
}
