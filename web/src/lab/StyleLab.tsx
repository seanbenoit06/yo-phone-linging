import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Monitor, Newspaper, NotebookPen, PhoneIncoming, RotateCcw, Sparkles } from 'lucide-react';
import type { ConceptId, ConceptProps, PreviewEntry, PreviewStage } from './types';
import { Portal2003 } from './Portal2003';
import { MomBlog } from './MomBlog';
import { MomDesktop } from './MomDesktop';

const concepts = [
  { id: 'portal03' as const, name: 'Family Portal', year: '2003', icon: Newspaper, note: 'Your homework makes the headlines.', color: '#244ca4' },
  { id: 'blog06' as const, name: 'Mom’s Little Corner', year: '2006', icon: NotebookPen, note: 'A personal blog. Very personal opinions.', color: '#9b5185' },
  { id: 'momOS' as const, name: 'The Family Computer', year: '2002', icon: Monitor, note: 'Mom has administrator privileges.', color: '#197c6b' },
];
const scenes: { id: PreviewStage; label: string }[] = [
  { id: 'ready', label: 'Before you start' }, { id: 'focused', label: 'On task' },
  { id: 'distracted', label: 'Caught scrolling' }, { id: 'calling', label: 'Mom is calling' },
];

function readConcept(): ConceptId {
  const parameter = new URLSearchParams(window.location.search).get('concept');
  if (concepts.some((concept) => concept.id === parameter)) return parameter as ConceptId;
  try {
    const saved = localStorage.getItem('mom-lab-concept');
    if (concepts.some((concept) => concept.id === saved)) return saved as ConceptId;
  } catch { /* The style room also works without storage. */ }
  return 'portal03';
}

function sampleEvents(): PreviewEntry[] {
  return [
    { id: 3, time: '2:42 PM', kind: 'message', text: 'You promised Mom: open the assignment and read problem one.' },
    { id: 2, time: '2:40 PM', kind: 'call', text: 'A little talk. A smaller first step. You’ve got this.' },
    { id: 1, time: '2:15 PM', kind: 'note', text: 'CSE homework. One focused afternoon, coming right up.' },
  ];
}

export function StyleLab() {
  const [concept, setConcept] = useState<ConceptId>(readConcept);
  const [stage, setStage] = useState<PreviewStage>('focused');
  const [goal, setGoal] = useState('CSE homework');
  const [events, setEvents] = useState<PreviewEntry[]>(sampleEvents);
  const [calls, setCalls] = useState(2);
  const [notice, setNotice] = useState('');
  const [resetVersion, setResetVersion] = useState(0);
  const selected = concepts.find((item) => item.id === concept)!;

  useEffect(() => {
    try { localStorage.setItem('mom-lab-concept', concept); } catch { /* Switching remains available when storage is blocked. */ }
    const url = new URL(window.location.href);
    url.searchParams.set('concept', concept);
    window.history.replaceState({}, '', url);
    document.title = `${selected.name} — Mom.exe Style Room`;
  }, [concept, selected.name]);

  function log(text: string, kind: PreviewEntry['kind'] = 'note') {
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    setEvents((previous) => [{ id: Math.max(0, ...previous.map((event) => event.id)) + 1, time, kind, text }, ...previous].slice(0, 8));
  }

  function showScene(next: PreviewStage) {
    setStage(next); setNotice('');
    if (next === 'calling' && stage !== 'calling') { setCalls((value) => value + 1); log('Mom is calling. Your future would like a word.', 'call'); }
    if (next === 'distracted' && stage !== 'distracted') log('TikTok is open. Mom has noticed.', 'message');
  }

  const props: ConceptProps = {
    stage, goal, onGoalChange: setGoal, events, calls, focusedMinutes: 47, notice,
    onStart: (task) => {
      const nextGoal = (task ?? goal).trim();
      if (!nextGoal) { setNotice('Tell Mom what you want to work on first.'); return; }
      setGoal(nextGoal); setStage('focused'); setNotice('Okay. One small step at a time. Mom is watching.');
      log(`Started: ${nextGoal}. Mom is on your side.`);
    },
    onDone: () => { setStage('ready'); setNotice('Good work. Mom is proud of you.'); log('Session complete. Time for a little break.'); },
    onTrust: () => { setStage('focused'); setNotice('Mom trusts you. This app is part of your work.'); log('You told Mom you are actually working.', 'message'); },
    onAnswer: () => { setStage('focused'); setNotice('You promised: open the assignment and read problem one.'); log('Call answered. A five-minute promise made.', 'call'); },
  };

  function reset() { setStage('focused'); setGoal('CSE homework'); setEvents(sampleEvents()); setCalls(2); setNotice(''); setResetVersion((version) => version + 1); }

  return <div className="style-lab">
    <header className="lab-header">
      <div className="lab-topline"><a href="/?mock=1"><ArrowLeft size={16} />Mom.exe dashboard</a><span><span className="lab-dot" />INTERACTIVE DESIGN STUDIES</span></div>
      <div className="lab-heading"><div><p>THE STYLE ROOM / VOL. 02</p><h1>Same Mom. A different era.</h1></div><p>Three worlds to try on.<br />Choose a style, then see what happens when Mom calls.</p></div>
      <div className="lab-concepts" role="tablist" aria-label="Choose a design concept">{concepts.map(({ id, name, year, note, color, icon: Icon }, index) => <button key={id} id={`tab-${id}`} role="tab" tabIndex={concept === id ? 0 : -1} aria-selected={concept === id} aria-controls="concept-preview" className={concept === id ? 'is-selected' : ''} style={{ '--concept-color': color } as React.CSSProperties} onClick={() => setConcept(id)} onKeyDown={(event) => {
        const next = event.key === 'ArrowRight' ? (index + 1) % concepts.length : event.key === 'ArrowLeft' ? (index + concepts.length - 1) % concepts.length : event.key === 'Home' ? 0 : event.key === 'End' ? concepts.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setConcept(concepts[next].id);
        document.getElementById(`tab-${concepts[next].id}`)?.focus();
      }}><span className="lab-concept-number">0{index + 1} / {year}</span><span className="lab-concept-name"><Icon size={22} />{name}{concept === id ? <Check size={18} /> : <ArrowUpRight size={18} />}</span><span className="lab-concept-note">{note}</span></button>)}</div>
    </header>
    <div className="lab-controls"><div className="lab-scenes" aria-label="Preview a moment"><span className="lab-scenes-label">SET THE SCENE</span>{scenes.map((scene) => <button key={scene.id} aria-pressed={stage === scene.id} onClick={() => showScene(scene.id)}>{scene.id === 'calling' && <PhoneIncoming size={15} />}{scene.label}</button>)}</div><button className="lab-reset" onClick={reset}><RotateCcw size={15} />Reset demo</button></div>
    <section key={resetVersion} id="concept-preview" role="tabpanel" aria-labelledby={`tab-${concept}`} className="lab-preview">
      {concept === 'portal03' ? <Portal2003 {...props} /> : concept === 'blog06' ? <MomBlog {...props} /> : <MomDesktop {...props} />}
    </section>
    <footer className="lab-footer"><span><Sparkles size={16} />A look at what Mom could become.</span><span>Sample data · Simulated calls · No account connections</span></footer>
  </div>;
}
