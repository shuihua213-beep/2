import { useState, useEffect, useCallback, useRef } from 'react';

const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const PLAYER_X = 120;
const GROUND_Y = 380;

const FIXED_DT = 1000 / 120;
const MAX_PHYSICS_STEPS = 10;
const BASE_FRAME_MS = 1000 / 60;
const PARTICLE_GRAVITY = 0.3;

function rk4Integrate(
  x: number, y: number, vx: number, vy: number,
  ax: number, ay: number, dt: number,
) {
  const k1x = vx * dt;
  const k1y = vy * dt;
  const k1vx = ax * dt;
  const k1vy = ay * dt;

  const k2x = (vx + k1vx / 2) * dt;
  const k2y = (vy + k1vy / 2) * dt;
  const k2vx = ax * dt;
  const k2vy = ay * dt;

  const k3x = (vx + k2vx / 2) * dt;
  const k3y = (vy + k2vy / 2) * dt;
  const k3vx = ax * dt;
  const k3vy = ay * dt;

  const k4x = (vx + k3vx) * dt;
  const k4y = (vy + k3vy) * dt;
  const k4vx = ax * dt;
  const k4vy = ay * dt;

  return {
    x: x + (k1x + 2 * k2x + 2 * k3x + k4x) / 6,
    y: y + (k1y + 2 * k2y + 2 * k3y + k4y) / 6,
    vx: vx + (k1vx + 2 * k2vx + 2 * k3vx + k4vx) / 6,
    vy: vy + (k1vy + 2 * k2vy + 2 * k3vy + k4vy) / 6,
  };
}

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

interface Upgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

interface PendingChanges {
  scoreDelta: number;
  coinDelta: number;
  artifactDelta: number;
  healthDelta: number;
  healthSetShield: boolean;
}

const UPGRADE_COSTS = {
  weaponDamage: [100, 250, 500, 1000, 2000],
  weaponFireRate: [150, 300, 600, 1200, 2500],
  camelHealth: [200, 400, 800, 1600, 3200],
  camelSpeed: [100, 200, 400, 800, 1600],
};

const UPGRADE_NAMES: Record<keyof Upgrades, string> = {
  weaponDamage: '🔫 武器伤害',
  weaponFireRate: '⚡ 射击速度',
  camelHealth: '❤️ 生命上限',
  camelSpeed: '🐪 移动速度',
};

