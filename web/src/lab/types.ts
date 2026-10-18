export type ConceptId = 'portal03' | 'blog06' | 'momOS';
export type PreviewStage = 'ready' | 'focused' | 'distracted' | 'calling';

export interface PreviewEntry {
  id: number;
  time: string;
  text: string;
  kind: 'note' | 'message' | 'call';
}

export interface ConceptProps {
  stage: PreviewStage;
  goal: string;
  onGoalChange: (goal: string) => void;
  onStart: (goal?: string) => void;
  onDone: () => void;
  onTrust: () => void;
  onAnswer: () => void;
  events: PreviewEntry[];
  focusedMinutes: number;
  calls: number;
  notice: string;
}
