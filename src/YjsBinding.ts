import { useEffect, useState, useCallback, useRef } from 'react';
import { sharedCoins, sharedUpgrades, awareness } from './YjsSyncProvider';

interface RemoteCursor {
  id: string;
  color: string;
  hoveredUpgrade: string | null;
}

const COLORS = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

type UpgradeKey = string;

export function useYjsSync<T extends Record<UpgradeKey, number>>(
  initialCoins: number,
  initialUpgrades: T
) {
  const [coins, setCoins] = useState(initialCoins);
  const [upgrades, setUpgrades] = useState<T>(initialUpgrades);
  const [cursors, setCursors] = useState<RemoteCursor[]>([]);

  const localUpgradesRef = useRef<T>(initialUpgrades);
  localUpgradesRef.current = upgrades;

  const localCoinsRef = useRef(initialCoins);
  localCoinsRef.current = coins;

  // --- 初始化：新标签页加入时，推/拉共享状态 ---
  useEffect(() => {
    const sharedCoinVal = sharedCoins.get('total');
    if (sharedCoinVal !== undefined) {
      setCoins(sharedCoinVal);
    } else {
      sharedCoins.set('total', initialCoins);
    }

    const keys = Object.keys(initialUpgrades) as (keyof T)[];
    keys.forEach((key) => {
      const k = key as string;
      const localVal = initialUpgrades[key];
      const sharedVal = sharedUpgrades.get(k);
      if (sharedVal !== undefined) {
        const maxVal = Math.max(localVal, sharedVal);
        if (maxVal > localVal) {
          setUpgrades((prev: T) => ({ ...prev, [k]: maxVal }));
        }
        if (maxVal > sharedVal) {
          sharedUpgrades.set(k, maxVal);
        }
      } else {
        sharedUpgrades.set(k, localVal);
      }
    });
  }, [initialCoins, initialUpgrades]);

  // --- 监听远程金币变更 ---
  useEffect(() => {
    const handler = () => {
      const v = sharedCoins.get('total');
      if (v !== undefined && v !== localCoinsRef.current) {
        setCoins(v);
      }
    };
    sharedCoins.observe(handler);
    return () => sharedCoins.unobserve(handler);
  }, []);

  // --- 监听远程技能变更（保留最高等级） ---
  useEffect(() => {
    const handler = () => {
      const next = { ...localUpgradesRef.current };
      let changed = false;
      sharedUpgrades.forEach((remoteLevel: number, key: string) => {
        const localLevel = (next as Record<string, number>)[key] ?? 0;
        const maxVal = Math.max(localLevel, remoteLevel);
        if (maxVal > localLevel) {
          (next as Record<string, number>)[key] = maxVal;
          changed = true;
        }
        if (maxVal > remoteLevel) {
          sharedUpgrades.set(key, maxVal);
        }
      });
      if (changed) {
        setUpgrades(next as T);
      }
    };
    sharedUpgrades.observe(handler);
    return () => sharedUpgrades.unobserve(handler);
  }, []);

  // --- Awareness: 初始化本地光标 ---
  useEffect(() => {
    const localState = awareness.getLocalState();
    if (!localState) {
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      awareness.setLocalState({
        id: Math.random().toString(36).slice(2, 11),
        color,
        hoveredUpgrade: null,
      } as RemoteCursor);
    }
  }, []);

  // --- Awareness: 监听远程光标变化 ---
  useEffect(() => {
    const handler = () => {
      const states = awareness.getStates();
      const remoteList: RemoteCursor[] = [];
      states.forEach((state: RemoteCursor, clientId: number) => {
        if (clientId !== awareness.clientID && state.hoveredUpgrade !== undefined) {
          remoteList.push(state as RemoteCursor);
        }
      });
      setCursors(remoteList);
    };
    handler();
    awareness.on('change', handler);
    return () => awareness.off('change', handler);
  }, []);

  // --- 同步金币（最后操作覆盖） ---
  const syncCoins = useCallback(
    (updater: number | ((prev: number) => number)) => {
      const current = sharedCoins.get('total') ?? coins;
      const next = typeof updater === 'function' ? updater(current) : updater;
      setCoins(next);
      sharedCoins.set('total', next);
    },
    [coins]
  );

  // --- 同步技能（保留最高等级） ---
  const syncUpgrade = useCallback((key: UpgradeKey, level: number) => {
    const currentShared = sharedUpgrades.get(key) ?? 0;
    if (level > currentShared) {
      sharedUpgrades.set(key, level);
      setUpgrades((prev: T) => ({ ...prev, [key]: level }));
    }
  }, []);

  // --- 广播当前正在查看的技能项 ---
  const setHoveredUpgrade = useCallback((key: UpgradeKey | null) => {
    awareness.setLocalStateField('hoveredUpgrade', key);
  }, []);

  return {
    syncedCoins: coins,
    syncedUpgrades: upgrades,
    syncCoins,
    syncUpgrade,
    cursors,
    setHoveredUpgrade,
  };
}