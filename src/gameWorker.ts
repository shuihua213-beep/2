export interface Enemy {
  id: number;
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  type: 'horse' | 'motorcycle';
  speed: number;
  damage: number;
}

export interface Collectible {
  id: number;
  x: number;
  y: number;
  type: 'coin' | 'artifact' | 'shield' | 'rapidFire' | 'magnet';
}

export interface Bullet {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

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

export interface GameSnapshot {
  gameState: GameState;
  upgrades: Upgrades;
  enemies: Enemy[];
  collectibles: Collectible[];
  bullets: Bullet[];
  particles: Particle[];
  camelFrame: number;
  backgroundOffset: number;
}

export type MainToWorkerMessage =
  | { type: 'tick'; timestamp: number }
  | { type: 'shoot'; x: number; y: number; timestamp: number }
  | { type: 'start' }
  | { type: 'goToMenu' }
  | { type: 'buyUpgrade'; upgradeType: keyof Upgrades };

export type WorkerToMainMessage = {
  type: 'state';
  snapshot: GameSnapshot;
};

const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const PLAYER_X = 120;
const GROUND_Y = 380;
const FRAME_MS = 1000 / 60;

const UPGRADE_COSTS: Record<keyof Upgrades, number[]> = {
  weaponDamage: [100, 250, 500, 1000, 2000],
  weaponFireRate: [150, 300, 600, 1200, 2500],
  camelHealth: [200, 400, 800, 1600, 3200],
  camelSpeed: [100, 200, 400, 800, 1600],
};

interface InternalState extends GameSnapshot {
  lastShotTime: number;
  nextId: number;
  spawnTimer: number;
  collectibleTimer: number;
  lastTickTime: number;
  randomState: number;
}

const workerScope = globalThis as unknown as {
  postMessage: (message: WorkerToMainMessage) => void;
  onmessage: ((event: MessageEvent<MainToWorkerMessage>) => void) | null;
  crypto?: Crypto;
};

const createInitialGameState = (): GameState => ({
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

const createInitialUpgrades = (): Upgrades => ({
  weaponDamage: 0,
  weaponFireRate: 0,
  camelHealth: 0,
  camelSpeed: 0,
});

const createSeed = () => {
  const cryptoObject = workerScope.crypto;
  if (cryptoObject?.getRandomValues) {
    const values = new Uint32Array(1);
    cryptoObject.getRandomValues(values);
    return values[0] || 0x12345678;
  }

  return ((Date.now() ^ Math.floor(performance.now() * 1000) ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 0x12345678;
};

const state: InternalState = {
  gameState: createInitialGameState(),
  upgrades: createInitialUpgrades(),
  enemies: [],
  collectibles: [],
  bullets: [],
  particles: [],
  camelFrame: 0,
  backgroundOffset: 0,
  lastShotTime: Number.NEGATIVE_INFINITY,
  nextId: 1,
  spawnTimer: 0,
  collectibleTimer: 0,
  lastTickTime: 0,
  randomState: createSeed(),
};

const nextRandom = () => {
  state.randomState = (state.randomState + 0x6d2b79f5) >>> 0;
  let t = state.randomState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const getDamage = () => 25 + state.upgrades.weaponDamage * 15;
const getFireRate = () => 400 - state.upgrades.weaponFireRate * 60;
const getMaxHealth = () => 100 + state.upgrades.camelHealth * 25;
const getSpeed = () => 2 + state.upgrades.camelSpeed * 0.5;

const emitState = () => {
  workerScope.postMessage({
    type: 'state',
    snapshot: {
      gameState: { ...state.gameState },
      upgrades: { ...state.upgrades },
      enemies: state.enemies,
      collectibles: state.collectibles,
      bullets: state.bullets,
      particles: state.particles,
      camelFrame: state.camelFrame,
      backgroundOffset: state.backgroundOffset,
    },
  });
};

const createParticles = (x: number, y: number, color: string, count: number) => {
  const particles: Particle[] = [];

  for (let index = 0; index < count; index += 1) {
    particles.push({
      id: state.nextId,
      x,
      y,
      vx: (nextRandom() - 0.5) * 8,
      vy: (nextRandom() - 0.5) * 8 - 2,
      life: 30,
      color,
    });
    state.nextId += 1;
  }

  state.particles = [...state.particles, ...particles];
};

const spawnEnemy = () => {
  const type: Enemy['type'] = nextRandom() > 0.6 ? 'motorcycle' : 'horse';
  const level = state.gameState.level;
  const baseHealth = type === 'motorcycle' ? 60 : 40;
  const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
  const baseDamage = type === 'motorcycle' ? 20 : 15;

  state.enemies = [
    ...state.enemies,
    {
      id: state.nextId,
      x: GAME_WIDTH + 50,
      y: GROUND_Y - 20 - nextRandom() * 40,
      health: baseHealth + level * 10,
      maxHealth: baseHealth + level * 10,
      type,
      speed: baseSpeed + level * 0.3,
      damage: baseDamage + level * 3,
    },
  ];

  state.nextId += 1;
};

const spawnCollectible = () => {
  const roll = nextRandom();
  let type: Collectible['type'];

  if (roll < 0.7) type = 'coin';
  else if (roll < 0.85) type = 'artifact';
  else if (roll < 0.9) type = 'shield';
  else if (roll < 0.95) type = 'rapidFire';
  else type = 'magnet';

  state.collectibles = [
    ...state.collectibles,
    {
      id: state.nextId,
      x: GAME_WIDTH + 30,
      y: GROUND_Y - 60 - nextRandom() * 100,
      type,
    },
  ];

  state.nextId += 1;
};

const resetRunState = (coins: number) => {
  state.gameState = {
    status: 'playing',
    score: 0,
    coins,
    artifacts: 0,
    totalCoins: coins,
    health: getMaxHealth(),
    maxHealth: getMaxHealth(),
    level: 1,
    distance: 0,
  };
  state.enemies = [];
  state.collectibles = [];
  state.bullets = [];
  state.particles = [];
  state.camelFrame = 0;
  state.backgroundOffset = 0;
  state.lastShotTime = Number.NEGATIVE_INFINITY;
  state.spawnTimer = 0;
  state.collectibleTimer = 0;
  state.lastTickTime = 0;
};

const startGame = () => {
  resetRunState(state.gameState.coins);
  emitState();
};

const goToMenu = () => {
  state.gameState = {
    ...state.gameState,
    status: 'menu',
    coins: state.gameState.totalCoins,
  };
  state.lastTickTime = 0;
  emitState();
};

const buyUpgrade = (upgradeType: keyof Upgrades) => {
  const currentLevel = state.upgrades[upgradeType];
  if (currentLevel >= 5) {
    return;
  }

  const cost = UPGRADE_COSTS[upgradeType][currentLevel];
  if (state.gameState.coins < cost) {
    return;
  }

  state.upgrades = {
    ...state.upgrades,
    [upgradeType]: currentLevel + 1,
  };
  state.gameState = {
    ...state.gameState,
    coins: state.gameState.coins - cost,
    totalCoins: state.gameState.totalCoins - cost,
  };

  emitState();
};

const shoot = (targetX: number, targetY: number, timestamp: number) => {
  if (state.gameState.status !== 'playing') {
    return;
  }

  if (timestamp - state.lastShotTime < getFireRate()) {
    return;
  }

  const startX = PLAYER_X + 60;
  const startY = GROUND_Y - 80;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const distance = Math.hypot(dx, dy) || 1;
  const speed = 15;

  state.lastShotTime = timestamp;
  state.bullets = [
    ...state.bullets,
    {
      id: state.nextId,
      x: startX,
      y: startY,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
    },
  ];
  state.nextId += 1;

  emitState();
};

const resolveBulletCollisions = () => {
  const bulletDamage = getDamage();
  const projectedHealth = new Map<number, number>();
  const remainingBullets: Bullet[] = [];

  for (const enemy of state.enemies) {
    projectedHealth.set(enemy.id, enemy.health);
  }

  for (const bullet of state.bullets) {
    let didHit = false;

    for (const enemy of state.enemies) {
      const currentHealth = projectedHealth.get(enemy.id) ?? 0;
      if (currentHealth <= 0) {
        continue;
      }

      const dx = bullet.x - enemy.x;
      const dy = bullet.y - (enemy.y - 20);
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
        projectedHealth.set(enemy.id, currentHealth - bulletDamage);
        createParticles(bullet.x, bullet.y, '#FFD700', 5);
        didHit = true;
        break;
      }
    }

    if (!didHit) {
      remainingBullets.push(bullet);
    }
  }

  state.bullets = remainingBullets;
  state.enemies = state.enemies.flatMap((enemy) => {
    const nextHealth = projectedHealth.get(enemy.id) ?? enemy.health;

    if (nextHealth <= 0) {
      const reward = enemy.type === 'motorcycle' ? 15 : 10;
      const score = enemy.type === 'motorcycle' ? 50 : 30;
      state.gameState = {
        ...state.gameState,
        score: state.gameState.score + score,
        coins: state.gameState.coins + reward,
        totalCoins: state.gameState.totalCoins + reward,
      };
      createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
      return [];
    }

    if (nextHealth !== enemy.health) {
      return [{ ...enemy, health: nextHealth }];
    }

    return [enemy];
  });
};

const resolveCollectibles = () => {
  const remainingCollectibles: Collectible[] = [];

  for (const collectible of state.collectibles) {
    const dx = collectible.x - PLAYER_X;
    const dy = collectible.y - (GROUND_Y - 50);

    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
      createParticles(collectible.x, collectible.y, collectible.type === 'coin' ? '#FFD700' : '#9333EA', 8);

      switch (collectible.type) {
        case 'coin':
          state.gameState = {
            ...state.gameState,
            coins: state.gameState.coins + 5,
            score: state.gameState.score + 5,
            totalCoins: state.gameState.totalCoins + 5,
          };
          break;
        case 'artifact':
          state.gameState = {
            ...state.gameState,
            artifacts: state.gameState.artifacts + 1,
            score: state.gameState.score + 100,
          };
          break;
        case 'shield':
          state.gameState = {
            ...state.gameState,
            health: Math.min(state.gameState.maxHealth, state.gameState.health + 30),
          };
          break;
        case 'rapidFire':
        case 'magnet':
          state.gameState = {
            ...state.gameState,
            score: state.gameState.score + 50,
          };
          break;
      }
    } else {
      remainingCollectibles.push(collectible);
    }
  }

  state.collectibles = remainingCollectibles;
};

const updateGame = (timestamp: number) => {
  if (state.gameState.status !== 'playing') {
    state.lastTickTime = timestamp;
    return;
  }

  if (state.lastTickTime === 0) {
    state.lastTickTime = timestamp;
    emitState();
    return;
  }

  const deltaTime = Math.min(Math.max(timestamp - state.lastTickTime, 0), 48);
  state.lastTickTime = timestamp;

  if (deltaTime === 0) {
    return;
  }

  const frameScale = deltaTime / FRAME_MS;
  const speed = getSpeed();

  state.backgroundOffset = (state.backgroundOffset + speed * frameScale) % 600;
  state.camelFrame = (state.camelFrame + 0.15 * frameScale) % 4;

  const distance = state.gameState.distance + speed * 0.1 * frameScale;
  state.gameState = {
    ...state.gameState,
    distance,
    level: Math.min(5, Math.floor(distance / 500) + 1),
  };

  state.spawnTimer += deltaTime;
  const spawnInterval = Math.max(1500 - state.gameState.level * 200, 600);
  while (state.spawnTimer >= spawnInterval) {
    spawnEnemy();
    state.spawnTimer -= spawnInterval;
  }

  state.collectibleTimer += deltaTime;
  while (state.collectibleTimer >= 1200) {
    spawnCollectible();
    state.collectibleTimer -= 1200;
  }

  state.bullets = state.bullets
    .map((bullet) => ({
      ...bullet,
      x: bullet.x + bullet.vx * frameScale,
      y: bullet.y + bullet.vy * frameScale,
    }))
    .filter((bullet) => bullet.x < GAME_WIDTH + 50 && bullet.x > -50 && bullet.y > -50 && bullet.y < GAME_HEIGHT + 50);

  state.particles = state.particles
    .map((particle) => {
      const nextVy = particle.vy + 0.3 * frameScale;
      return {
        ...particle,
        x: particle.x + particle.vx * frameScale,
        y: particle.y + nextVy * frameScale,
        vy: nextVy,
        life: particle.life - frameScale,
      };
    })
    .filter((particle) => particle.life > 0);

  let escapedDamage = 0;
  state.enemies = state.enemies.flatMap((enemy) => {
    const nextX = enemy.x - enemy.speed * frameScale;
    if (nextX < -50) {
      escapedDamage += enemy.damage;
      return [];
    }

    return [{ ...enemy, x: nextX }];
  });

  if (escapedDamage > 0) {
    state.gameState = {
      ...state.gameState,
      health: Math.max(0, state.gameState.health - escapedDamage),
    };
  }

  state.collectibles = state.collectibles
    .map((collectible) => ({
      ...collectible,
      x: collectible.x - speed * 1.5 * frameScale,
    }))
    .filter((collectible) => collectible.x > -50);

  resolveBulletCollisions();
  resolveCollectibles();

  if (state.gameState.health <= 0) {
    state.gameState = {
      ...state.gameState,
      status: 'gameOver',
      health: 0,
    };
    state.lastTickTime = 0;
  }

  emitState();
};

workerScope.onmessage = (event) => {
  const message = event.data;

  switch (message.type) {
    case 'tick':
      updateGame(message.timestamp);
      break;
    case 'shoot':
      shoot(message.x, message.y, message.timestamp);
      break;
    case 'start':
      startGame();
      break;
    case 'goToMenu':
      goToMenu();
      break;
    case 'buyUpgrade':
      buyUpgrade(message.upgradeType);
      break;
  }
};

emitState();
