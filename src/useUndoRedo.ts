import { useCallback, useEffect, useReducer } from 'react';
import { createInitialHistoryState, historyReducer, type AppAction, type HistoryState } from './historyReducer';

const STORAGE_KEY = 'dune-ranger-undo-redo-history';

const isValidHistoryState = (value: unknown): value is HistoryState => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<HistoryState>;
  return Array.isArray(candidate.past)
    && Array.isArray(candidate.future)
    && Boolean(candidate.present)
    && typeof candidate.present === 'object'
    && 'gameState' in candidate.present
    && 'upgrades' in candidate.present;
};

const loadHistoryState = () => {
  if (typeof window === 'undefined') {
    return createInitialHistoryState();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return createInitialHistoryState();
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    if (!isValidHistoryState(parsedValue)) {
      return createInitialHistoryState();
    }

    return parsedValue;
  } catch {
    return createInitialHistoryState();
  }
};

export const useUndoRedo = () => {
  const [historyState, dispatch] = useReducer(historyReducer, undefined, loadHistoryState);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(historyState));
  }, [historyState]);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const applyAction = useCallback((action: AppAction) => {
    dispatch(action);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifierPressed = event.ctrlKey || event.metaKey;
      if (!isModifierPressed) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        dispatch({ type: 'UNDO' });
        return;
      }

      if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        dispatch({ type: 'REDO' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  return {
    state: historyState.present,
    canUndo: historyState.past.length > 0,
    canRedo: historyState.future.length > 0,
    undo,
    redo,
    dispatch: applyAction,
  };
};