export default function App() {
  const gameRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const [gameState, setGameState] = useState<GameState>({
    status: 'menu',
    score: 0,
    coins: 0,
    artifacts: 0,
    totalCoins: 0,
    health: 100,
    maxHealth: 100,
    level: 1,
    distance: 0,
  });

  const [upgrades, setUpgrades] = useState<Upgrades>({
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  });

  const [renderEnemies, setRenderEnemies] = useState<Enemy[]>([]);
  const [renderCollectibles, setRenderCollectibles] = useState<Collectible[]>([]);
  const [renderBullets, setRenderBullets] = useState<Bullet[]>([]);
  const [renderParticles, setRenderParticles] = useState<Particle[]>([]);
  const [camelFrame, setCamelFrame] = useState(0);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);

  const timeScaleRef = useRef(1);
  const physicsAccumulatorRef = useRef(0);
  const gameTimeRef = useRef(0);
  const lastShotGameTimeRef = useRef(0);
  const idCounterRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const collectibleTimerRef = useRef(0);
  const gameStateRef = useRef(gameState);
  const upgradesRef = useRef(upgrades);

  const enemiesRef = useRef<Enemy[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]);

  gameStateRef.current = gameState;
  upgradesRef.current = upgrades;

  const getDamage = () => 25 + upgradesRef.current.weaponDamage * 15;
  const getFireRate = () => 400 - upgradesRef.current.weaponFireRate * 60;
  const getMaxHealth = () => 100 + upgradesRef.current.camelHealth * 25;
  const getSpeed = () => 2 + upgradesRef.current.camelSpeed * 0.5;

  const createParticles = (x: number, y: number, color: string, count: number) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        id: idCounterRef.current++,
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        life: 30,
        color,
      });
    }
  };

  const spawnEnemy = useCallback(() => {
    const type = Math.random() > 0.6 ? 'motorcycle' : 'horse';
    const level = gameStateRef.current.level;

    const baseHealth = type === 'motorcycle' ? 60 : 40;
    const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
    const baseDamage = type === 'motorcycle' ? 20 : 15;

    const newEnemy: Enemy = {
      id: idCounterRef.current++,
      x: GAME_WIDTH + 50,
      y: GROUND_Y - 20 - Math.random() * 40,
      health: baseHealth + level * 10,
      maxHealth: baseHealth + level * 10,
      type,
      speed: baseSpeed + level * 0.3,
      damage: baseDamage + level * 3,
    };

    enemiesRef.current.push(newEnemy);
  }, []);

  const spawnCollectible = useCallback(() => {
    const rand = Math.random();
    let type: Collectible['type'];
    if (rand < 0.7) type = 'coin';
    else if (rand < 0.85) type = 'artifact';
    else if (rand < 0.90) type = 'shield';
    else if (rand < 0.95) type = 'rapidFire';
    else type = 'magnet';

    const newCollectible: Collectible = {
      id: idCounterRef.current++,
      x: GAME_WIDTH + 30,
      y: GROUND_Y - 60 - Math.random() * 100,
      type,
    };

    collectiblesRef.current.push(newCollectible);
  }, []);

  const shoot = useCallback((targetX: number, targetY: number) => {
    if (gameTimeRef.current - lastShotGameTimeRef.current < getFireRate()) return;
    if (gameStateRef.current.status !== 'playing') return;

    lastShotGameTimeRef.current = gameTimeRef.current;

    const startX = PLAYER_X + 60;
    const startY = GROUND_Y - 80;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = 15;

    const newBullet: Bullet = {
      id: idCounterRef.current++,
      x: startX,
      y: startY,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
    };

    bulletsRef.current.push(newBullet);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') return;

    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    shoot(x, y);
  };

  const handleTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') return;
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    shoot(x, y);
  };

  const physicsStep = useCallback((dtScale: number) => {
    const bullets = bulletsRef.current;
    const enemies = enemiesRef.current;
    const particles = particlesRef.current;
    const collectibles = collectiblesRef.current;
    const damage = getDamage();
    const speed = getSpeed();

    const pending: PendingChanges = {
      scoreDelta: 0,
      coinDelta: 0,
      artifactDelta: 0,
      healthDelta: 0,
      healthSetShield: false,
    };

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      const result = rk4Integrate(b.x, b.y, b.vx, b.vy, 0, 0, dtScale);
      if (
        result.x > GAME_WIDTH + 50 || result.x < -50 ||
        result.y > GAME_HEIGHT + 50 || result.y < -50
      ) {
        bullets.splice(i, 1);
      } else {
        b.x = result.x;
        b.y = result.y;
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const result = rk4Integrate(p.x, p.y, p.vx, p.vy, 0, PARTICLE_GRAVITY, dtScale);
      const newLife = p.life - dtScale;
      if (newLife <= 0) {
        particles.splice(i, 1);
      } else {
        p.x = result.x;
        p.y = result.y;
        p.vx = result.vx;
        p.vy = result.vy;
        p.life = newLife;
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i];
      enemy.x -= enemy.speed * dtScale;
      if (enemy.x < -50) {
        pending.healthDelta -= enemy.damage;
        enemies.splice(i, 1);
      }
    }

    for (let i = collectibles.length - 1; i >= 0; i--) {
      const c = collectibles[i];
      c.x -= speed * 1.5 * dtScale;
      if (c.x < -50) {
        collectibles.splice(i, 1);
      }
    }

    const hitBulletIndices = new Set<number>();
    const killedEnemyIndices = new Set<number>();

    for (let bi = 0; bi < bullets.length; bi++) {
      const bullet = bullets[bi];
      for (let ei = 0; ei < enemies.length; ei++) {
        if (killedEnemyIndices.has(ei)) continue;
        if (hitBulletIndices.has(bi)) continue;
        const enemy = enemies[ei];
        const dx = bullet.x - enemy.x;
        const dy = bullet.y - (enemy.y - 20);
        if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
          hitBulletIndices.add(bi);
          enemy.health -= damage;
          createParticles(bullet.x, bullet.y, '#FFD700', 5);
          if (enemy.health <= 0) {
            killedEnemyIndices.add(ei);
            pending.scoreDelta += enemy.type === 'motorcycle' ? 50 : 30;
            pending.coinDelta += enemy.type === 'motorcycle' ? 15 : 10;
            createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
          }
        }
      }
    }

    if (hitBulletIndices.size > 0) {
      const sortedIndices = [...hitBulletIndices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        bullets.splice(idx, 1);
      }
    }

    if (killedEnemyIndices.size > 0) {
      const sortedIndices = [...killedEnemyIndices].sort((a, b) => b - a);
      for (const idx of sortedIndices) {
        enemies.splice(idx, 1);
      }
    }

    for (let i = collectibles.length - 1; i >= 0; i--) {
      const c = collectibles[i];
      const dx = c.x - PLAYER_X;
      const dy = c.y - (GROUND_Y - 50);
      if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
        createParticles(c.x, c.y, c.type === 'coin' ? '#FFD700' : '#9333EA', 8);
        switch (c.type) {
          case 'coin':
            pending.scoreDelta += 5;
            pending.coinDelta += 5;
            break;
          case 'artifact':
            pending.scoreDelta += 100;
            pending.artifactDelta += 1;
            break;
          case 'shield':
            pending.healthSetShield = true;
            break;
          case 'rapidFire':
          case 'magnet':
            pending.scoreDelta += 50;
            break;
        }
        collectibles.splice(i, 1);
      }
    }

    if (pending.scoreDelta !== 0 || pending.coinDelta !== 0 ||
        pending.artifactDelta !== 0 || pending.healthDelta !== 0 ||
        pending.healthSetShield) {
      setGameState(prev => {
        let health = prev.health + pending.healthDelta;
        if (pending.healthSetShield) {
          health = Math.min(prev.maxHealth, health + 30);
        }
        return {
          ...prev,
          score: prev.score + pending.scoreDelta,
          coins: prev.coins + pending.coinDelta,
          totalCoins: prev.totalCoins + pending.coinDelta,
          artifacts: prev.artifacts + pending.artifactDelta,
          health: Math.max(0, health),
        };
      });
    }
  }, []);

  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current.status !== 'playing') return;

    const rawDelta = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;

    const timeScale = timeScaleRef.current;
    const effectiveDelta = rawDelta * timeScale;
    gameTimeRef.current += effectiveDelta;

    physicsAccumulatorRef.current += effectiveDelta;
    let steps = 0;
    while (physicsAccumulatorRef.current >= FIXED_DT && steps < MAX_PHYSICS_STEPS) {
      const dtScale = FIXED_DT / BASE_FRAME_MS;
      physicsStep(dtScale);
      physicsAccumulatorRef.current -= FIXED_DT;
      steps++;
    }

    if (steps === MAX_PHYSICS_STEPS) {
      physicsAccumulatorRef.current = 0;
    }

    const speed = getSpeed();
    const dtScaleVisual = effectiveDelta / BASE_FRAME_MS;

    setBackgroundOffset(prev => (prev + speed * dtScaleVisual) % 600);
    setCamelFrame(prev => (prev + 0.15 * dtScaleVisual) % 4);

    setGameState(prev => {
      const newDistance = prev.distance + speed * 0.1 * dtScaleVisual;
      const newLevel = Math.min(5, Math.floor(newDistance / 500) + 1);
      return { ...prev, distance: newDistance, level: newLevel };
    });

    spawnTimerRef.current += effectiveDelta;
    const spawnInterval = Math.max(1500 - gameStateRef.current.level * 200, 600);
    if (spawnTimerRef.current > spawnInterval) {
      spawnEnemy();
      spawnTimerRef.current = 0;
    }

    collectibleTimerRef.current += effectiveDelta;
    if (collectibleTimerRef.current > 1200) {
      spawnCollectible();
      collectibleTimerRef.current = 0;
    }

    setRenderEnemies([...enemiesRef.current]);
    setRenderBullets([...bulletsRef.current]);
    setRenderParticles([...particlesRef.current]);
    setRenderCollectibles([...collectiblesRef.current]);

    if (gameStateRef.current.health <= 0) {
      setGameState(prev => ({ ...prev, status: 'gameOver' }));
      return;
    }

    animationRef.current = requestAnimationFrame(gameLoop);
  }, [spawnEnemy, spawnCollectible, physicsStep]);

  useEffect(() => {
    if (gameState.status === 'playing') {
      lastTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(gameLoop);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [gameState.status, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 't' || e.key === 'T') {
        if (gameStateRef.current.status === 'playing') {
          timeScaleRef.current = timeScaleRef.current === 1 ? 0.3 : 1;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const startGame = () => {
    setGameState({
      status: 'playing',
      score: 0,
      coins: gameState.coins,
      artifacts: 0,
      totalCoins: gameState.coins,
      health: getMaxHealth(),
      maxHealth: getMaxHealth(),
      level: 1,
      distance: 0,
    });
    enemiesRef.current = [];
    collectiblesRef.current = [];
    bulletsRef.current = [];
    particlesRef.current = [];
    setRenderEnemies([]);
    setRenderCollectibles([]);
    setRenderBullets([]);
    setRenderParticles([]);
    spawnTimerRef.current = 0;
    collectibleTimerRef.current = 0;
    physicsAccumulatorRef.current = 0;
    gameTimeRef.current = 0;
    lastShotGameTimeRef.current = 0;
    timeScaleRef.current = 1;
  };

  const goToMenu = () => {
    setGameState(prev => ({
      ...prev,
      status: 'menu',
      coins: prev.totalCoins,
    }));
    setShowUpgradePanel(false);
    timeScaleRef.current = 1;
  };

  const buyUpgrade = (type: keyof Upgrades) => {
    const level = upgrades[type];
    if (level >= 5) return;

    const cost = UPGRADE_COSTS[type][level];
    if (gameState.coins < cost) return;

    setGameState(prev => ({
      ...prev,
      coins: prev.coins - cost,
      totalCoins: prev.totalCoins - cost,
    }));

    setUpgrades(prev => ({
      ...prev,
      [type]: prev[type] + 1,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 via-orange-300 to-amber-500 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl md:text-4xl font-bold text-amber-900 mb-4 drop-shadow-lg text-center">
        🏜️ 沙丘游侠：宝藏猎手 🐪
      </h1>

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

          <div
            className="absolute bottom-0 left-0 right-0 h-32 md:h-40 bg-gradient-to-t from-amber-600 via-amber-500 to-transparent"
          />

          <div
            className="absolute bottom-0 left-0 right-0 h-20 flex items-end transition-transform"
            style={{ transform: `translateX(${-backgroundOffset % 100}px)` }}
          >
            {[...Array(20)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-12 h-4 bg-amber-700 rounded-full mx-2 opacity-30" />
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

            {timeScaleRef.current !== 1 && (
              <div className="bg-purple-600/80 rounded-lg px-3 py-1 text-white text-xs md:text-sm font-bold backdrop-blur-sm animate-pulse">
                ⏱️ 子弹时间 ×0.3
              </div>
            )}

            <button
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs md:text-sm pointer-events-auto transition-colors"
              onClick={(e) => {
                e.stopPropagation();
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

        {renderEnemies.map(enemy => (
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

        {renderCollectibles.map(c => (
          <div
            key={c.id}
            className="absolute animate-bounce"
            style={{ left: c.x, top: c.y }}
          >
            <div className={`text-2xl md:text-3xl drop-shadow-lg ${c.type !== 'coin' ? 'animate-pulse' : ''}`}>
              {c.type === 'coin' && '🪙'}
              {c.type === 'artifact' && '💎'}
              {c.type === 'shield' && '🛡️'}
              {c.type === 'rapidFire' && '⚡'}
              {c.type === 'magnet' && '🧲'}
            </div>
          </div>
        ))}

        {renderBullets.map(b => (
          <div
            key={b.id}
            className="absolute w-3 h-3 bg-yellow-400 rounded-full"
            style={{
              left: b.x - 6,
              top: b.y - 6,
              boxShadow: '0 0 10px 3px rgba(255, 200, 0, 0.8)',
            }}
          />
        ))}

        {renderParticles.map(p => (
          <div
            key={p.id}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: p.x,
              top: p.y,
              backgroundColor: p.color,
              opacity: p.life / 30,
            }}
          />
        ))}

        {gameState.status === 'menu' && (
          <div className="absolute inset-0 bg-gradient-to-b from-amber-800/90 to-amber-900/90 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4 animate-bounce">🏜️</div>
            <h2 className="text-2xl md:text-4xl font-bold text-amber-100 mb-2 text-center px-4">
              沙丘游侠：宝藏猎手
            </h2>
            <p className="text-amber-200 text-sm md:text-base mb-4 text-center px-4">
              在广袤的沙漠中收集宝藏，击退土匪！
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
                onClick={() => setShowUpgradePanel(!showUpgradePanel)}
              >
                ⚙️ 升级商店
              </button>
            </div>

            {showUpgradePanel && (
              <div className="mt-4 bg-amber-950/80 rounded-xl p-4 max-w-sm w-full mx-4">
                <h3 className="text-amber-200 text-lg font-bold mb-3 text-center">升级你的装备</h3>
                <div className="grid gap-2">
                  {(Object.keys(UPGRADE_NAMES) as (keyof Upgrades)[]).map(key => {
                    const level = upgrades[key];
                    const canUpgrade = level < 5;
                    const cost = canUpgrade ? UPGRADE_COSTS[key][level] : 0;
                    const canAfford = gameState.coins >= cost;

                    return (
                      <div key={key} className="flex items-center justify-between bg-amber-900/50 rounded-lg p-2">
                        <div className="text-amber-100 text-sm">
                          <div>{UPGRADE_NAMES[key]}</div>
                          <div className="flex gap-1">
                            {[...Array(5)].map((_, i) => (
                              <div
                                key={i}
                                className={`w-3 h-3 rounded ${i < level ? 'bg-yellow-400' : 'bg-gray-600'}`}
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          className={`px-3 py-1 rounded text-sm font-bold transition-colors ${
                            !canUpgrade
                              ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                              : canAfford
                                ? 'bg-green-500 hover:bg-green-400 text-white'
                                : 'bg-red-900 text-red-300 cursor-not-allowed'
                          }`}
                          onClick={() => buyUpgrade(key)}
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
              💡 点击屏幕射击土匪 | 按 <kbd className="bg-amber-800 px-1 rounded">T</kbd> 切换子弹时间
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
        <p className="mt-1">🛡️ 护盾恢复生命 | ⚡ 快速射击 | 🧲 磁吸金币 | <kbd className="bg-amber-700 text-amber-100 px-1 rounded">T</kbd> 子弹时间</p>
      </div>
    </div>
  );
}