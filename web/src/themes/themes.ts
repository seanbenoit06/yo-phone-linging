import type { Stage } from '../api/types';

export type ThemeId = 'flow' | 'mom' | 'portal';
export interface Theme {
  id: ThemeId;
  name: string;
  description: string;
  greeting: (name: string) => string;
  subtitle: string;
  heroEyebrow: string;
  heroNote: string;
  emptyTimeline: string;
  accent: string;
  accentTranslation: string;
  marquee: string[];
  couplet: boolean;
  badges: boolean;
  moods: Record<Stage, string>;
}

export const themes: Record<ThemeId, Theme> = {
  flow: {
    id: 'flow', name: 'Flow', description: 'A little calm. A little clarity.',
    greeting: (name) => `Welcome back, ${name}.`,
    subtitle: 'A little accountability. A lot of love.',
    heroEyebrow: 'ONE THING AT A TIME', heroNote: 'Big plans start with a small promise.',
    emptyTimeline: 'A fresh start. Your story begins with a session.',
    accent: '', accentTranslation: '', marquee: [], couplet: false, badges: false,
    moods: { idle: 'Peace of mind', watching: 'Quietly cheering you on', distracted: 'A raised eyebrow', texted: 'You saw that text, right?', calling: 'Mom means business', waiting_callback: 'A little faith in you' },
  },
  mom: {
    id: 'mom', name: 'Mom', description: 'Warm kitchen. High expectations.',
    greeting: (name) => `${name}, you ate yet?`,
    subtitle: 'Your dreams are big. Mom packed snacks.',
    heroEyebrow: 'A LITTLE TOUGH LOVE', heroNote: 'Aiyah. One small step, then we eat.',
    emptyTimeline: 'Nothing yet. Even Cousin Kevin had to start somewhere.',
    accent: '媽', accentTranslation: 'Mom knows best', marquee: [], couplet: true, badges: false,
    moods: { idle: 'Soup is still warm', watching: 'Mom is making you soup', distracted: 'Mom has that look', texted: 'Do not make Mom ask twice', calling: 'Mom is sharpening the slipper', waiting_callback: 'Okay, Mom believes you' },
  },
  portal: {
    id: 'portal', name: 'Portal', description: 'Big energy. Zero excuses.',
    greeting: (name) => `${name}, your future is calling!`,
    subtitle: 'Welcome to the #1 destination for getting it together.',
    heroEyebrow: 'TODAY’S MAIN EVENT', heroNote: 'Small promise. Main character energy.',
    emptyTimeline: 'BREAKING: your next great achievement starts here.',
    accent: '熱', accentTranslation: 'HOT', couplet: false, badges: true,
    marquee: ['Drink water. Then do the homework.', 'Cousin Kevin is already studying.', 'Your future self says thank you.', 'One small step. Mom is watching.'],
    moods: { idle: 'All systems: Mom', watching: 'Your biggest fan is online', distracted: 'Suspicious activity detected', texted: 'Mom has entered the chat', calling: 'Slipper threat level: maximum', waiting_callback: 'Redemption arc loading' },
  },
};

export const themeIds: ThemeId[] = ['flow', 'mom', 'portal'];

export const conceptAccents = {
  portal03: { primary: '家有虎媽', secondary: '好好讀書' },
  blog06: { primary: '媽媽的小站', secondary: '今天也要乖乖的' },
  momOS: { primary: '乖', secondary: '媽媽在線' },
};

export function readTheme(): ThemeId {
  try {
    const value = localStorage.getItem('mom-theme');
    return themeIds.includes(value as ThemeId) ? value as ThemeId : 'flow';
  } catch { return 'flow'; }
}
