import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import {
  INITIAL_SHARED_UPGRADES,
  INITIAL_SHARED_WALLET,
  type SharedUpgrades,
  type SharedWallet,
  type UpgradeKey,
  useYjsBinding,
} from './YjsBinding';

const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const PLAYER_X = 120;
const GROUND_Y = 380;

interface Enemy {
  id: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  type: 'horse' | 'motorcycle';
  speed: number;
  damage: number;
}

interface Collectible {
  id: number;
  x: number;
  y: number;
  type: 'coin' | 'artifact' | 'shield' | 'rapidFire' | 'magnet';
}

interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

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

type Upgrades = SharedUpgrades;

const UPGRADE_COSTS: Record<UpgradeKey, number[]> = {
  weaponDamage: [100, 250, 500, 1000, 2000],
  weaponFireRate: [150, 300, 600, 1200, 2500],
  camelHealth: [200, 400, 800, 1600, 3200],
  camelSpeed: [100, 200, 400, 800, 1600],
};

const UPGRADE_NAMES: Record<UpgradeKey, string> = {
  weaponDamage: '🔫 武器伤害',
  weaponFireRate: '⚡ 射击速度',
  camelHealth: '❤️ 生命上限',
  camelSpeed: '🐪 移动速度',
};

const INITIAL_GAME_STATE: GameState = {
  status: 'menu',
  score: 0,
  coins: INITIAL_SHARED_WALLET.coins,
  artifacts: 0,
  totalCoins: INITIAL_SHARED_WALLET.totalCoins,
  health: 100,
  maxHealth: 100,
  level: 1,
  distance: 0,
};

