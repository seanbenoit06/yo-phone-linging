import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ConceptProps } from './types';
import { conceptAccents } from '../themes/themes';
import './MomBlog.css';

function PixelFlower({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 88 112" fill="none" aria-hidden="true" shapeRendering="crispEdges">
      <path d="M40 52H48V112H40Z" fill="#67805D" />
      <path d="M16 74H32V82H40V90H24V82H16ZM48 90H56V82H72V90H64V98H48Z" fill="#819A6C" />
      <path d="M32 0H56V8H64V24H80V32H88V56H80V64H64V80H56V88H32V80H24V64H8V56H0V32H8V24H24V8H32Z" fill="#E9A4BD" />
      <path d="M32 24H56V32H64V56H56V64H32V56H24V32H32Z" fill="#F7DA78" />
      <path d="M32 32H40V40H32ZM48 32H56V40H48ZM40 48H48V56H40Z" fill="#743B58" />
    </svg>
  );
}

function MomPortrait() {
  return (
    <svg viewBox="0 0 160 160" role="img" aria-label="A pixel portrait of Mom with glasses" shapeRendering="crispEdges">
      <path fill="#E8DCF2" d="M0 0H160V160H0Z" />
      <path fill="#D4C3E2" d="M0 0H16V16H0ZM32 0H48V16H32ZM64 0H80V16H64ZM96 0H112V16H96ZM128 0H144V16H128ZM16 16H32V32H16ZM48 16H64V32H48ZM80 16H96V32H80ZM112 16H128V32H112ZM144 16H160V32H144Z" />
      <path fill="#5A3D4B" d="M56 32H104V40H120V56H128V104H120V120H40V104H32V56H40V40H56Z" />
      <path fill="#EDB3A0" d="M48 64H112V104H104V120H56V104H48Z" />
      <path fill="#5A3D4B" d="M48 56H104V64H88V72H72V64H48Z" />
      <path stroke="#5A3D4B" strokeWidth="4" d="M50 76H72V92H50ZM88 76H110V92H88ZM72 80H88" />
      <path fill="#5A3D4B" d="M60 80H64V88H60ZM96 80H100V88H96ZM72 100H88V104H72Z" />
      <path fill="#A95C80" d="M48 120H112V128H128V144H136V160H24V144H32V128H48Z" />
      <path fill="#FFF2D8" d="M64 120H96V128H88V136H72V128H64Z" />
      <path fill="#F3D779" d="M104 48H112V40H120V48H128V56H120V64H112V56H104Z" />
    </svg>
  );
}

const moods = {
  ready: { symbol: '♡', title: 'Feeling hopeful', line: 'The tea is warm. Your future is waiting.' },
  focused: { symbol: '✿', title: 'Quietly proud', line: 'Look at you, actually doing the thing.' },
  distracted: { symbol: '?', title: 'A little suspicious', line: 'That does not look like homework, dear.' },
  calling: { symbol: '!', title: 'Calling her child', line: 'Pick up. Mom has a very small question.' },
};

