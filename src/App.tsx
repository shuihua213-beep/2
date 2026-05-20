import { useEffect, useRef, useState, type MouseEvent, type TouchEvent } from 'react';

const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const PLAYER_X = 120;
const GROUND_Y = 380;
const BASE_FPS = 60;
const FIXED_STEP_SECONDS = 1 / 120;
const MAX_FRAME_SECONDS = 0.1;
const BULLET_TIME_SCALE = 0.3;
const BULLET_HALF_SIZE = 6;
const ENEMY_HALF_WIDTH = 40;
const ENEMY_HALF_HEIGHT = 40;
const PLAYER_PICKUP_HALF_WIDTH = 60;
const PLAYER_PICKUP_HALF_HEIGHT = 60;
const PARTICLE_LIFETIME_SECONDS = 30 / BASE_FPS;
const PARTICLE_GRAVITY = 0.3 * BASE_FPS * BASE_FPS;
const CAMEL_FRAME_SPEED = 0.15 * BASE_FPS;

interface MotionBody {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
}

interface Enemy extends MotionBody {
  id: number;
  health: number;
  maxHealth: number;
  type: 'horse' | 'motorcycle';
  damage: number;
}

interface Collectible extends MotionBody {
  id: number;
  type: 'coin' | 'artifact' | 'shield' | 'rapidFire' | 'magnet';
}

interface Bullet extends MotionBody {
  id: number;
}

interface Particle extends MotionBody {
  id: number;
  life: number;
  maxLife: number;
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

const getDamageValue = (upgrades: Upgrades) => 25 + upgrades.weaponDamage * 15;
const getFireRateSeconds = (upgrades: Upgrades) => (400 - upgrades.weaponFireRate * 60) / 1000;
const getMaxHealthValue = (upgrades: Upgrades) => 100 + upgrades.camelHealth * 25;
const getScrollSpeedValue = (upgrades: Upgrades) => (2 + upgrades.camelSpeed * 0.5) * BASE_FPS;

const integrateVelocityVerlet = <T extends MotionBody>(body: T, dt: number): T => {
  const nextX = body.x + body.vx * dt + 0.5 * body.ax * dt * dt;
  const nextY = body.y + body.vy * dt + 0.5 * body.ay * dt * dt;
  const nextVx = body.vx + body.ax * dt;
  const nextVy = body.vy + body.ay * dt;

  return {
    ...body,
    prevX: body.x,
    prevY: body.y,
    x: nextX,
    y: nextY,
    vx: nextVx,
    vy: nextVy,
  };
};

const getSegmentAabbHitTime = (
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  halfWidth: number,
  halfHeight: number,
) => {
  const dx = endX - startX;
  const dy = endY - startY;
  let tMin = 0;
  let tMax = 1;

  const updateAxis = (start: number, delta: number, min: number, max: number) => {
    if (Math.abs(delta) < 1e-8) {
      return start >= min && start <= max;
    }

    let t1 = (min - start) / delta;
    let t2 = (max - start) / delta;

    if (t1 > t2) {
      [t1, t2] = [t2, t1];
    }

    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);

    return tMin <= tMax;
  };

  if (!updateAxis(startX, dx, -halfWidth, halfWidth)) return null;
  if (!updateAxis(startY, dy, -halfHeight, halfHeight)) return null;

  return tMin <= 1 && tMax >= 0 ? Math.max(0, tMin) : null;
};

const getBulletEnemyHitTime = (bullet: Bullet, enemy: Enemy) => {
  const startRelX = bullet.prevX - enemy.prevX;
  const startRelY = bullet.prevY - (enemy.prevY - 20);
  const endRelX = bullet.x - enemy.x;
  const endRelY = bullet.y - (enemy.y - 20);

  return getSegmentAabbHitTime(
    startRelX,
    startRelY,
    endRelX,
    endRelY,
    ENEMY_HALF_WIDTH + BULLET_HALF_SIZE,
    ENEMY_HALF_HEIGHT + BULLET_HALF_SIZE,
  );
};

const getCollectiblePlayerHitTime = (collectible: Collectible) => {
  const startRelX = collectible.prevX - PLAYER_X;
  const startRelY = collectible.prevY - (GROUND_Y - 50);
  const endRelX = collectible.x - PLAYER_X;
  const endRelY = collectible.y - (GROUND_Y - 50);

  return getSegmentAabbHitTime(
    startRelX,
    startRelY,
    endRelX,
    endRelY,
    PLAYER_PICKUP_HALF_WIDTH,
    PLAYER_PICKUP_HALF_HEIGHT,
  );
};

