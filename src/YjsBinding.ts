import { useState, useEffect, useCallback, useRef } from 'react';
import { YjsSyncProvider } from './YjsSyncProvider';

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

const initialGameState: GameState = {
  status: 'menu',
  score: 0,
  coins: 0,
  artifacts: 0,
  totalCoins: 0,
  health: 100,
  maxHealth: 100,
  level: 1,
  distance: 0,
};

const initialUpgrades: Upgrades = {
  weaponDamage: 0,
  weaponFireRate: 0,
  camelHealth: 0,
  camelSpeed: 0,
};

export function useYjsBinding() {
  const [provider] = useState(() => YjsSyncProvider.getInstance());
  const [gameState, setGameState] = useState<GameState>(initialGameState);
  const [upgrades, setUpgrades] = useState<Upgrades>(initialUpgrades);
  const [otherUsers, setOtherUsers] = useState<any[]>([]);

  const isLocalUpdateRef = useRef(false);
  const gameStateRef = useRef(gameState);
  const upgradesRef = useRef(upgrades);

  gameStateRef.current = gameState;
  upgradesRef.current = upgrades;

  const setLocalGameState = useCallback((newState: GameState) => {
    isLocalUpdateRef.current = true;
    setGameState(newState);
    
    const { coins, totalCoins } = newState;
    provider.coins.set('current', coins);
    provider.coins.set('total', totalCoins);
  }, [provider]);

  const setLocalUpgrades = useCallback((newUpgrades: Upgrades) => {
    isLocalUpdateRef.current = true;
    setUpgrades(newUpgrades);
    
    Object.entries(newUpgrades).forEach(([key, value]) => {
      const currentValue = provider.upgrades.get(key);
      if (currentValue === undefined || value > currentValue) {
        provider.upgrades.set(key, value);
      }
    });
  }, [provider]);

  const updateGameStateFromYjs = useCallback(() => {
    setGameState(prev => {
      const currentCoins = provider.coins.get('current') ?? prev.coins;
      const totalCoins = provider.coins.get('total') ?? prev.totalCoins;
      
      return {
        ...prev,
        coins: currentCoins,
        totalCoins: totalCoins,
      };
    });

    const newUpgrades = { ...initialUpgrades };
    Object.keys(initialUpgrades).forEach(key => {
      const yValue = provider.upgrades.get(key);
      if (yValue !== undefined) {
        newUpgrades[key as keyof Upgrades] = Math.max(
          newUpgrades[key as keyof Upgrades],
          yValue
        );
      }
    });
    setUpgrades(prev => {
      const merged = { ...prev };
      Object.entries(newUpgrades).forEach(([key, value]) => {
        if (value > prev[key as keyof Upgrades]) {
          merged[key as keyof Upgrades] = value;
        }
      });
      return merged;
    });
  }, [provider]);

  useEffect(() => {
    const handleYjsUpdate = () => {
      if (!isLocalUpdateRef.current) {
        updateGameStateFromYjs();
      }
      isLocalUpdateRef.current = false;
    };

    provider.doc.on('update', handleYjsUpdate);
    provider.upgrades.observe(handleYjsUpdate);
    provider.coins.observe(handleYjsUpdate);

    const handleAwarenessChange = () => {
      setOtherUsers(provider.getOtherUsers());
    };

    provider.awareness.on('change', handleAwarenessChange);

    updateGameStateFromYjs();

    return () => {
      provider.doc.off('update', handleYjsUpdate);
      provider.upgrades.unobserve(handleYjsUpdate);
      provider.coins.unobserve(handleYjsUpdate);
      provider.awareness.off('change', handleAwarenessChange);
    };
  }, [provider, updateGameStateFromYjs]);

  const setCursor = useCallback((upgradeType: string | null) => {
    provider.setCursor(upgradeType);
  }, [provider]);

  return {
    gameState,
    setGameState: setLocalGameState,
    upgrades,
    setUpgrades: setLocalUpgrades,
    otherUsers,
    setCursor,
  };
}