export function MomBlog(props: ConceptProps) {
  const { stage, goal, onGoalChange, onStart, onDone, onTrust, onAnswer, events, focusedMinutes, calls, notice } = props;
  const diaryRef = useRef<HTMLElement>(null);
  const homeworkRef = useRef<HTMLElement>(null);
  const guestbookRef = useRef<HTMLElement>(null);
  const [guestMessage, setGuestMessage] = useState('');
  const [guestPosts, setGuestPosts] = useState<string[]>([]);
  const [showLetter, setShowLetter] = useState(false);
  const mood = moods[stage];
  const active = stage !== 'ready';
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit' });

  function submitGuestbook(event: FormEvent) {
    event.preventDefault();
    if (!guestMessage.trim()) return;
    setGuestPosts((posts) => [guestMessage.trim(), ...posts]);
    setGuestMessage('');
  }

  return (
    <div className="blog06">
      <div className="blog06-site">
        <div className="blog06-webring"><span>THE MOM.EXE WEBRING</span><span>A little corner of the internet, just for you.</span><span>EST. 2006 ✿</span></div>
        <header className="blog06-cover">
          <div className="blog06-cover-note">HOMEWORK • TEA • TOUGH LOVE</div>
          <PixelFlower className="blog06-flower blog06-flower-left" />
          <div className="blog06-cover-title"><span lang="zh-Hant">{conceptAccents.blog06.primary}</span><h1>Mom’s little corner<span>♡</span></h1><p>Come in, take your shoes off, and finish your homework.</p></div>
          <PixelFlower className="blog06-flower blog06-flower-right" />
          <div className="blog06-cover-stamp">YOU ARE<br /><strong>always</strong><br />WELCOME</div>
        </header>
        <nav className="blog06-nav" aria-label="Blog sections">
          <span>Mom.exe / personal homepage</span>
          <div>
            <button onClick={() => diaryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>01. Diary</button>
            <button onClick={() => homeworkRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>02. Homework</button>
            <button onClick={() => guestbookRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>03. Guestbook</button>
          </div>
        </nav>

        <div className="blog06-columns">
          <aside className="blog06-sidebar" aria-label="About Mom">
            <section className="blog06-profile">
              <h2>About the author</h2>
              <div className="blog06-portrait"><MomPortrait /><span>✿ Mom is online</span></div>
              <h3>Mom, obviously.</h3>
              <p>Professional worrier.<br />Your biggest fan.<br />Knows when you’re scrolling.</p>
              <div className="blog06-profile-tags"><span>tea enthusiast</span><span>no excuses</span></div>
            </section>

            <section className="blog06-mood">
              <h2>Current mood</h2>
              <div className="blog06-mood-face" aria-hidden="true">{mood.symbol}</div>
              <strong>{mood.title}</strong>
              <p>{mood.line}</p>
            </section>

            <section className="blog06-counter">
              <h2>Little victories</h2>
              <div><span>Minutes focused</span><strong>{String(focusedMinutes).padStart(4, '0')}</strong></div>
              <div><span>Calls from Mom</span><strong>{String(calls).padStart(4, '0')}</strong></div>
              <p>Every minute counts, dear.</p>
            </section>

            <div className="blog06-sidebar-note"><span lang="zh-Hant">{conceptAccents.blog06.secondary}</span><p>Be good to yourself today.</p><span aria-hidden="true">✿ — ♡ — ✿</span></div>
          </aside>

          <main className="blog06-journal" ref={diaryRef}>
            <div className="blog06-journal-heading"><h2>The everyday diary</h2><span>small steps, faithfully recorded</span></div>
            <article className={`blog06-post blog06-featured blog06-stage-${stage}`}>
              <div className="blog06-post-meta"><span>PINNED ENTRY</span><span>{date} · written with love</span></div>
              <div className="blog06-post-title"><span className="blog06-paper-star" aria-hidden="true">✶</span><h2>{active ? 'A promise is a promise.' : 'Dear Jay, what’s the plan?'}</h2></div>
              <p className="blog06-intro">{active ? 'One thing at a time. Mom is right here.' : 'You don’t have to do everything. Just tell Mom the next little thing.'}</p>
              {!active ? (
                <form className="blog06-goal-form" onSubmit={(event) => { event.preventDefault(); if (goal.trim()) onStart(); }}>
                  <label htmlFor="blog06-goal">Today, I’m going to…</label>
                  <div><input id="blog06-goal" value={goal} onChange={(event) => onGoalChange(event.target.value)} placeholder="Finish CSE homework until 9 PM" /><button type="submit" disabled={!goal.trim()}>Tell Mom →</button></div>
                  <button type="button" className="blog06-text-button" onClick={() => onGoalChange('Finish my essay until 9 PM')}>Need a start? Try “Finish my essay until 9 PM”</button>
                </form>
              ) : (
                <div className="blog06-active-session">
                  <p className="blog06-current-goal">{goal}</p>
                  <div className="blog06-stage-track" aria-label={`Session status: ${stage}`}><span className={stage === 'focused' ? 'is-current' : ''}>01. Working</span><span>·····</span><span className={stage === 'distracted' ? 'is-current' : ''}>02. A little nudge</span><span>·····</span><span className={stage === 'calling' ? 'is-current' : ''}>03. Mom calls</span></div>
                  {stage === 'calling' && <div className="blog06-incoming"><span>☎ Mom is calling. “Jay, just one question.”</span><button onClick={onAnswer}>Pick up</button></div>}
                  <div className="blog06-session-actions"><button onClick={onTrust}>I’m actually working</button><button onClick={onDone}>Done, Mom! ♡</button></div>
                </div>
              )}
              {notice && <p className="blog06-notice" role="status">✎ {notice}</p>}
              <div className="blog06-post-footer"><span>Filed under: growing up, slowly</span><span>♥ Mom believes in you</span></div>
            </article>

            <section className="blog06-homework" ref={homeworkRef}>
              <div className="blog06-section-title"><h2>On the fridge</h2><span>the homework bulletin</span></div>
              <div className="blog06-homework-row"><span className="blog06-course">MATH 208</span><div><strong>Week 3 Conceptual Problems</strong><span>Due in 2 days · 5 points</span></div><button onClick={() => onStart('MATH 208 Week 3 Conceptual Problems')}>Start with Mom ↗</button></div>
              <div className="blog06-homework-row"><span className="blog06-course blog06-course-pink">INFO 200</span><div><strong>Knowledge Checkpoint Quiz</strong><span>Due tomorrow · 50 points</span></div><button onClick={() => onStart('INFO 200 Knowledge Checkpoint Quiz')}>Start with Mom ↗</button></div>
            </section>

            <section className="blog06-events">
              <div className="blog06-section-title"><h2>Today’s little updates</h2><span>{events.length} diary notes</span></div>
              <div className="blog06-event-list">
                {events.slice(0, 5).map((event) => <div className="blog06-event" key={event.id}><span className="blog06-event-mark" aria-hidden="true">{event.kind === 'call' ? '☎' : event.kind === 'message' ? '✉' : '✿'}</span><span className="blog06-event-time">{event.time}</span><p>{event.text}</p></div>)}
                {events.length === 0 && <p className="blog06-empty">A fresh page. Let’s put something good on it.</p>}
              </div>
            </section>

            <article className="blog06-letter">
              <span className="blog06-letter-label">A NOTE FROM MOM</span>
              <h2>You’re allowed to start small.</h2>
              <p>I know the blank page feels big. Open the file. Write one sentence. Then we’ll see.</p>
              {showLetter && <p>Being proud of you is not something I save for the finish line. I’m proud when you try again, too. Now drink some water. Love, Mom.</p>}
              <button className="blog06-text-button" aria-expanded={showLetter} onClick={() => setShowLetter(!showLetter)}>{showLetter ? 'Fold the letter ↑' : 'Open the rest of her letter ↓'}</button>
            </article>

            <section className="blog06-guestbook" ref={guestbookRef}>
              <div className="blog06-section-title"><h2>Leave Mom a little note</h2><span>the guestbook</span></div>
              <form onSubmit={submitGuestbook}><label className="blog06-visually-hidden" htmlFor="blog06-guest-message">Your guestbook note</label><input id="blog06-guest-message" value={guestMessage} onChange={(event) => setGuestMessage(event.target.value)} maxLength={240} placeholder="Thanks for checking on me, Mom…" /><button type="submit" disabled={!guestMessage.trim()}>Sign guestbook ♡</button></form>
              <p className="blog06-guestbook-caption">Preview guestbook · notes stay in this page until you leave.</p>
              {guestPosts.map((post, index) => <div className="blog06-guest-post" key={`${index}-${post}`}><strong>Jay wrote:</strong><p>{post}</p><span>Mom says: I read it. Love you too. ♡</span></div>)}
            </section>
            <footer className="blog06-footer">Made with love, a little nagging, and too much tea. <span>♡ Mom.exe</span></footer>
          </main>
        </div>
      </div>
    </div>
  );
}
