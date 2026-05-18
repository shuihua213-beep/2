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

interface Upgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

interface WorkerState {
  gameState: GameState;
  enemies: Enemy[];
  collectibles: Collectible[];
  bullets: Bullet[];
  particles: Particle[];
  upgrades: Upgrades;
}

class SeededRandom {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed;
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }
}

let random = new SeededRandom(Date.now());
let idCounter = 0;
let animationFrameId: number | null = null;
let lastTime = 0;

let state: WorkerState = {
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
  enemies: [],
  collectibles: [],
  bullets: [],
  particles: [],
  upgrades: {
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  },
};

let spawnTimer = 0;
let collectibleTimer = 0;
let lastShotTime = 0;

function getDamage(): number {
  return 25 + state.upgrades.weaponDamage * 15;
}

function getFireRate(): number {
  return 400 - state.upgrades.weaponFireRate * 60;
}

function getMaxHealth(): number {
  return 100 + state.upgrades.camelHealth * 25;
}

function getSpeed(): number {
  return 2 + state.upgrades.camelSpeed * 0.5;
}

function createParticles(x: number, y: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    state.particles.push({
      id: idCounter++,
      x,
      y,
      vx: (random.next() - 0.5) * 8,
      vy: (random.next() - 0.5) * 8 - 2,
      life: 30,
      color,
    });
  }
}

function spawnEnemy(): void {
  const type = random.next() > 0.6 ? 'motorcycle' : 'horse';
  const level = state.gameState.level;

  const baseHealth = type === 'motorcycle' ? 60 : 40;
  const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
  const baseDamage = type === 'motorcycle' ? 20 : 15;

  const newEnemy: Enemy = {
    id: idCounter++,
    x: GAME_WIDTH + 50,
    y: GROUND_Y - 20 - random.next() * 40,
    health: baseHealth + level * 10,
    maxHealth: baseHealth + level * 10,
    type,
    speed: baseSpeed + level * 0.3,
    damage: baseDamage + level * 3,
  };

  state.enemies.push(newEnemy);
}

function spawnCollectible(): void {
  const rand = random.next();
  let type: Collectible['type'];
  if (rand < 0.7) type = 'coin';
  else if (rand < 0.85) type = 'artifact';
  else if (rand < 0.90) type = 'shield';
  else if (rand < 0.95) type = 'rapidFire';
  else type = 'magnet';

  state.collectibles.push({
    id: idCounter++,
    x: GAME_WIDTH + 30,
    y: GROUND_Y - 60 - random.next() * 100,
    type,
  });
}

function shoot(targetX: number, targetY: number): void {
  const now = performance.now();
  if (now - lastShotTime < getFireRate()) return;
  if (state.gameState.status !== 'playing') return;

  lastShotTime = now;

  const startX = PLAYER_X + 60;
  const startY = GROUND_Y - 80;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const speed = 15;

  state.bullets.push({
    id: idCounter++,
    x: startX,
    y: startY,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
  });
}

