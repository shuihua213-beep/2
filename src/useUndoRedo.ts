import { useReducer, useCallback, useRef, useEffect } from 'react';
import {
  AppState,
  HistoryState,
  HistoryAction,
  historyReducer,
  createInitialHistoryState,
  GameState,
  Upgrades,
} from './historyReducer';

const STORAGE_KEY = 'sand-ranger-undo-history';

function loadHistory(defaultInitial: AppState): HistoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HistoryState;
      if (
        parsed &&
        parsed.present &&
        parsed.present.gameState &&
        parsed.present.upgrades &&
        Array.isArray(parsed.past) &&
        Array.isArray(parsed.future)
      ) {
        return parsed;
      }
    }
  } catch {
    // corrupted data, fall through
  }
  return createInitialHistoryState(defaultInitial);
}

function saveHistory(state: HistoryState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage full or unavailable
  }
}

export function useUndoRedo(initial: AppState) {
  const [historyState, baseDispatch] = useReducer(
    historyReducer,
    initial,
    (init: AppState) => loadHistory(init),
  );

  const batchDepthRef = useRef(0);
  const historyRef = useRef(historyState);
  historyRef.current = historyState;

  const dispatch = useCallback((action: HistoryAction) => {
    baseDispatch(action);
    if (
      batchDepthRef.current === 0 &&
      (action.type === 'SET_GAME_STATE' || action.type === 'SET_UPGRADES')
    ) {
      baseDispatch({ type: 'BATCH_COMMIT' });
    }
  }, []);

  const batch = useCallback((fn: () => void) => {
    batchDepthRef.current++;
    try {
      fn();
    } finally {
      batchDepthRef.current--;
      if (batchDepthRef.current === 0) {
        baseDispatch({ type: 'BATCH_COMMIT' });
      }
    }
  }, []);

  const setGameState = useCallback(
    (payload: Partial<GameState> | ((prev: GameState) => GameState)) => {
      dispatch({ type: 'SET_GAME_STATE', payload });
    },
    [dispatch],
  );

  const setUpgrades = useCallback(
    (payload: Partial<Upgrades> | ((prev: Upgrades) => Upgrades)) => {
      dispatch({ type: 'SET_UPGRADES', payload });
    },
    [dispatch],
  );

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, [dispatch]);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, [dispatch]);

  useEffect(() => {
    saveHistory(historyState);
  }, [historyState]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return {
    gameState: historyState.present.gameState,
    upgrades: historyState.present.upgrades,
    setGameState,
    setUpgrades,
    undo,
    redo,
    canUndo: historyState.past.length > 0,
    canRedo: historyState.future.length > 0,
    batch,
    pastCount: historyState.past.length,
    futureCount: historyState.future.length,
  };
}