export type WindowId = 'today' | 'tasks' | 'calls' | 'eyes' | 'logs' | 'settings';
export interface WindowState {
  open: WindowId[];
  active: WindowId | null;
  maximized: boolean;
  messenger: boolean;
}
export type WindowAction =
  | { type: 'open'; id: WindowId }
  | { type: 'taskbar'; id: WindowId }
  | { type: 'minimize'; id: WindowId }
  | { type: 'maximize' }
  | { type: 'messenger' }
  | { type: 'reset' };

export const initialWindows: WindowState = { open: ['today'], active: 'today', maximized: false, messenger: true };

export function windowReducer(state: WindowState, action: WindowAction): WindowState {
  switch (action.type) {
    case 'open': return { ...state, active: action.id, open: state.open.includes(action.id) ? state.open : [...state.open, action.id] };
    case 'taskbar': return state.active === action.id ? { ...state, active: null } : windowReducer(state, { type: 'open', id: action.id });
    case 'minimize': return state.active === action.id ? { ...state, active: null } : state;
    case 'maximize': return { ...state, maximized: !state.maximized };
    case 'messenger': return { ...state, messenger: !state.messenger };
    case 'reset': return { ...initialWindows, open: [...initialWindows.open] };
  }
}
