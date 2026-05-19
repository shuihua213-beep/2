import { useEffect, useState, useCallback, useRef } from 'react';
import { sharedCoins, sharedUpgrades, awareness } from './YjsSyncProvider';
import * as Y from 'yjs';

export function useYjsSync<T extends Record<string, number>>(initialCoins: number, initialUpgrades: T) {
  const [coins, setCoins] = useState<number>(initialCoins);
  const [upgrades, setUpgrades] = useState<T>(initialUpgrades);
  const [activeUsers, setActiveUsers] = useState<Map<number, any>>(new Map());

  // 为了在事件处理中获取最新的 upgrades
  const upgradesRef = useRef(initialUpgrades);
  upgradesRef.current = upgrades;

  useEffect(() => {
    // 金币同步（最后操作覆盖）
    const handleCoinsChange = () => {
      const remoteCoins = sharedCoins.get('total');
      if (remoteCoins !== undefined) {
        setCoins(remoteCoins);
      }
    };

    // 技能同步（保留最高等级）
    const handleUpgradesChange = () => {
      const newUpgrades = { ...upgradesRef.current };
      let changed = false;
      
      sharedUpgrades.forEach((level: number, key: string) => {
        const localLevel = newUpgrades[key] || 0;
        if (level > localLevel) {
          newUpgrades[key] = level;
          changed = true;
        } else if (level < localLevel) {
          // 远程级别比本地低，纠正为最高级别
          sharedUpgrades.set(key, localLevel);
        }
      });
      
      if (changed) {
        setUpgrades(newUpgrades);
      }
    };

    // 初始状态拉取或推送
    if (sharedCoins.get('total') === undefined) {
      sharedCoins.set('total', initialCoins);
    } else {
      handleCoinsChange();
    }
    
    Object.keys(initialUpgrades).forEach(key => {
      const remoteLevel = sharedUpgrades.get(key) || 0;
      const localLevel = initialUpgrades[key] || 0;
      if (localLevel > remoteLevel) {
        sharedUpgrades.set(key, localLevel);
      } else if (remoteLevel > localLevel) {
        setUpgrades((prev: T) => ({ ...prev, [key]: remoteLevel }));
      }
    });

    sharedCoins.observe(handleCoinsChange);
    sharedUpgrades.observe(handleUpgradesChange);

    return () => {
      sharedCoins.unobserve(handleCoinsChange);
      sharedUpgrades.unobserve(handleUpgradesChange);
    };
  }, [initialCoins, initialUpgrades]);

  // 光标/Awareness 同步
  useEffect(() => {
    const handleAwarenessChange = () => {
      setActiveUsers(new Map(awareness.getStates()));
    };
    
    // 初始化颜色和ID
    if (!awareness.getLocalState()?.color) {
      const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
      const randomColor = colors[Math.floor(Math.random() * colors.length)];
      const randomId = Math.random().toString(36).substr(2, 9);
      awareness.setLocalState({ color: randomColor, id: randomId, hoveredUpgrade: null });
    }
    
    handleAwarenessChange();
    awareness.on('change', handleAwarenessChange);
    return () => awareness.off('change', handleAwarenessChange);
  }, []);

  const syncCoins = useCallback((updater: number | ((prev: number) => number)) => {
    const currentShared = sharedCoins.get('total') || 0;
    const newCoins = typeof updater === 'function' ? updater(currentShared) : updater;
    setCoins(newCoins);
    sharedCoins.set('total', newCoins);
  }, []);

  const syncUpgrade = useCallback((key: string, level: number) => {
    const currentShared = sharedUpgrades.get(key) || 0;
    if (level > currentShared) {
      sharedUpgrades.set(key, level);
      setUpgrades((prev: T) => ({ ...prev, [key]: level }));
    }
  }, []);

  const setHoveredUpgrade = useCallback((upgradeKey: string | null) => {
    awareness.setLocalStateField('hoveredUpgrade', upgradeKey);
  }, []);

  return {
    syncedCoins: coins,
    syncedUpgrades: upgrades,
    syncCoins,
    syncUpgrade,
    activeUsers,
    setHoveredUpgrade
  };
}