export default function App() {
  const gameRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  const accumulatorRef = useRef<number>(0);
  const idCounterRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const collectibleTimerRef = useRef(0);
  const shotCooldownRef = useRef(0);
  const bulletTimeActiveRef = useRef(false);
  const upgradesRef = useRef<Upgrades>({
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  });
  const gameStateRef = useRef<GameState>({
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
  const enemiesRef = useRef<Enemy[]>([]);
  const collectiblesRef = useRef<Collectible[]>([]);
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const camelFrameRef = useRef(0);
  const backgroundOffsetRef = useRef(0);

  const [gameState, setGameState] = useState<GameState>(gameStateRef.current);
  const [upgrades, setUpgrades] = useState<Upgrades>(upgradesRef.current);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [camelFrame, setCamelFrame] = useState(0);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);
  const [bulletTimeActive, setBulletTimeActive] = useState(false);

  const syncRenderState = () => {
    setGameState({ ...gameStateRef.current });
    setEnemies([...enemiesRef.current]);
    setCollectibles([...collectiblesRef.current]);
    setBullets([...bulletsRef.current]);
    setParticles([...particlesRef.current]);
    setCamelFrame(camelFrameRef.current);
    setBackgroundOffset(backgroundOffsetRef.current);
  };

  const toggleBulletTime = () => {
    const next = !bulletTimeActiveRef.current;
    bulletTimeActiveRef.current = next;
    setBulletTimeActive(next);
  };

  const createParticles = (x: number, y: number, color: string, count: number) => {
    const nextParticles = [...particlesRef.current];

    for (let index = 0; index < count; index += 1) {
      const vx = (Math.random() - 0.5) * 8 * BASE_FPS;
      const vy = ((Math.random() - 0.5) * 8 - 2) * BASE_FPS;
      nextParticles.push({
        id: idCounterRef.current,
        x,
        y,
        prevX: x - vx * FIXED_STEP_SECONDS,
        prevY: y - vy * FIXED_STEP_SECONDS,
        vx,
        vy,
        ax: 0,
        ay: PARTICLE_GRAVITY,
        life: PARTICLE_LIFETIME_SECONDS,
        maxLife: PARTICLE_LIFETIME_SECONDS,
        color,
      });
      idCounterRef.current += 1;
    }

    particlesRef.current = nextParticles;
  };

  const spawnEnemy = () => {
    const type: Enemy['type'] = Math.random() > 0.6 ? 'motorcycle' : 'horse';
    const level = gameStateRef.current.level;
    const baseHealth = type === 'motorcycle' ? 60 : 40;
    const baseSpeed = (type === 'motorcycle' ? 3.5 : 2.5) * BASE_FPS;
    const baseDamage = type === 'motorcycle' ? 20 : 15;
    const x = GAME_WIDTH + 50;
    const y = GROUND_Y - 20 - Math.random() * 40;
    const vx = -(baseSpeed + level * 0.3 * BASE_FPS);

    enemiesRef.current = [
      ...enemiesRef.current,
      {
        id: idCounterRef.current,
        x,
        y,
        prevX: x - vx * FIXED_STEP_SECONDS,
        prevY: y,
        vx,
        vy: 0,
        ax: 0,
        ay: 0,
        health: baseHealth + level * 10,
        maxHealth: baseHealth + level * 10,
        type,
        damage: baseDamage + level * 3,
      },
    ];
    idCounterRef.current += 1;
  };

  const spawnCollectible = () => {
    const random = Math.random();
    let type: Collectible['type'];

    if (random < 0.7) type = 'coin';
    else if (random < 0.85) type = 'artifact';
    else if (random < 0.9) type = 'shield';
    else if (random < 0.95) type = 'rapidFire';
    else type = 'magnet';

    const x = GAME_WIDTH + 30;
    const y = GROUND_Y - 60 - Math.random() * 100;
    const vx = -getScrollSpeedValue(upgradesRef.current) * 1.5;

    collectiblesRef.current = [
      ...collectiblesRef.current,
      {
        id: idCounterRef.current,
        x,
        y,
        prevX: x - vx * FIXED_STEP_SECONDS,
        prevY: y,
        vx,
        vy: 0,
        ax: 0,
        ay: 0,
        type,
      },
    ];
    idCounterRef.current += 1;
  };

  const applyCollectibleEffect = (collectible: Collectible) => {
    const current = gameStateRef.current;

    if (collectible.type === 'coin') {
      gameStateRef.current = {
        ...current,
        coins: current.coins + 5,
        score: current.score + 5,
        totalCoins: current.totalCoins + 5,
      };
      return;
    }

    if (collectible.type === 'artifact') {
      gameStateRef.current = {
        ...current,
        artifacts: current.artifacts + 1,
        score: current.score + 100,
      };
      return;
    }

    if (collectible.type === 'shield') {
      gameStateRef.current = {
        ...current,
        health: Math.min(current.maxHealth, current.health + 30),
      };
      return;
    }

    gameStateRef.current = {
      ...current,
      score: current.score + 50,
    };
  };

  const resolveBulletEnemyCollisions = () => {
    if (bulletsRef.current.length === 0 || enemiesRef.current.length === 0) return;

    const damage = getDamageValue(upgradesRef.current);
    const bulletsAfterStep = bulletsRef.current;
    const enemiesAfterStep = enemiesRef.current.map((enemy: Enemy) => ({ ...enemy }));
    const survivingBullets: Bullet[] = [];

    for (const bullet of bulletsAfterStep) {
      let bestEnemyIndex = -1;
      let bestHitTime = Number.POSITIVE_INFINITY;

      for (let index = 0; index < enemiesAfterStep.length; index += 1) {
        const enemy = enemiesAfterStep[index];
        if (enemy.health <= 0) continue;

        const hitTime = getBulletEnemyHitTime(bullet, enemy);
        if (hitTime === null || hitTime >= bestHitTime) continue;

        bestHitTime = hitTime;
        bestEnemyIndex = index;
      }

      if (bestEnemyIndex === -1) {
        survivingBullets.push(bullet);
        continue;
      }

      const enemy = enemiesAfterStep[bestEnemyIndex];
      enemy.health -= damage;
      const hitX = bullet.prevX + (bullet.x - bullet.prevX) * bestHitTime;
      const hitY = bullet.prevY + (bullet.y - bullet.prevY) * bestHitTime;
      createParticles(hitX, hitY, '#FFD700', 5);
    }

    const nextEnemies: Enemy[] = [];

    for (const enemy of enemiesAfterStep) {
      if (enemy.health > 0) {
        nextEnemies.push(enemy);
        continue;
      }

      const current = gameStateRef.current;
      const reward = enemy.type === 'motorcycle' ? 15 : 10;
      const score = enemy.type === 'motorcycle' ? 50 : 30;
      gameStateRef.current = {
        ...current,
        score: current.score + score,
        coins: current.coins + reward,
        totalCoins: current.totalCoins + reward,
      };
      createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
    }

    bulletsRef.current = survivingBullets;
    enemiesRef.current = nextEnemies;
  };

  const resolveCollectibleCollisions = () => {
    if (collectiblesRef.current.length === 0) return;

    const remainingCollectibles: Collectible[] = [];

    for (const collectible of collectiblesRef.current) {
      const hitTime = getCollectiblePlayerHitTime(collectible);
      if (hitTime === null) {
        remainingCollectibles.push(collectible);
        continue;
      }

      const hitX = collectible.prevX + (collectible.x - collectible.prevX) * hitTime;
      const hitY = collectible.prevY + (collectible.y - collectible.prevY) * hitTime;
      createParticles(hitX, hitY, collectible.type === 'coin' ? '#FFD700' : '#9333EA', 8);
      applyCollectibleEffect(collectible);
    }

    collectiblesRef.current = remainingCollectibles;
  };

  const stepSimulation = () => {
    if (gameStateRef.current.status !== 'playing') return;

    const dt = FIXED_STEP_SECONDS;
    const scrollSpeed = getScrollSpeedValue(upgradesRef.current);
    const current = gameStateRef.current;
    const nextDistance = current.distance + scrollSpeed * dt * 0.1;
    const nextLevel = Math.min(5, Math.floor(nextDistance / 500) + 1);

    gameStateRef.current = {
      ...current,
      distance: nextDistance,
      level: nextLevel,
    };

    backgroundOffsetRef.current = (backgroundOffsetRef.current + scrollSpeed * dt) % 600;
    camelFrameRef.current = (camelFrameRef.current + CAMEL_FRAME_SPEED * dt) % 4;
    shotCooldownRef.current = Math.max(0, shotCooldownRef.current - dt);

    const spawnIntervalSeconds = Math.max(1500 - gameStateRef.current.level * 200, 600) / 1000;
    spawnTimerRef.current += dt;
    while (spawnTimerRef.current >= spawnIntervalSeconds) {
      spawnTimerRef.current -= spawnIntervalSeconds;
      spawnEnemy();
    }

    const collectibleIntervalSeconds = 1.2;
    collectibleTimerRef.current += dt;
    while (collectibleTimerRef.current >= collectibleIntervalSeconds) {
      collectibleTimerRef.current -= collectibleIntervalSeconds;
      spawnCollectible();
    }

    enemiesRef.current = enemiesRef.current
      .map((enemy: Enemy) => integrateVelocityVerlet(enemy, dt))
      .filter((enemy: Enemy) => {
        if (enemy.x >= -50) return true;

        const latest = gameStateRef.current;
        gameStateRef.current = {
          ...latest,
          health: Math.max(0, latest.health - enemy.damage),
        };
        return false;
      });

    collectiblesRef.current = collectiblesRef.current
      .map((collectible: Collectible) => ({ ...integrateVelocityVerlet(collectible, dt), vx: -getScrollSpeedValue(upgradesRef.current) * 1.5 }))
      .filter((collectible: Collectible) => collectible.x > -50);

    bulletsRef.current = bulletsRef.current
      .map((bullet: Bullet) => integrateVelocityVerlet(bullet, dt))
      .filter((bullet: Bullet) => bullet.x < GAME_WIDTH + 50 && bullet.x > -50 && bullet.y > -50 && bullet.y < GAME_HEIGHT + 50);

    particlesRef.current = particlesRef.current
      .map((particle: Particle) => ({ ...integrateVelocityVerlet(particle, dt), life: particle.life - dt }))
      .filter((particle: Particle) => particle.life > 0);

    resolveBulletEnemyCollisions();
    resolveCollectibleCollisions();

    if (gameStateRef.current.health <= 0) {
      gameStateRef.current = {
        ...gameStateRef.current,
        status: 'gameOver',
        health: 0,
      };
    }
  };

  const shoot = (targetX: number, targetY: number) => {
    if (gameStateRef.current.status !== 'playing') return;
    if (shotCooldownRef.current > 0) return;

    const startX = PLAYER_X + 60;
    const startY = GROUND_Y - 80;
    const dx = targetX - startX;
    const dy = targetY - startY;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return;

    const speed = 15 * BASE_FPS;
    const vx = (dx / length) * speed;
    const vy = (dy / length) * speed;

    bulletsRef.current = [
      ...bulletsRef.current,
      {
        id: idCounterRef.current,
        x: startX,
        y: startY,
        prevX: startX - vx * FIXED_STEP_SECONDS,
        prevY: startY - vy * FIXED_STEP_SECONDS,
        vx,
        vy,
        ax: 0,
        ay: 0,
      },
    ];
    idCounterRef.current += 1;
    shotCooldownRef.current = getFireRateSeconds(upgradesRef.current);
    setBullets([...bulletsRef.current]);
  };

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') return;

    const rect = event.currentTarget.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;

    shoot(x, y);
  };

  const handleTouch = (event: TouchEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') return;

    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const touch = event.touches[0];
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;

    shoot(x, y);
  };

  const startGame = () => {
    const menuCoins = gameStateRef.current.coins;
    const maxHealth = getMaxHealthValue(upgradesRef.current);
    const nextState: GameState = {
      status: 'playing',
      score: 0,
      coins: menuCoins,
      artifacts: 0,
      totalCoins: menuCoins,
      health: maxHealth,
      maxHealth,
      level: 1,
      distance: 0,
    };

    gameStateRef.current = nextState;
    enemiesRef.current = [];
    collectiblesRef.current = [];
    bulletsRef.current = [];
    particlesRef.current = [];
    camelFrameRef.current = 0;
    backgroundOffsetRef.current = 0;
    spawnTimerRef.current = 0;
    collectibleTimerRef.current = 0;
    shotCooldownRef.current = 0;
    accumulatorRef.current = 0;
    lastFrameTimeRef.current = performance.now();
    syncRenderState();
  };

  const goToMenu = () => {
    gameStateRef.current = {
      ...gameStateRef.current,
      status: 'menu',
      coins: gameStateRef.current.totalCoins,
    };
    setShowUpgradePanel(false);
    syncRenderState();
  };

  const buyUpgrade = (type: keyof Upgrades) => {
    const level = upgradesRef.current[type];
    if (level >= 5) return;

    const cost = UPGRADE_COSTS[type][level];
    if (gameStateRef.current.coins < cost) return;

    const nextUpgrades = {
      ...upgradesRef.current,
      [type]: upgradesRef.current[type] + 1,
    };
    upgradesRef.current = nextUpgrades;
    setUpgrades(nextUpgrades);

    gameStateRef.current = {
      ...gameStateRef.current,
      coins: gameStateRef.current.coins - cost,
      totalCoins: gameStateRef.current.totalCoins - cost,
      maxHealth: type === 'camelHealth' ? getMaxHealthValue(nextUpgrades) : gameStateRef.current.maxHealth,
      health:
        type === 'camelHealth'
          ? Math.min(gameStateRef.current.health, getMaxHealthValue(nextUpgrades))
          : gameStateRef.current.health,
    };

    setGameState({ ...gameStateRef.current });
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (event.key !== 't' && event.key !== 'T') return;
      if (gameStateRef.current.status !== 'playing') return;
      toggleBulletTime();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const tick = (timestamp: number) => {
      if (gameStateRef.current.status !== 'playing') return;

      const deltaSeconds = Math.min((timestamp - lastFrameTimeRef.current) / 1000, MAX_FRAME_SECONDS);
      lastFrameTimeRef.current = timestamp;
      const scaledDelta = deltaSeconds * (bulletTimeActiveRef.current ? BULLET_TIME_SCALE : 1);
      accumulatorRef.current += scaledDelta;

      while (accumulatorRef.current >= FIXED_STEP_SECONDS) {
        stepSimulation();
        accumulatorRef.current -= FIXED_STEP_SECONDS;
      }

      syncRenderState();

      if (gameStateRef.current.status === 'playing') {
        animationRef.current = requestAnimationFrame(tick);
      }
    };

    if (gameState.status === 'playing') {
      lastFrameTimeRef.current = performance.now();
      animationRef.current = requestAnimationFrame(tick);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [gameState.status]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 via-orange-300 to-amber-500 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl md:text-4xl font-bold text-amber-900 mb-4 drop-shadow-lg text-center">
        🏜️ 沙丘游侠：宝藏猎手 🐪
      </h1>

      <div
        ref={gameRef}
        className={`relative w-full max-w-4xl h-64 md:h-80 lg:h-96 rounded-xl overflow-hidden shadow-2xl border-4 cursor-crosshair select-none transition-colors ${
          bulletTimeActive
            ? 'bg-gradient-to-b from-sky-300 via-cyan-200 to-slate-200 border-cyan-600'
            : 'bg-gradient-to-b from-sky-400 via-sky-300 to-amber-200 border-amber-700'
        }`}
        onClick={handleClick}
        onTouchStart={handleTouch}
        style={{ aspectRatio: '16/9', maxHeight: '500px' }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className={`absolute top-4 right-8 w-12 h-12 md:w-16 md:h-16 rounded-full shadow-lg ${
              bulletTimeActive ? 'bg-cyan-100' : 'bg-yellow-300 animate-pulse'
            }`}
          />

          <div
            className="absolute top-8 text-4xl md:text-6xl opacity-80 transition-transform"
            style={{ transform: `translateX(${(-backgroundOffset * 0.2) % 400}px)` }}
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
            style={{ transform: `translateX(${200 - (backgroundOffset * 0.5) % 500}px)` }}
          >
            🌵
          </div>
          <div
            className="absolute bottom-20 text-2xl md:text-4xl transition-transform"
            style={{ transform: `translateX(${500 - (backgroundOffset * 0.5) % 600}px)` }}
          >
            🌵
          </div>
          <div
            className="absolute bottom-16 text-xl md:text-3xl transition-transform"
            style={{ transform: `translateX(${750 - (backgroundOffset * 0.5) % 700}px)` }}
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
                <span className="text-xs">
                  {gameState.health}/{gameState.maxHealth}
                </span>
              </div>
              <div className="flex gap-2 md:gap-4">
                <span>💰 {gameState.coins}</span>
                <span>🏆 {gameState.score}</span>
                <span>⭐ {gameState.level}</span>
              </div>
              <div className="mt-1 flex gap-2 md:gap-4">
                <span>📏 {Math.floor(gameState.distance)}m</span>
                <span className={bulletTimeActive ? 'text-cyan-300 font-bold' : 'text-white/70'}>
                  ⏱️ {bulletTimeActive ? '0.3x' : '1.0x'}
                </span>
              </div>
            </div>

            <div className="flex gap-2 pointer-events-auto">
              <button
                className={`px-3 py-1 rounded-lg text-xs md:text-sm font-bold transition-colors ${
                  bulletTimeActive ? 'bg-cyan-500 hover:bg-cyan-400 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'
                }`}
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  toggleBulletTime();
                }}
              >
                T 键慢放
              </button>
              <button
                className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs md:text-sm transition-colors"
                onClick={(event: MouseEvent<HTMLButtonElement>) => {
                  event.stopPropagation();
                  goToMenu();
                }}
              >
                退出
              </button>
            </div>
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
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl md:text-3xl">🤠</div>
              <div className="absolute top-4 right-0 text-xl md:text-2xl transform -rotate-12">🔫</div>
            </div>
          </div>
        )}

        {enemies.map((enemy: Enemy) => (
          <div key={enemy.id} className="absolute" style={{ left: enemy.x, top: enemy.y - 40 }}>
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

        {collectibles.map((collectible: Collectible) => (
          <div key={collectible.id} className="absolute animate-bounce" style={{ left: collectible.x, top: collectible.y }}>
            <div className={`text-2xl md:text-3xl drop-shadow-lg ${collectible.type !== 'coin' ? 'animate-pulse' : ''}`}>
              {collectible.type === 'coin' && '🪙'}
              {collectible.type === 'artifact' && '💎'}
              {collectible.type === 'shield' && '🛡️'}
              {collectible.type === 'rapidFire' && '⚡'}
              {collectible.type === 'magnet' && '🧲'}
            </div>
          </div>
        ))}

        {bullets.map((bullet: Bullet) => (
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

        {particles.map((particle: Particle) => (
          <div
            key={particle.id}
            className="absolute w-2 h-2 rounded-full"
            style={{
              left: particle.x,
              top: particle.y,
              backgroundColor: particle.color,
              opacity: particle.life / particle.maxLife,
            }}
          />
        ))}

        {gameState.status === 'menu' && (
          <div className="absolute inset-0 bg-gradient-to-b from-amber-800/90 to-amber-900/90 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4 animate-bounce">🏜️</div>
            <h2 className="text-2xl md:text-4xl font-bold text-amber-100 mb-2 text-center px-4">沙丘游侠：宝藏猎手</h2>
            <p className="text-amber-200 text-sm md:text-base mb-4 text-center px-4">在广袤的沙漠中收集宝藏，击退土匪！</p>
            <p className="text-yellow-300 text-lg md:text-xl mb-4">💰 金币: {gameState.coins} | 💎 神器: {gameState.artifacts}</p>

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
                            {[...Array(5)].map((_, index) => (
                              <div
                                key={index}
                                className={`w-3 h-3 rounded ${index < level ? 'bg-yellow-400' : 'bg-gray-600'}`}
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
              💡 点击屏幕射击土匪 | 收集金币和道具 | 游戏中按 T 进入 0.3 倍速子弹时间
            </div>
          </div>
        )}

        {gameState.status === 'gameOver' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4">💀</div>
            <h2 className="text-2xl md:text-4xl font-bold text-red-400 mb-4">游戏结束</h2>
            <div className="bg-gray-900/80 rounded-xl p-4 mb-4 text-center">
              <p className="text-white text-lg mb-2">
                🏆 最终得分: <span className="text-yellow-400 font-bold">{gameState.score}</span>
              </p>
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
        <p className="mt-1">🛡️ 护盾恢复生命 | ⚡ 快速射击 | 🧲 磁吸金币 | ⏱️ T 键切换 0.3 倍速</p>
      </div>
    </div>
  );
}
