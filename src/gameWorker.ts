import type {
  Enemy,
  Collectible,
  Bullet,
  Particle,
  GameState,
  ComputedValues,
  MainToWorkerMessage,
  WorkerToMainMessage,
} from './gameTypes';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_X, GROUND_Y } from './gameTypes';

function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let random: () => number = mulberry32(Date.now() ^ 0xdeadbeef);

let computed: ComputedValues = { damage: 25, fireRate: 400, maxHealth: 100, speed: 2 };

let gameState: GameState = {
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

let enemies: Enemy[] = [];
let collectibles: Collectible[] = [];
let bullets: Bullet[] = [];
let particles: Particle[] = [];
let backgroundOffset = 0;
let camelFrame = 0;

let idCounter = 0;
let spawnTimer = 0;
let collectibleTimer = 0;
let lastShotTime = 0;
let lastTickTime = 0;
let intervalId: ReturnType<typeof setInterval> | null = null;

function createParticles(x: number, y: number, color: string, count: number): void {
  for (let i = 0; i < count; i++) {
    particles.push({
      id: idCounter++,
      x,
      y,
      vx: (random() - 0.5) * 8,
      vy: (random() - 0.5) * 8 - 2,
      life: 30,
      color,
    });
  }
}

function spawnEnemy(): void {
  const type: Enemy['type'] = random() > 0.6 ? 'motorcycle' : 'horse';
  const level = gameState.level;

  const baseHealth = type === 'motorcycle' ? 60 : 40;
  const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
  const baseDamage = type === 'motorcycle' ? 20 : 15;

  enemies.push({
    id: idCounter++,
    x: GAME_WIDTH + 50,
    y: GROUND_Y - 20 - random() * 40,
    health: baseHealth + level * 10,
    maxHealth: baseHealth + level * 10,
    type,
    speed: baseSpeed + level * 0.3,
    damage: baseDamage + level * 3,
  });
}

function spawnCollectible(): void {
  const rand = random();
  let type: Collectible['type'];
  if (rand < 0.7) type = 'coin';
  else if (rand < 0.85) type = 'artifact';
  else if (rand < 0.9) type = 'shield';
  else if (rand < 0.95) type = 'rapidFire';
  else type = 'magnet';

  collectibles.push({
    id: idCounter++,
    x: GAME_WIDTH + 30,
    y: GROUND_Y - 60 - random() * 100,
    type,
  });
}

function handleShoot(targetX: number, targetY: number): void {
  const now = performance.now();
  if (now - lastShotTime < computed.fireRate) return;
  lastShotTime = now;

  const startX = PLAYER_X + 60;
  const startY = GROUND_Y - 80;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const speed = 15;

  bullets.push({
    id: idCounter++,
    x: startX,
    y: startY,
    vx: (dx / dist) * speed,
    vy: (dy / dist) * speed,
  });
}

function tick(deltaTime: number): void {
  if (gameState.status !== 'playing') return;

  const dt = Math.min(deltaTime, 50);

  backgroundOffset = (backgroundOffset + computed.speed) % 600;
  camelFrame = (camelFrame + 0.15) % 4;

  gameState.distance += computed.speed * 0.1;
  gameState.level = Math.min(5, Math.floor(gameState.distance / 500) + 1);

  spawnTimer += dt;
  const spawnInterval = Math.max(1500 - gameState.level * 200, 600);
  if (spawnTimer > spawnInterval) {
    spawnEnemy();
    spawnTimer = 0;
  }

  collectibleTimer += dt;
  if (collectibleTimer > 1200) {
    spawnCollectible();
    collectibleTimer = 0;
  }

  bullets = bullets
    .map((b) => ({ ...b, x: b.x + b.vx, y: b.y + b.vy }))
    .filter((b) => b.x < GAME_WIDTH + 50 && b.x > -50 && b.y > -50 && b.y < GAME_HEIGHT + 50);

  particles = particles
    .map((p) => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, life: p.life - 1 }))
    .filter((p) => p.life > 0);

  let playerDamage = 0;
  const remainingEnemies: Enemy[] = [];

  for (const enemy of enemies) {
    const newX = enemy.x - enemy.speed;
    if (newX < -50) {
      playerDamage += enemy.damage;
    } else {
      remainingEnemies.push({ ...enemy, x: newX });
    }
  }
  enemies = remainingEnemies;

  if (playerDamage > 0) {
    gameState.health = Math.max(0, gameState.health - playerDamage);
  }

  collectibles = collectibles
    .map((c) => ({ ...c, x: c.x - computed.speed * 1.5 }))
    .filter((c) => c.x > -50);

  const hitBulletIndices = new Set<number>();
  const killedEnemyIndices = new Set<number>();

  for (let ei = 0; ei < enemies.length; ei++) {
    const enemy = enemies[ei];

    for (let bi = 0; bi < bullets.length; bi++) {
      if (hitBulletIndices.has(bi)) continue;
      const bullet = bullets[bi];
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - (enemy.y - 20);
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
        enemy.health -= computed.damage;
        hitBulletIndices.add(bi);
        createParticles(bullet.x, bullet.y, '#FFD700', 5);
      }
    }

    if (enemy.health <= 0) {
      killedEnemyIndices.add(ei);
      gameState.score += enemy.type === 'motorcycle' ? 50 : 30;
      gameState.coins += enemy.type === 'motorcycle' ? 15 : 10;
      gameState.totalCoins += enemy.type === 'motorcycle' ? 15 : 10;
      createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
    }
  }

  enemies = enemies.filter((_, i) => !killedEnemyIndices.has(i));
  bullets = bullets.filter((_, i) => !hitBulletIndices.has(i));

  const collectedIndices = new Set<number>();
  for (let ci = 0; ci < collectibles.length; ci++) {
    const c = collectibles[ci];
    const dx = c.x - PLAYER_X;
    const dy = c.y - (GROUND_Y - 50);
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
      createParticles(c.x, c.y, c.type === 'coin' ? '#FFD700' : '#9333EA', 8);
      collectedIndices.add(ci);

      switch (c.type) {
        case 'coin':
          gameState.coins += 5;
          gameState.score += 5;
          gameState.totalCoins += 5;
          break;
        case 'artifact':
          gameState.artifacts += 1;
          gameState.score += 100;
          break;
        case 'shield':
          gameState.health = Math.min(gameState.maxHealth, gameState.health + 30);
          break;
        case 'rapidFire':
        case 'magnet':
          gameState.score += 50;
          break;
      }
    }
  }
  collectibles = collectibles.filter((_, i) => !collectedIndices.has(i));

  if (gameState.health <= 0) {
    gameState.status = 'gameOver';
  }
}

