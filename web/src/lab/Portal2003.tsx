import { useState } from 'react';
import { conceptAccents } from '../themes/themes';
import type { ConceptProps } from './types';
import './Portal2003.css';

const headlines = [
  { course: 'MATH 208', title: 'Week 3 Conceptual Problems', due: 'Due in 2 days', tag: '5 points' },
  { course: 'INFO 200', title: 'Knowledge Checkpoint Quiz', due: 'Tomorrow, 3 PM', tag: '50 points' },
  { course: 'PSYCH 210', title: 'Week 3 Writing Assignment', due: 'Tomorrow, 11:59 PM', tag: '10 points' },
];

const statusCopy = {
  ready: { label: 'AWAITING YOUR PROMISE', message: 'Your future called. Mom picked up.', detail: 'Choose a task. Make a promise. Mom takes it from here.' },
  focused: { label: 'GOOD KID MODE', message: 'Quiet house. Serious progress.', detail: 'You are on task. Mom is watching, with love.' },
  distracted: { label: 'MOM HAS QUESTIONS', message: 'One more video? Think again.', detail: 'TikTok is open. Your homework is getting lonely.' },
  calling: { label: 'INCOMING: MOM', message: 'You better pick up.', detail: 'She just wants to talk about your five-minute break.' },
};

function MomPortrait() {
  return (
    <svg viewBox="0 0 120 112" aria-hidden="true" className="portal03-portrait" shapeRendering="crispEdges">
      <path fill="#fff0ab" d="M0 0h120v112H0z" />
      <path fill="#f3d77b" d="M0 8h120v2H0zm0 16h120v2H0zm0 16h120v2H0zm0 16h120v2H0zm0 16h120v2H0zm0 16h120v2H0zm0 16h120v2H0z" />
      <path fill="#27344d" d="M40 12h40v6h12v12h6v48H22V30h6V18h12z" />
      <path fill="#efba91" d="M34 36h52v38H34zM46 74h28v16H46z" />
      <path fill="#ffd6b1" d="M40 30h40v42H40z" />
      <path fill="#27344d" d="M34 24h52v12H60v6H34zm10 24h8v4h-8zm24 0h8v4h-8z" />
      <path fill="#e78d79" d="M40 57h10v5H40zm30 0h10v5H70z" />
      <path fill="#963a39" d="M55 65h10v3H55z" />
      <path fill="#c54034" d="M34 83h14v6h24v-6h14v6h12v23H22V89h12z" />
      <path fill="#f5e9bc" d="M53 89h14v23H53z" />
      <path fill="#fff8de" d="M49 83h8v9h-8zm14 0h8v9h-8z" />
      <path fill="#164d38" d="M89 44h9v9h-4v21h4v9h-9v-6h-6V50h6z" />
      <path fill="#ffd6b1" d="M92 66h10v13H92z" />
      <path fill="#d14537" d="M7 12h4v12H7zm-4 4h12v4H3zm104 70h4v12h-4zm-4 4h12v4h-12z" />
    </svg>
  );
}