function gameLoop(timestamp: number): void {
  if (state.gameState.status !== 'playing') {
    animationFrameId = null;
    return;
  }

  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;

  const speed = getSpeed();

  state.gameState.distance += speed * 0.1;
  state.gameState.level = Math.min(5, Math.floor(state.gameState.distance / 500) + 1);

  spawnTimer += deltaTime;
  const spawnInterval = Math.max(1500 - state.gameState.level * 200, 600);
  if (spawnTimer > spawnInterval) {
    spawnEnemy();
    spawnTimer = 0;
  }

  collectibleTimer += deltaTime;
  if (collectibleTimer > 1200) {
    spawnCollectible();
    collectibleTimer = 0;
  }

  state.bullets = state.bullets
    .map(b => ({ ...b, x: b.x + b.vx, y: b.y + b.vy }))
    .filter(b => b.x < GAME_WIDTH + 50 && b.x > -50 && b.y > -50 && b.y < GAME_HEIGHT + 50);

  state.particles = state.particles
    .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, life: p.life - 1 }))
    .filter(p => p.life > 0);

  const remainingEnemies: Enemy[] = [];
  let damage = 0;

  for (const enemy of state.enemies) {
    const newX = enemy.x - enemy.speed;
    if (newX < -50) {
      damage += enemy.damage;
    } else {
      remainingEnemies.push({ ...enemy, x: newX });
    }
  }

  if (damage > 0) {
    state.gameState.health = Math.max(0, state.gameState.health - damage);
  }

  state.enemies = remainingEnemies;

  state.collectibles = state.collectibles
    .map(c => ({ ...c, x: c.x - speed * 1.5 }))
    .filter(c => c.x > -50);

  const damageValue = getDamage();
  const bulletsToRemove = new Set<number>();
  const enemiesToRemove = new Set<number>();
  const updatedEnemies: Enemy[] = [];

  for (const enemy of state.enemies) {
    let enemyHealth = enemy.health;
    let wasHit = false;

    for (const bullet of state.bullets) {
      if (bulletsToRemove.has(bullet.id)) continue;

      const dx = bullet.x - enemy.x;
      const dy = bullet.y - (enemy.y - 20);
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
        enemyHealth -= damageValue;
        wasHit = true;
        bulletsToRemove.add(bullet.id);
        createParticles(bullet.x, bullet.y, '#FFD700', 5);
      }
    }

    if (enemyHealth <= 0) {
      enemiesToRemove.add(enemy.id);
      state.gameState.score += enemy.type === 'motorcycle' ? 50 : 30;
      state.gameState.coins += enemy.type === 'motorcycle' ? 15 : 10;
      state.gameState.totalCoins += enemy.type === 'motorcycle' ? 15 : 10;
      createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
    } else if (wasHit) {
      updatedEnemies.push({ ...enemy, health: enemyHealth });
    } else {
      updatedEnemies.push(enemy);
    }
  }

  state.enemies = updatedEnemies;
  state.bullets = state.bullets.filter(b => !bulletsToRemove.has(b.id));

  const remainingCollectibles: Collectible[] = [];

  for (const c of state.collectibles) {
    const dx = c.x - PLAYER_X;
    const dy = c.y - (GROUND_Y - 50);
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
      createParticles(c.x, c.y, c.type === 'coin' ? '#FFD700' : '#9333EA', 8);

      switch (c.type) {
        case 'coin':
          state.gameState.coins += 5;
          state.gameState.score += 5;
          state.gameState.totalCoins += 5;
          break;
        case 'artifact':
          state.gameState.artifacts += 1;
          state.gameState.score += 100;
          break;
        case 'shield':
          state.gameState.health = Math.min(state.gameState.maxHealth, state.gameState.health + 30);
          break;
        case 'rapidFire':
        case 'magnet':
          state.gameState.score += 50;
          break;
      }
    } else {
      remainingCollectibles.push(c);
    }
  }

  state.collectibles = remainingCollectibles;

  if (state.gameState.health <= 0) {
    state.gameState.status = 'gameOver';
    postMessage({ type: 'stateUpdate', state });
    animationFrameId = null;
    return;
  }

  postMessage({ type: 'stateUpdate', state });
  animationFrameId = requestAnimationFrame(gameLoop);
}

function startGame(): void {
  random = new SeededRandom(Date.now());
  idCounter = 0;

  state = {
    gameState: {
      status: 'playing',
      score: 0,
      coins: state.gameState.coins,
      artifacts: 0,
      totalCoins: state.gameState.coins,
      health: getMaxHealth(),
      maxHealth: getMaxHealth(),
      level: 1,
      distance: 0,
    },
    enemies: [],
    collectibles: [],
    bullets: [],
    particles: [],
    upgrades: { ...state.upgrades },
  };

  spawnTimer = 0;
  collectibleTimer = 0;
  lastShotTime = 0;
  lastTime = performance.now();

  postMessage({ type: 'stateUpdate', state });

  animationFrameId = requestAnimationFrame(gameLoop);
}

function goToMenu(): void {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  state.gameState.status = 'menu';
  state.gameState.coins = state.gameState.totalCoins;
  postMessage({ type: 'stateUpdate', state });
}

function buyUpgrade(type: keyof Upgrades): void {
  const level = state.upgrades[type];
  if (level >= 5) return;

  const costs: Record<keyof Upgrades, number[]> = {
    weaponDamage: [100, 250, 500, 1000, 2000],
    weaponFireRate: [150, 300, 600, 1200, 2500],
    camelHealth: [200, 400, 800, 1600, 3200],
    camelSpeed: [100, 200, 400, 800, 1600],
  };

  const cost = costs[type][level];
  if (state.gameState.coins < cost) return;

  state.gameState.coins -= cost;
  state.gameState.totalCoins -= cost;
  state.upgrades[type] += 1;

  postMessage({ type: 'stateUpdate', state });
}

self.onmessage = (e: MessageEvent) => {
  const { type, data } = e.data;

  switch (type) {
    case 'startGame':
      startGame();
      break;
    case 'goToMenu':
      goToMenu();
      break;
    case 'buyUpgrade':
      buyUpgrade(data);
      break;
    case 'shoot':
      shoot(data.x, data.y);
      break;
    case 'setUpgrades':
      state.upgrades = data;
      postMessage({ type: 'stateUpdate', state });
      break;
  }
};