function sendState(): void {
  const message: WorkerToMainMessage = {
    gameState: { ...gameState },
    enemies: enemies.map((e) => ({ ...e })),
    collectibles: collectibles.map((c) => ({ ...c })),
    bullets: bullets.map((b) => ({ ...b })),
    particles: particles.map((p) => ({ ...p })),
    backgroundOffset,
    camelFrame,
  };
  self.postMessage(message);
}

function startLoop(): void {
  if (intervalId !== null) return;
  lastTickTime = performance.now();
  intervalId = setInterval(() => {
    const now = performance.now();
    const deltaTime = now - lastTickTime;
    lastTickTime = now;
    tick(deltaTime);
    sendState();
    if (gameState.status === 'gameOver') {
      sendState();
      stopLoop();
    }
  }, 16);
}

function stopLoop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

function resetGame(initialCoins: number): void {
  random = mulberry32(Date.now() ^ (Math.random() * 0xffffffff));
  idCounter = 0;
  spawnTimer = 0;
  collectibleTimer = 0;
  lastShotTime = 0;
  lastTickTime = 0;
  enemies = [];
  collectibles = [];
  bullets = [];
  particles = [];
  backgroundOffset = 0;
  camelFrame = 0;
  gameState = {
    status: 'playing',
    score: 0,
    coins: initialCoins,
    artifacts: 0,
    totalCoins: initialCoins,
    health: computed.maxHealth,
    maxHealth: computed.maxHealth,
    level: 1,
    distance: 0,
  };
}

self.onmessage = (e: MessageEvent<MainToWorkerMessage>) => {
  const msg = e.data;

  switch (msg.type) {
    case 'start':
      stopLoop();
      computed = { ...msg.computed };
      resetGame(msg.initialCoins);
      sendState();
      startLoop();
      break;

    case 'stop':
      stopLoop();
      gameState.status = 'menu';
      sendState();
      break;

    case 'shoot':
      handleShoot(msg.targetX, msg.targetY);
      break;

    case 'setComputed':
      computed = { ...msg.computed };
      break;
  }
};