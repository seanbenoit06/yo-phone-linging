import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, Eraser, Pause, Play, Terminal } from 'lucide-react';
import type { ApiClient } from '../api/types';
import { useLogs } from '../api/logs';
import './log.css';

const knownSources = ['detect', 'text', 'call', 'webcam', 'api', 'main', 'brain'];
function timestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleTimeString('en-GB', { hour12: false }) : '--:--:--';
}

export function MomLog({ api, active, mock }: { api: ApiClient; active: boolean; mock: boolean }) {
  const { lines, loading, error, trimmed, clear } = useLogs(api);
  const [paused, setPaused] = useState(false);
  const [source, setSource] = useState('all');
  const output = useRef<HTMLDivElement>(null);
  const visible = source === 'all' ? lines : lines.filter((line) => line.source === source);
  const sources = [...new Set([...knownSources, ...lines.map((line) => line.source)])];
  useEffect(() => { setSource('all'); setPaused(false); }, [api]);
  useEffect(() => {
    if (active && !paused && output.current) output.current.scrollTop = output.current.scrollHeight;
  }, [active, paused, source, lines]);
  return <div className="fc-log">
    <div className="fc-log-toolbar">
      <label>Source<select aria-label="Filter log source" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All sources</option>{sources.map((item) => <option value={item} key={item}>{item}</option>)}</select></label>
      <button type="button" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <Play size={18} /> : <Pause size={18} />}{paused ? 'Resume scrolling' : 'Pause scrolling'}</button>
      <button type="button" onClick={clear}><Eraser size={18} />Clear view</button>
    </div>
    <div className="fc-log-console" ref={output} tabIndex={0} role="region" aria-label="Live log output" onScroll={(event) => {
      const element = event.currentTarget;
      if (!paused && element.scrollHeight - element.scrollTop - element.clientHeight > 50) setPaused(true);
    }}>
      <div className="fc-log-intro"><Terminal size={23} /><div><strong>MomOS [Accountability Console]</strong><p>{mock ? 'MOCK STREAM · Sample activity, same Mom.' : 'LOCAL STREAM · Messages from Mom’s app.'}</p><p>Watching the watchers. One line at a time.</p></div></div>
      {error && <p className="fc-log-error" role="alert">Connection interrupted: {error} Keeping the last lines; retrying every second.</p>}
      {loading && <p className="fc-log-empty" role="status">Connecting to Mom’s log<span className="fc-log-caret">_</span></p>}
      {!loading && !visible.length && <p className="fc-log-empty">{source === 'all' ? 'The view is clear. New activity will appear here.' : `No ${source} entries in this view.`}<span className="fc-log-caret">_</span></p>}
      <ol aria-label="Log entries">{visible.map((line) => <li key={line.id} data-source={knownSources.includes(line.source) ? line.source : 'other'}><time dateTime={line.at}>{timestamp(line.at)}</time><span className="fc-log-source">[{line.source}]</span><span className="fc-log-message">{line.message}</span></li>)}</ol>
    </div>
    <div className="fc-log-status" role="status"><span><i className={error ? 'is-error' : ''} />{error ? 'Reconnecting' : loading ? 'Connecting' : 'Live · updates every second'}</span><span>{visible.length} lines{trimmed ? ' · newest 1,000 retained' : ''}</span><span><ArrowDownToLine size={16} />{paused ? 'Scroll paused · still receiving' : 'Following newest'}</span></div>
    <p className="fc-log-footnote">Clear view only clears this window. The app’s log is unchanged.</p>
  </div>;
}
