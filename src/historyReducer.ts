export interface GameState {
  status: 'menu' | 'playing' | 'gameOver';
  score: number;
  coins: number;
  artifacts: number;
  totalCoins: number;
  health: number;
  maxHealth: number;
  level: number;
  distance: number;
}

export interface Upgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

export interface AppState {
  gameState: GameState;
  upgrades: Upgrades;
}

export interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

export type HistoryAction =
  | { type: 'SET_GAME_STATE'; payload: Partial<GameState> | ((prev: GameState) => GameState) }
  | { type: 'SET_UPGRADES'; payload: Partial<Upgrades> | ((prev: Upgrades) => Upgrades) }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'BATCH_COMMIT' }
  | { type: 'LOAD'; payload: HistoryState };

const MAX_HISTORY = 50;

function produce<T>(base: T, recipe: (draft: T) => void): T {
  const draft = JSON.parse(JSON.stringify(base)) as T;
  recipe(draft);
  return draft;
}

export function createInitialHistoryState(initial: AppState): HistoryState {
  return { past: [], present: initial, future: [] };
}

export function historyReducer(state: HistoryState, action: HistoryAction): HistoryState {
  switch (action.type) {
    case 'SET_GAME_STATE': {
      const newPresent = produce(state.present, draft => {
        if (typeof action.payload === 'function') {
          draft.gameState = action.payload(draft.gameState);
        } else {
          Object.assign(draft.gameState, action.payload);
        }
      });
      return { ...state, present: newPresent };
    }

    case 'SET_UPGRADES': {
      const newPresent = produce(state.present, draft => {
        if (typeof action.payload === 'function') {
          draft.upgrades = action.payload(draft.upgrades);
        } else {
          Object.assign(draft.upgrades, action.payload);
        }
      });
      return { ...state, present: newPresent };
    }

    case 'UNDO': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
    }

    case 'BATCH_COMMIT': {
      const newPast = [...state.past, state.present].slice(-MAX_HISTORY);
      return { past: newPast, present: state.present, future: [] };
    }

    case 'LOAD':
      return action.payload;

    default:
      return state;
  }
}