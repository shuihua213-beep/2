import { useReducer, useEffect } from 'react';
import { produce } from 'immer';

// 类型定义 (与App.tsx保持一致)
interface GameState {
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

interface Upgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

// 历史记录状态
export interface HistoryState {
  past: { gameState: GameState; upgrades: Upgrades }[];
  present: { gameState: GameState; upgrades: Upgrades };
  future: { gameState: GameState; upgrades: Upgrades }[];
}

// Action 类型
export type HistoryAction =
  | { type: 'UPDATE'; payload: { gameState?: Partial<GameState>; upgrades?: Partial<Upgrades> } }
  | { type: 'REPLACE'; payload: { gameState: GameState; upgrades: Upgrades } }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'LOAD'; payload: HistoryState };

// 初始状态
export const initialState: HistoryState = {
  past: [],
  present: {
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
    },
  },
  future: [],
};

// Reducer
export const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
  return produce(state, (draft) => {
    switch (action.type) {
      case 'UPDATE': {
        // 保存当前状态到 past
        draft.past.push({ ...state.present });
        // 限制最大步数
        if (draft.past.length > 50) {
          draft.past.shift();
        }
        // 清空 future
        draft.future = [];
        // 更新 present
        if (action.payload.gameState) {
          draft.present.gameState = { ...draft.present.gameState, ...action.payload.gameState };
        }
        if (action.payload.upgrades) {
          draft.present.upgrades = { ...draft.present.upgrades, ...action.payload.upgrades };
        }
        break;
      }
      case 'REPLACE': {
        // 保存当前状态到 past
        draft.past.push({ ...state.present });
        // 限制最大步数
        if (draft.past.length > 50) {
          draft.past.shift();
        }
        // 清空 future
        draft.future = [];
        // 完全替换 present
        draft.present = action.payload;
        break;
      }
      case 'UNDO': {
        if (draft.past.length > 0) {
          const previous = draft.past.pop()!;
          draft.future.unshift({ ...state.present });
          draft.present = previous;
        }
        break;
      }
      case 'REDO': {
        if (draft.future.length > 0) {
          const next = draft.future.shift()!;
          draft.past.push({ ...state.present });
          draft.present = next;
        }
        break;
      }
      case 'LOAD': {
        return action.payload;
      }
      default:
        break;
    }
  });
};

// Hook: useHistoryReducer (with localStorage persistence)
export function useHistoryReducer() {
  // 尝试从 localStorage 加载
  const loadFromStorage = (): HistoryState => {
    try {
      const saved = localStorage.getItem('gameHistory');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load history from localStorage:', e);
    }
    return initialState;
  };

  const [state, dispatch] = useReducer(historyReducer, loadFromStorage());

  // 保存到 localStorage
  useEffect(() => {
    try {
      localStorage.setItem('gameHistory', JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save history to localStorage:', e);
    }
  }, [state]);

  return { state, dispatch };
}
