import { produce } from 'immer';

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

export interface RootState {
  gameState: GameState;
  upgrades: Upgrades;
}

export type GameAction = 
  | { type: 'START_GAME'; payload: { maxHealth: number } }
  | { type: 'GO_TO_MENU' }
  | { type: 'BUY_UPGRADE'; payload: { type: keyof Upgrades; cost: number } }
  | { type: 'SET_GAME_STATE'; payload: GameState | ((prev: GameState) => GameState); ignoreHistory?: boolean }
  | { type: 'SET_UPGRADES'; payload: Upgrades | ((prev: Upgrades) => Upgrades); ignoreHistory?: boolean };

export const initialState: RootState = {
  gameState: {
    status: 'menu',
    score: 0,
    coins: 0,
    artifacts: 0,
    totalCoins: 0,
    health: 100,
    maxHealth: 100,
    level: 1,
    distance: 0,
  },
  upgrades: {
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  }
};

export const gameReducer = produce((draft: RootState, action: GameAction) => {
  switch (action.type) {
    case 'START_GAME':
      draft.gameState.status = 'playing';
      draft.gameState.score = 0;
      // When starting game, coins remains the same as totalCoins, this is how original behaved
      // Original code: coins: gameState.coins, totalCoins: gameState.coins
      // We will just keep it same as what's currently in state
      draft.gameState.artifacts = 0;
      draft.gameState.health = action.payload.maxHealth;
      draft.gameState.maxHealth = action.payload.maxHealth;
      draft.gameState.level = 1;
      draft.gameState.distance = 0;
      break;
    case 'GO_TO_MENU':
      draft.gameState.status = 'menu';
      draft.gameState.coins = draft.gameState.totalCoins;
      break;
    case 'BUY_UPGRADE':
      draft.gameState.coins -= action.payload.cost;
      draft.gameState.totalCoins -= action.payload.cost;
      draft.upgrades[action.payload.type] += 1;
      break;
    case 'SET_GAME_STATE': {
      const updates = typeof action.payload === 'function' ? action.payload(draft.gameState as GameState) : action.payload;
      draft.gameState = updates;
      break;
    }
    case 'SET_UPGRADES': {
      const updates = typeof action.payload === 'function' ? action.payload(draft.upgrades as Upgrades) : action.payload;
      draft.upgrades = updates;
      break;
    }
  }
});

export interface HistoryState {
  past: RootState[];
  present: RootState;
  future: RootState[];
}

export type HistoryAction = 
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'INIT_STATE'; payload: HistoryState }
  | GameAction;

export const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
  if (action.type === 'UNDO') {
    if (state.past.length === 0) return state;
    const previous = state.past[state.past.length - 1];
    const newPast = state.past.slice(0, state.past.length - 1);
    return {
      past: newPast,
      present: previous,
      future: [state.present, ...state.future]
    };
  }
  
  if (action.type === 'REDO') {
    if (state.future.length === 0) return state;
    const next = state.future[0];
    const newFuture = state.future.slice(1);
    return {
      past: [...state.past, state.present],
      present: next,
      future: newFuture
    };
  }

  if (action.type === 'INIT_STATE') {
    return action.payload;
  }
  
  const nextPresent = gameReducer(state.present, action as GameAction);
  
  if (nextPresent === state.present) {
    return state;
  }
  
  const isIgnore = 'ignoreHistory' in action ? action.ignoreHistory : false;
  
  if (isIgnore) {
    return {
      ...state,
      present: nextPresent
    };
  }
  
  return {
    past: [...state.past, state.present].slice(-50),
    present: nextPresent,
    future: []
  };
};