export default function App() {
  const gameRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const lastShotRef = useRef(0);
  const idCounterRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const collectibleTimerRef = useRef(0);
  const rewardedEnemyIdsRef = useRef(new Set<number>());
  const collectedCollectibleIdsRef = useRef(new Set<number>());

  const {
    sharedWallet,
    sharedUpgrades,
    remotePlayers,
    connectionStatus,
    publishWallet,
    publishUpgrade,
    setActiveUpgrade,
  } = useYjsBinding();

  const [gameState, setGameState] = useState<GameState>(INITIAL_GAME_STATE);
  const [upgrades, setUpgrades] = useState<Upgrades>(INITIAL_SHARED_UPGRADES);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [camelFrame, setCamelFrame] = useState(0);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);

  const gameStateRef = useRef(gameState);
  const upgradesRef = useRef(upgrades);
  const walletRef = useRef<SharedWallet>(sharedWallet);

  gameStateRef.current = gameState;

  const getDamage = () => 25 + upgrades.weaponDamage * 15;
  const getFireRate = () => 400 - upgrades.weaponFireRate * 60;
  const getMaxHealth = () => 100 + upgrades.camelHealth * 25;
  const getSpeed = () => 2 + upgrades.camelSpeed * 0.5;

  const connectionLabel = useMemo(() => {
    if (connectionStatus === 'connected') {
      return '已连接';
    }

    if (connectionStatus === 'disconnected') {
      return '已断开';
    }

    return '连接中';
  }, [connectionStatus]);

  const createParticles = useCallback((x: number, y: number, color: string, count: number) => {
    const newParticles: Particle[] = [];

    for (let index = 0; index < count; index += 1) {
      newParticles.push({
        id: idCounterRef.current += 1,
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        life: 30,
        color,
      });
    }

    setParticles((previous) => [...previous, ...newParticles]);
  }, []);

  const clearTransientState = useCallback(() => {
    setEnemies([]);
    setCollectibles([]);
    setBullets([]);
    setParticles([]);
    rewardedEnemyIdsRef.current.clear();
    collectedCollectibleIdsRef.current.clear();
    spawnTimerRef.current = 0;
    collectibleTimerRef.current = 0;
  }, []);

  const replaceWallet = useCallback((nextWallet: SharedWallet) => {
    walletRef.current = nextWallet;
    publishWallet(nextWallet);
    setGameState((previous) => ({
      ...previous,
      coins: nextWallet.coins,
      totalCoins: nextWallet.totalCoins,
    }));
  }, [publishWallet]);

  const mutateWallet = useCallback((updater: (wallet: SharedWallet) => SharedWallet) => {
    const nextWallet = updater(walletRef.current);
    replaceWallet(nextWallet);
    return nextWallet;
  }, [replaceWallet]);

  const awardEnemyRewards = useCallback((enemy: Enemy) => {
    if (rewardedEnemyIdsRef.current.has(enemy.id)) {
      return;
    }

    rewardedEnemyIdsRef.current.add(enemy.id);

    const scoreReward = enemy.type === 'motorcycle' ? 50 : 30;
    const coinReward = enemy.type === 'motorcycle' ? 15 : 10;

    mutateWallet((wallet) => ({
      coins: wallet.coins + coinReward,
      totalCoins: wallet.totalCoins + coinReward,
    }));

    setGameState((previous) => ({
      ...previous,
      score: previous.score + scoreReward,
    }));

    createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
  }, [createParticles, mutateWallet]);

  const collectItem = useCallback((collectible: Collectible) => {
    if (collectedCollectibleIdsRef.current.has(collectible.id)) {
      return;
    }

    collectedCollectibleIdsRef.current.add(collectible.id);
    createParticles(collectible.x, collectible.y, collectible.type === 'coin' ? '#FFD700' : '#9333EA', 8);

    if (collectible.type === 'coin') {
      mutateWallet((wallet) => ({
        coins: wallet.coins + 5,
        totalCoins: wallet.totalCoins + 5,
      }));
      setGameState((previous) => ({
        ...previous,
        score: previous.score + 5,
      }));
      return;
    }

    if (collectible.type === 'artifact') {
      setGameState((previous) => ({
        ...previous,
        artifacts: previous.artifacts + 1,
        score: previous.score + 100,
      }));
      return;
    }

    if (collectible.type === 'shield') {
      setGameState((previous) => ({
        ...previous,
        health: Math.min(previous.maxHealth, previous.health + 30),
      }));
      return;
    }

    setGameState((previous) => ({
      ...previous,
      score: previous.score + 50,
    }));
  }, [createParticles, mutateWallet]);

  const spawnEnemy = useCallback(() => {
    const type = Math.random() > 0.6 ? 'motorcycle' : 'horse';
    const level = gameStateRef.current.level;
    const baseHealth = type === 'motorcycle' ? 60 : 40;
    const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
    const baseDamage = type === 'motorcycle' ? 20 : 15;

    const newEnemy: Enemy = {
      id: idCounterRef.current += 1,
      x: GAME_WIDTH + 50,
      y: GROUND_Y - 20 - Math.random() * 40,
      health: baseHealth + level * 10,
      maxHealth: baseHealth + level * 10,
      type,
      speed: baseSpeed + level * 0.3,
      damage: baseDamage + level * 3,
    };

    setEnemies((previous) => [...previous, newEnemy]);
  }, []);

  const spawnCollectible = useCallback(() => {
    const randomValue = Math.random();
    let type: Collectible['type'];

    if (randomValue < 0.7) {
      type = 'coin';
    } else if (randomValue < 0.85) {
      type = 'artifact';
    } else if (randomValue < 0.9) {
      type = 'shield';
    } else if (randomValue < 0.95) {
      type = 'rapidFire';
    } else {
      type = 'magnet';
    }

    const newCollectible: Collectible = {
      id: idCounterRef.current += 1,
      x: GAME_WIDTH + 30,
      y: GROUND_Y - 60 - Math.random() * 100,
      type,
    };

    setCollectibles((previous) => [...previous, newCollectible]);
  }, []);

  const shoot = useCallback((targetX: number, targetY: number) => {
    const now = Date.now();
    if (now - lastShotRef.current < getFireRate()) {
      return;
    }

    if (gameStateRef.current.status !== 'playing') {
      return;
    }

    lastShotRef.current = now;

    const startX = PLAYER_X + 60;
    const startY = GROUND_Y - 80;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;
    const speed = 15;

    const newBullet: Bullet = {
      id: idCounterRef.current += 1,
      x: startX,
      y: startY,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
    };

    setBullets((previous) => [...previous, newBullet]);
  }, [upgrades.weaponFireRate]);

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    shoot(x, y);
  };

  const handleTouch = (event: TouchEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') {
      return;
    }

    event.preventDefault();

    const rect = event.currentTarget.getBoundingClientRect();
    const touch = event.touches[0];
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    shoot(x, y);
  };

  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current.status !== 'playing') {
      return;
    }

    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;
    const speed = getSpeed();

    setBackgroundOffset((previous) => (previous + speed) % 600);
    setCamelFrame((previous) => (previous + 0.15) % 4);

    setGameState((previous) => {
      const newDistance = previous.distance + speed * 0.1;
      const newLevel = Math.min(5, Math.floor(newDistance / 500) + 1);

      return {
        ...previous,
        distance: newDistance,
        level: newLevel,
      };
    });

    spawnTimerRef.current += deltaTime;
    if (spawnTimerRef.current > Math.max(1500 - gameStateRef.current.level * 200, 600)) {
      spawnEnemy();
      spawnTimerRef.current = 0;
    }

    collectibleTimerRef.current += deltaTime;
    if (collectibleTimerRef.current > 1200) {
      spawnCollectible();
      collectibleTimerRef.current = 0;
    }

    setBullets((previous) => previous
      .map((bullet) => ({
        ...bullet,
        x: bullet.x + bullet.vx,
        y: bullet.y + bullet.vy,
      }))
      .filter((bullet) => bullet.x < GAME_WIDTH + 50 && bullet.x > -50 && bullet.y > -50 && bullet.y < GAME_HEIGHT + 50));

    setParticles((previous) => previous
      .map((particle) => ({
        ...particle,
        x: particle.x + particle.vx,
        y: particle.y + particle.vy,
        vy: particle.vy + 0.3,
        life: particle.life - 1,
      }))
      .filter((particle) => particle.life > 0));

    setEnemies((previous) => {
      const nextEnemies: Enemy[] = [];
      let damageTaken = 0;

      previous.forEach((enemy) => {
        const nextX = enemy.x - enemy.speed;

        if (nextX < -50) {
          damageTaken += enemy.damage;
          return;
        }

        nextEnemies.push({ ...enemy, x: nextX });
      });

      if (damageTaken > 0) {
        setGameState((current) => ({
          ...current,
          health: Math.max(0, current.health - damageTaken),
        }));
      }

      return nextEnemies;
    });

    setCollectibles((previous) => previous
      .map((collectible) => ({
        ...collectible,
        x: collectible.x - speed * 1.5,
      }))
      .filter((collectible) => collectible.x > -50));

    const damage = getDamage();

    setBullets((previousBullets) => {
      const remainingBullets: Bullet[] = [];

      setEnemies((previousEnemies) => {
        const remainingEnemies: Enemy[] = [];
        const defeatedEnemyIds = new Set<number>();

        previousEnemies.forEach((enemy) => {
          let enemyHealth = enemy.health;
          let wasHit = false;

          previousBullets.forEach((bullet) => {
            if (defeatedEnemyIds.has(enemy.id)) {
              return;
            }

            const dx = bullet.x - enemy.x;
            const dy = bullet.y - (enemy.y - 20);

            if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
              enemyHealth -= damage;
              wasHit = true;
              createParticles(bullet.x, bullet.y, '#FFD700', 5);
            }
          });

          if (enemyHealth <= 0) {
            defeatedEnemyIds.add(enemy.id);
            awardEnemyRewards(enemy);
            return;
          }

          if (wasHit) {
            remainingEnemies.push({ ...enemy, health: enemyHealth });
            return;
          }

          remainingEnemies.push(enemy);
        });

        previousBullets.forEach((bullet) => {
          const hasHitEnemy = previousEnemies.some((enemy) => {
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - (enemy.y - 20);
            return Math.abs(dx) < 40 && Math.abs(dy) < 40;
          });

          if (!hasHitEnemy) {
            remainingBullets.push(bullet);
          }
        });

        return remainingEnemies;
      });

      return remainingBullets;
    });

    setCollectibles((previous) => {
      const remainingCollectibles: Collectible[] = [];

      previous.forEach((collectible) => {
        const dx = collectible.x - PLAYER_X;
        const dy = collectible.y - (GROUND_Y - 50);

        if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
          collectItem(collectible);
          return;
        }

        remainingCollectibles.push(collectible);
      });

      return remainingCollectibles;
    });

    if (gameStateRef.current.health <= 0) {
      setGameState((previous) => ({
        ...previous,
        status: 'gameOver',
      }));
      return;
    }

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [awardEnemyRewards, collectItem, createParticles, spawnCollectible, spawnEnemy, upgrades]);

  useEffect(() => {
    walletRef.current = sharedWallet;
    setGameState((previous) => {
      if (previous.coins === sharedWallet.coins && previous.totalCoins === sharedWallet.totalCoins) {
        return previous;
      }

      return {
        ...previous,
        coins: sharedWallet.coins,
        totalCoins: sharedWallet.totalCoins,
      };
    });
  }, [sharedWallet]);

  useEffect(() => {
    upgradesRef.current = sharedUpgrades;
    setUpgrades((previous) => {
      const hasChanged = (Object.keys(sharedUpgrades) as UpgradeKey[])
        .some((key) => previous[key] !== sharedUpgrades[key]);

      return hasChanged ? sharedUpgrades : previous;
    });

    const nextMaxHealth = 100 + sharedUpgrades.camelHealth * 25;
    setGameState((previous) => {
      const nextHealth = previous.status === 'menu' ? nextMaxHealth : previous.health;

      if (previous.maxHealth === nextMaxHealth && previous.health === nextHealth) {
        return previous;
      }

      return {
        ...previous,
        maxHealth: nextMaxHealth,
        health: nextHealth,
      };
    });
  }, [sharedUpgrades]);

  useEffect(() => {
    if (!showUpgradePanel) {
      setActiveUpgrade(null);
    }
  }, [setActiveUpgrade, showUpgradePanel]);

  useEffect(() => {
    if (gameState.status !== 'playing') {
      return () => undefined;
    }

    lastTimeRef.current = performance.now();
    animationRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameLoop, gameState.status]);

  const startGame = () => {
    clearTransientState();
    setGameState({
      status: 'playing',
      score: 0,
      coins: walletRef.current.coins,
      artifacts: 0,
      totalCoins: walletRef.current.totalCoins,
      health: getMaxHealth(),
      maxHealth: getMaxHealth(),
      level: 1,
      distance: 0,
    });
  };

  const goToMenu = () => {
    clearTransientState();
    setActiveUpgrade(null);
    setShowUpgradePanel(false);
    setGameState((previous) => ({
      ...previous,
      status: 'menu',
      coins: walletRef.current.coins,
      totalCoins: walletRef.current.totalCoins,
    }));
  };

  const buyUpgrade = (upgradeKey: UpgradeKey) => {
    const currentLevel = upgradesRef.current[upgradeKey];
    if (currentLevel >= 5) {
      return;
    }

    const cost = UPGRADE_COSTS[upgradeKey][currentLevel];
    if (walletRef.current.coins < cost) {
      return;
    }

    const nextLevel = currentLevel + 1;
    const nextUpgrades: Upgrades = {
      ...upgradesRef.current,
      [upgradeKey]: nextLevel,
    };

    upgradesRef.current = nextUpgrades;
    setUpgrades(nextUpgrades);
    publishUpgrade(upgradeKey, nextLevel);
    mutateWallet((wallet) => ({
      coins: wallet.coins - cost,
      totalCoins: wallet.totalCoins - cost,
    }));
  };

  const remotePlayersOnUpgrade = (upgradeKey: UpgradeKey) => remotePlayers.filter((player) => player.activeUpgrade === upgradeKey);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 via-orange-300 to-amber-500 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl md:text-4xl font-bold text-amber-900 mb-4 drop-shadow-lg text-center">
        🏜️ 沙丘游侠：宝藏猎手 🐪
      </h1>

      <div className="mb-3 flex items-center gap-3 rounded-full bg-amber-950/70 px-4 py-2 text-xs md:text-sm text-amber-100 shadow-lg">
        <span>🤝 协同 {connectionLabel}</span>
        <span>👥 在线 {remotePlayers.length + 1}</span>
      </div>

      <div
        ref={gameRef}
        className="relative w-full max-w-4xl h-64 md:h-80 lg:h-96 bg-gradient-to-b from-sky-400 via-sky-300 to-amber-200 rounded-xl overflow-hidden shadow-2xl border-4 border-amber-700 cursor-crosshair select-none"
        onClick={handleClick}
        onTouchStart={handleTouch}
        style={{ aspectRatio: '16/9', maxHeight: '500px' }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-4 right-8 w-12 h-12 md:w-16 md:h-16 bg-yellow-300 rounded-full shadow-lg animate-pulse" />

          <div
            className="absolute top-8 text-4xl md:text-6xl opacity-80 transition-transform"
            style={{ transform: `translateX(${-backgroundOffset * 0.2 % 400}px)` }}
          >
            ☁️ ☁️ ☁️
          </div>

          <div className="absolute bottom-20 left-0 right-0">
            <svg viewBox="0 0 900 100" className="w-full h-16 md:h-24 opacity-60">
              <path d="M0,100 Q150,20 300,80 T600,60 T900,100 L900,100 L0,100 Z" fill="#D2691E" />
            </svg>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-32 md:h-40 bg-gradient-to-t from-amber-600 via-amber-500 to-transparent" />

          <div
            className="absolute bottom-0 left-0 right-0 h-20 flex items-end transition-transform"
            style={{ transform: `translateX(${-backgroundOffset % 100}px)` }}
          >
            {[...Array(20)].map((_, index) => (
              <div key={index} className="flex-shrink-0 w-12 h-4 bg-amber-700 rounded-full mx-2 opacity-30" />
            ))}
          </div>

          <div
            className="absolute bottom-16 text-3xl md:text-5xl transition-transform"
            style={{ transform: `translateX(${200 - backgroundOffset * 0.5 % 500}px)` }}
          >
            🌵
          </div>
          <div
            className="absolute bottom-20 text-2xl md:text-4xl transition-transform"
            style={{ transform: `translateX(${500 - backgroundOffset * 0.5 % 600}px)` }}
          >
            🌵
          </div>
          <div
            className="absolute bottom-16 text-xl md:text-3xl transition-transform"
            style={{ transform: `translateX(${750 - backgroundOffset * 0.5 % 700}px)` }}
          >
            🏜️
          </div>
        </div>

        {gameState.status === 'playing' && (
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
            <div className="bg-black/50 rounded-lg p-2 md:p-3 text-white text-xs md:text-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-1">
                <span>❤️</span>
                <div className="w-20 md:w-28 h-2 md:h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-300"
                    style={{ width: `${(gameState.health / gameState.maxHealth) * 100}%` }}
                  />
                </div>
                <span className="text-xs">{gameState.health}/{gameState.maxHealth}</span>
              </div>
              <div className="flex gap-2 md:gap-4">
                <span>💰 {gameState.coins}</span>
                <span>🏆 {gameState.score}</span>
                <span>⭐ {gameState.level}</span>
              </div>
            </div>

            <button
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs md:text-sm pointer-events-auto transition-colors"
              onClick={(event) => {
                event.stopPropagation();
                goToMenu();
              }}
            >
              退出
            </button>
          </div>
        )}

        {gameState.status === 'playing' && (
          <div
            className="absolute transition-all duration-75"
            style={{
              left: `${PLAYER_X}px`,
              bottom: '20%',
              transform: `translateY(${Math.sin(camelFrame * Math.PI) * 8}px)`,
            }}
          >
            <div className="text-5xl md:text-7xl relative">
              🐪
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl md:text-3xl">
                🤠
              </div>
              <div className="absolute top-4 right-0 text-xl md:text-2xl transform -rotate-12">
                🔫
              </div>
            </div>
          </div>
        )}

        {enemies.map((enemy) => (
          <div
            key={enemy.id}
            className="absolute"
            style={{ left: enemy.x, top: enemy.y - 40 }}
          >
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-red-500 transition-all duration-150"
                style={{ width: `${(enemy.health / enemy.maxHealth) * 100}%` }}
              />
            </div>
            <div className="text-4xl md:text-5xl transform scale-x-[-1]">
              {enemy.type === 'motorcycle' ? (
                <span className="relative">
                  🏍️
                  <span className="absolute -top-3 left-2 text-xl">😈</span>
                </span>
              ) : (
                <span className="relative">
                  🐴
                  <span className="absolute -top-3 left-2 text-xl">🤡</span>
                </span>
              )}
            </div>
          </div>
        ))}

        {collectibles.map((collectible) => (
          <div
            key={collectible.id}
            className="absolute animate-bounce"
            style={{ left: collectible.x, top: collectible.y }}
          >
            <div className={`text-2xl md:text-3xl drop-shadow-lg ${collectible.type !== 'coin' ? 'animate-pulse' : ''}`}>
              {collectible.type === 'coin' && '🪙'}
              {collectible.type === 'artifact' && '💎'}
              {collectible.type === 'shield' && '🛡️'}
              {collectible.type === 'rapidFire' && '⚡'}
              {collectible.type === 'magnet' && '🧲'}
            </div>
          </div>
        ))}

        {bullets.map((bullet) => (
          <div
            key={bullet.id}
            className="absolute w-3 h-3 bg-yellow-400 rounded-full"
            style={{
              left: bullet.x - 6,
              top: bullet.y - 6,
              boxShadow: '0 0 10px 3px rgba(255, 200, 0, 0.8)',
            }}
          />
        ))}

        {particles.map((particle) => (
          <div
            key={particle.id}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: particle.x,
              top: particle.y,
              backgroundColor: particle.color,
              opacity: particle.life / 30,
            }}
          />
        ))}

        {gameState.status === 'menu' && (
          <div className="absolute inset-0 bg-gradient-to-b from-amber-800/90 to-amber-900/90 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4 animate-bounce">🏜️</div>
            <h2 className="text-2xl md:text-4xl font-bold text-amber-100 mb-2 text-center px-4">
              沙丘游侠：宝藏猎手
            </h2>
            <p className="text-amber-200 text-sm md:text-base mb-2 text-center px-4">
              在广袤的沙漠中收集宝藏，击退土匪！
            </p>
            <p className="text-amber-300 text-xs md:text-sm mb-4 text-center px-4">
              Yjs + WebRTC 正在同步金币与技能等级，支持多标签页和多设备协作。
            </p>
            <p className="text-yellow-300 text-lg md:text-xl mb-4">
              💰 金币: {gameState.coins} | 💎 神器: {gameState.artifacts}
            </p>

            <div className="flex flex-col gap-3">
              <button
                className="bg-green-500 hover:bg-green-400 text-white px-6 py-3 rounded-lg text-lg md:text-xl font-bold transition-all hover:scale-105 shadow-lg"
                onClick={startGame}
              >
                🎮 开始冒险
              </button>

              <button
                className="bg-amber-500 hover:bg-amber-400 text-white px-6 py-2 rounded-lg font-bold transition-all hover:scale-105 shadow-lg"
                onClick={() => setShowUpgradePanel((previous) => !previous)}
              >
                ⚙️ 升级商店
              </button>
            </div>

            {showUpgradePanel && (
              <div className="mt-4 bg-amber-950/80 rounded-xl p-4 max-w-md w-full mx-4">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <h3 className="text-amber-200 text-lg font-bold">升级你的装备</h3>
                  <div className="text-xs text-amber-300">协同 {connectionLabel}</div>
                </div>

                <div className="mb-3 rounded-lg bg-amber-900/40 px-3 py-2 text-xs text-amber-200 flex flex-wrap gap-2">
                  <span>当前房间 {remotePlayers.length + 1} 位玩家</span>
                  {remotePlayers.map((player) => (
                    <span key={player.clientId} className="inline-flex items-center gap-1 rounded-full bg-amber-950/60 px-2 py-1">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
                      {player.name}
                    </span>
                  ))}
                </div>

                <div className="grid gap-2">
                  {(Object.keys(UPGRADE_NAMES) as UpgradeKey[]).map((upgradeKey) => {
                    const level = upgrades[upgradeKey];
                    const canUpgrade = level < 5;
                    const cost = canUpgrade ? UPGRADE_COSTS[upgradeKey][level] : 0;
                    const canAfford = gameState.coins >= cost;
                    const hoveringPlayers = remotePlayersOnUpgrade(upgradeKey);

                    return (
                      <div
                        key={upgradeKey}
                        className="relative flex items-center justify-between bg-amber-900/50 rounded-lg p-3"
                        onMouseEnter={() => setActiveUpgrade(upgradeKey)}
                        onMouseLeave={() => setActiveUpgrade(null)}
                      >
                        <div className="text-amber-100 text-sm">
                          <div className="flex items-center gap-2">
                            <span>{UPGRADE_NAMES[upgradeKey]}</span>
                            {hoveringPlayers.length > 0 && (
                              <span className="text-[11px] text-amber-300">
                                {hoveringPlayers.length} 位玩家正在这里
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex gap-1">
                            {[...Array(5)].map((_, index) => (
                              <div
                                key={index}
                                className={`w-3 h-3 rounded ${index < level ? 'bg-yellow-400' : 'bg-gray-600'}`}
                              />
                            ))}
                          </div>
                          {hoveringPlayers.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {hoveringPlayers.map((player) => (
                                <span
                                  key={player.clientId}
                                  className="inline-flex items-center gap-1 rounded-full bg-amber-950/70 px-2 py-1 text-[11px]"
                                >
                                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: player.color }} />
                                  {player.name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          className={`px-3 py-1 rounded text-sm font-bold transition-colors ${
                            !canUpgrade
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : canAfford
                                ? 'bg-green-500 hover:bg-green-400 text-white'
                                : 'bg-red-900 text-red-300 cursor-not-allowed'
                          }`}
                          onClick={() => buyUpgrade(upgradeKey)}
                          onFocus={() => setActiveUpgrade(upgradeKey)}
                          onBlur={() => setActiveUpgrade(null)}
                          disabled={!canUpgrade || !canAfford}
                        >
                          {canUpgrade ? `${cost} 💰` : '已满'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 text-amber-300 text-xs md:text-sm text-center px-4">
              💡 点击屏幕射击土匪 | 收集金币和道具
            </div>
          </div>
        )}

        {gameState.status === 'gameOver' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4">💀</div>
            <h2 className="text-2xl md:text-4xl font-bold text-red-400 mb-4">游戏结束</h2>
            <div className="bg-gray-900/80 rounded-xl p-4 mb-4 text-center">
              <p className="text-white text-lg mb-2">🏆 最终得分: <span className="text-yellow-400 font-bold">{gameState.score}</span></p>
              <p className="text-amber-200">💰 收集金币: {gameState.coins}</p>
              <p className="text-purple-300">💎 神器碎片: {gameState.artifacts}</p>
              <p className="text-blue-300">📏 行进距离: {Math.floor(gameState.distance)}m</p>
              <p className="text-orange-300">⭐ 达到等级: {gameState.level}</p>
            </div>
            <div className="flex gap-3">
              <button
                className="bg-green-500 hover:bg-green-400 text-white px-6 py-3 rounded-lg text-lg font-bold transition-all hover:scale-105 shadow-lg"
                onClick={startGame}
              >
                🔄 再来一次
              </button>
              <button
                className="bg-amber-500 hover:bg-amber-400 text-white px-6 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg"
                onClick={goToMenu}
              >
                🏠 返回菜单
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-amber-900 text-xs md:text-sm text-center max-w-lg">
        <p>🎯 点击屏幕射击土匪 | 🪙 收集金币升级装备 | 💎 收集神器碎片</p>
        <p className="mt-1">🛡️ 护盾恢复生命 | ⚡ 快速射击 | 🧲 磁吸金币</p>
      </div>
    </div>
  );
}