export function Portal2003(props: ConceptProps) {
  const [selectedTask, setSelectedTask] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const [confirmDone, setConfirmDone] = useState(false);
  const [deskTab, setDeskTab] = useState<'headlines' | 'study'>('headlines');
  const status = statusCopy[props.stage];
  const active = props.stage !== 'ready';
  const recentEvents = [...props.events].sort((a, b) => b.id - a.id).slice(0, 5);

  function finishSession() {
    props.onDone();
    setConfirmDone(false);
  }

  return (
    <div className={`portal03 portal03-${props.stage}`}>
      <div className="portal03-page">
        <div className="portal03-utility">
          <span><span className="portal03-online-dot" /> THE FAMILY INTERNET STARTS HERE</span>
          <div><a href="#portal03-homework">Homework directory</a><span>|</span><button type="button" onClick={() => setShowRules(!showRules)}>House rules</button><span>|</span><span>Local edition</span></div>
        </div>

        <header className="portal03-masthead">
          <a href="#portal03-front" className="portal03-brand" aria-label="Mom.exe front page">Mom<span>.exe</span><b>!</b><small>THE HOME PAGE THAT KNOWS YOU.</small></a>
          <div className="portal03-masthead-accent"><strong lang="zh-Hant">{conceptAccents.portal03.primary}</strong><span>Big love. Very little patience.</span></div>
          <div className="portal03-welcome"><span>WELCOME BACK,</span><strong>Jay.</strong><span>Your mom is <b>online.</b></span></div>
        </header>

        <nav className="portal03-nav" aria-label="Portal navigation">
          <a className="portal03-nav-selected" href="#portal03-front">Front page</a>
          <a href="#portal03-homework">Homework <span>NEW</span></a>
          <a href="#portal03-news">Family news</a>
          <a href="#portal03-line">Mom's line</a>
          <button type="button" onClick={() => setShowRules(!showRules)} aria-expanded={showRules}>House rules</button>
          <strong>100% MOM APPROVED*</strong>
        </nav>

        <div className="portal03-ticker"><b>BREAKING</b><span>Cousin Kevin has already finished his homework.</span><span className="portal03-ticker-last">You still have time to catch up. →</span></div>
        {showRules && <aside className="portal03-rules"><strong>THE HOUSE RULES</strong><p>One task at a time. Tell Mom when you start. A break is a break, not a new lifestyle. If Mom gets it wrong, tell her you are working.</p><button type="button" onClick={() => setShowRules(false)}>Got it, Mom ×</button></aside>}

        <main className="portal03-grid" id="portal03-front">
          <aside className="portal03-left">
            <section className="portal03-module">
              <h2 className="portal03-module-title">Your daily directory <span>▼</span></h2>
              <div className="portal03-directory">
                <a href="#portal03-homework"><b>01</b><span>Homework central<small>The things you promised.</small></span><i>›</i></a>
                <a href="#portal03-session"><b>02</b><span>Study room<small>Put your brain to work.</small></span><i>›</i></a>
                <a href="#portal03-news"><b>03</b><span>Family bulletin<small>Mom keeps the receipts.</small></span><i>›</i></a>
                <a href="#portal03-line"><b>04</b><span>Call history<small>She said what she said.</small></span><i>›</i></a>
              </div>
            </section>

            <section className="portal03-note">
              <div className="portal03-note-pin" />
              <span>A NOTE FROM MOM</span>
              <p>Eat something.<br />Drink water.<br /><em>Then do the work.</em></p>
              <strong lang="zh-Hant">{conceptAccents.portal03.secondary}</strong>
              <small>Study hard. I believe in you.</small>
            </section>

            <section className="portal03-module portal03-quick">
              <h2 className="portal03-module-title">Popular destinations</h2>
              <button type="button" onClick={() => { props.onGoalChange('Finish the essay by 11 PM'); document.getElementById('portal03-goal')?.focus(); }}><span>↗</span> Finish that essay</button>
              <button type="button" onClick={() => { props.onGoalChange('Study for the midterm until 10'); document.getElementById('portal03-goal')?.focus(); }}><span>↗</span> Survive the midterm</button>
              <button type="button" onClick={() => { props.onGoalChange('CSE homework until 9 PM'); document.getElementById('portal03-goal')?.focus(); }}><span>↗</span> Open the homework</button>
              <p>All roads lead to getting it done.</p>
            </section>
          </aside>

          <div className="portal03-center">
            <section className="portal03-lead" id="portal03-session">
              <div className="portal03-lead-kicker"><span>THE DAILY MOM</span><span>VOL. 01 / FAMILY EDITION</span></div>
              <div className="portal03-lead-title">Less scrolling.<br /><em>More doing.</em></div>
              <p className="portal03-lead-subtitle">Your personal accountability department.<br />Open 24/7. Absolutely no refunds.</p>
              <form className="portal03-search" onSubmit={(event) => { event.preventDefault(); if (props.goal.trim()) props.onStart(); }}>
                <label htmlFor="portal03-goal">What are we working on today?</label>
                <div><input id="portal03-goal" value={props.goal} onChange={(event) => props.onGoalChange(event.target.value)} placeholder="CSE homework until 9 PM" /><button type="submit" disabled={!props.goal.trim()}>Tell Mom <span>→</span></button></div>
                <span className="portal03-search-hint">Powered by love. Backed by consequences.</span>
              </form>
            </section>

            <section className={`portal03-session portal03-session-${props.stage}`} aria-live="polite">
              <div className="portal03-session-status"><span className="portal03-status-light" /><strong>{status.label}</strong><span>LIVE</span></div>
              <h2>{status.message}</h2>
              <p>{status.detail}</p>
              {active && <p className="portal03-current-goal"><b>CURRENT MISSION</b> {props.goal}</p>}
              <div className="portal03-session-actions">
                {props.stage === 'calling' && <button type="button" className="portal03-answer" onClick={props.onAnswer}>☎ Answer Mom</button>}
                {active && <button type="button" onClick={props.onTrust}>I'm actually working</button>}
                {active && !confirmDone && <button type="button" onClick={() => setConfirmDone(true)}>Done for now</button>}
                {active && confirmDone && <div className="portal03-confirm"><span>End this session?</span><button type="button" onClick={finishSession}>Yes, done</button><button type="button" onClick={() => setConfirmDone(false)}>Keep going</button></div>}
              </div>
              {props.notice && <p className="portal03-notice" role="status" aria-live="polite">↳ {props.notice}</p>}
            </section>

            <section className="portal03-module portal03-homework" id="portal03-homework">
              <div className="portal03-module-tabs" role="tablist" aria-label="Homework desk" onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
                event.preventDefault();
                const nextTab = event.key === 'Home' ? 'headlines' : event.key === 'End' ? 'study' : deskTab === 'headlines' ? 'study' : 'headlines';
                setDeskTab(nextTab);
                document.getElementById(`portal03-${nextTab}-tab`)?.focus();
              }}>
                <button type="button" id="portal03-headlines-tab" role="tab" tabIndex={deskTab === 'headlines' ? 0 : -1} aria-selected={deskTab === 'headlines'} aria-controls="portal03-desk-panel" onClick={() => setDeskTab('headlines')}>Homework headlines</button>
                <button type="button" id="portal03-study-tab" role="tab" tabIndex={deskTab === 'study' ? 0 : -1} aria-selected={deskTab === 'study'} aria-controls="portal03-desk-panel" onClick={() => setDeskTab('study')}>Study tips</button>
              </div>
              <div id="portal03-desk-panel" role="tabpanel" aria-labelledby={`portal03-${deskTab === 'headlines' ? 'headlines' : 'study'}-tab`}>
                {deskTab === 'headlines' ? <>
                  <div className="portal03-desk-meta"><span>CANVAS DIRECTORY</span><span>3 featured assignments</span></div>
                  {headlines.map((task, index) => <article className="portal03-task" key={task.title}>
                    <div className="portal03-task-meta"><span>{task.course}</span><span>{task.due}</span></div>
                    <button className="portal03-task-title" type="button" aria-expanded={selectedTask === index} onClick={() => setSelectedTask(selectedTask === index ? null : index)}><span>›</span>{task.title}</button>
                    {selectedTask === index && <div className="portal03-task-detail"><p>{task.tag} · Start small: open the assignment and read the first question.</p><button type="button" onClick={() => props.onStart(`${task.course} ${task.title}`)}>Start with Mom →</button></div>}
                  </article>)}
                </> : <div className="portal03-study-tips"><b>MOM'S EXTREMELY ADVANCED METHOD</b><ol><li>Open the file.</li><li>Read one question.</li><li>Do five minutes. Just five.</li></ol><p>You do not need to feel ready. You just need to begin.</p></div>}
              </div>
            </section>

            <section className="portal03-module portal03-news" id="portal03-news">
              <h2 className="portal03-module-title">Family bulletin <span>TODAY</span></h2>
              {recentEvents.length ? recentEvents.map((event) => <div key={event.id} className="portal03-news-row"><time>{event.time}</time><span className={`portal03-event-icon portal03-event-${event.kind}`}>{event.kind === 'call' ? '☎' : event.kind === 'message' ? '✉' : '›'}</span><p>{event.text}</p></div>) : <div className="portal03-news-empty">The house is quiet. Start a task to make some news.</div>}
            </section>
          </div>

          <aside className="portal03-right">
            <section className="portal03-module portal03-mom-line" id="portal03-line">
              <h2 className="portal03-module-title">Mom's direct line <span>☎</span></h2>
              <div className="portal03-portrait-wrap"><MomPortrait /><span className="portal03-online-badge"><i /> ONLINE</span></div>
              <strong className="portal03-mom-caption">Always here.<br />Slightly suspicious.</strong>
              <div className="portal03-mood"><span>PATIENCE LEVEL</span><div><i style={{ width: props.stage === 'calling' ? '12%' : props.stage === 'distracted' ? '37%' : '84%' }} /></div><b>{props.stage === 'calling' ? 'We need to talk.' : props.stage === 'distracted' ? 'Do not test her.' : 'So far, so good.'}</b></div>
              <button className="portal03-transcript-button" type="button" onClick={() => setShowTranscript(!showTranscript)} aria-expanded={showTranscript}>{showTranscript ? 'Close' : 'Read'} sample conversation <span>{showTranscript ? '−' : '+'}</span></button>
              {showTranscript && <div className="portal03-transcript"><p><b>MOM:</b> What are you stuck on?</p><p><b>YOU:</b> I don't know how to start.</p><p><b>MOM:</b> Just open your laptop and find the file. That's all. Promise?</p><p><b>YOU:</b> Okay.</p></div>}
            </section>

            <section className="portal03-scoreboard">
              <h2>TODAY'S REPORT CARD</h2>
              <div className="portal03-score"><strong>{String(props.focusedMinutes).padStart(2, '0')}</strong><span>MINUTES<br />OF FOCUS</span></div>
              <div className="portal03-calls"><span>Calls from Mom</span><b>{String(props.calls).padStart(2, '0')}</b></div>
              <div className="portal03-score-note">Every minute counts.<br />Yes, she is counting.</div>
            </section>

            <section className="portal03-ad"><span>PUBLIC SERVICE ANNOUNCEMENT</span><strong>YOUR FUTURE<br />SELF SAYS<br /><em>THANK YOU.</em></strong><p>Today's effort.<br />Tomorrow's freedom.</p><a href="#portal03-session">Make yourself proud ↗</a></section>
          </aside>
        </main>

        <footer className="portal03-footer"><strong>Mom.exe <span>© Family Internet</span></strong><span>Built with love. Supervised with intensity.</span><span className="portal03-footer-stamp">BEST VIEWED WHILE DOING YOUR HOMEWORK</span></footer>
      </div>
    </div>
  );
}
