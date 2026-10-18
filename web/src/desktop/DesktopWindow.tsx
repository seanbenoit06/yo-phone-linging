import { Minus, Square } from 'lucide-react';
import type { ReactNode } from 'react';

interface DesktopWindowProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  hidden?: boolean;
  active?: boolean;
  maximized?: boolean;
  onMinimize?: () => void;
  onMaximize?: () => void;
  className?: string;
}

export function DesktopWindow({ title, icon, children, footer, hidden, active = false, maximized, onMinimize, onMaximize, className = '' }: DesktopWindowProps) {
  return <section className={`fc-window ${active ? 'fc-window-active' : ''} ${className}`} hidden={hidden} aria-label={title}>
    <header className="fc-titlebar">
      <div className="fc-window-title">{icon}<h2>{title}</h2></div>
      <div className="fc-window-controls">
        {onMinimize && <button type="button" aria-label={`Minimize ${title}`} onClick={onMinimize}><Minus size={17} /></button>}
        {onMaximize && <button type="button" aria-label={`${maximized ? 'Restore' : 'Maximize'} ${title}`} aria-pressed={maximized} onClick={onMaximize}><Square size={14} /></button>}
      </div>
    </header>
    <div className="fc-window-body">{children}</div>
    {footer && <footer className="fc-window-footer">{footer}</footer>}
  </section>;
}
