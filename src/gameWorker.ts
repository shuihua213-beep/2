import { Enemy, Collectible, Bullet, Particle, GameState, Upgrades, GAME_WIDTH, GAME_HEIGHT, PLAYER_X, GROUND_Y } from './gameTypes';

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

let upgrades: Upgrades = {
  weaponDamage: 0,
  weaponFireRate: 0,
  camelHealth: 0,
  camelSpeed: 0,
};

let enemies: Enemy[] = [];
let collectibles: Collectible[] = [];
let bullets: Bullet[] = [];
let particles: Particle[] = [];
let camelFrame = 0;
let backgroundOffset = 0;

let lastTime = 0;
let lastShotTime = 0;
let idCounter = 0;
let spawnTimer = 0;
let collectibleTimer = 0;

const getDamage = () => 25 + upgrades.weaponDamage * 15;
const getFireRate = () => 400 - upgrades.weaponFireRate * 60;
const getMaxHealth = () => 100 + upgrades.camelHealth * 25;
const getSpeed = () => 2 + upgrades.camelSpeed * 0.5;

const createParticles = (x: number, y: number, color: string, count: number) => {
  for (let i = 0; i < count; i++) {
    particles.push({
      id: idCounter++,
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      life: 30,
      color,
    });
  }
};

const spawnEnemy = () => {
  const type = Math.random() > 0.6 ? 'motorcycle' : 'horse';
  const level = gameState.level;
  
  const baseHealth = type === 'motorcycle' ? 60 : 40;
  const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
  const baseDamage = type === 'motorcycle' ? 20 : 15;
  
  enemies.push({
    id: idCounter++,
    x: GAME_WIDTH + 50,
    y: GROUND_Y - 20 - Math.random() * 40,
    health: baseHealth + level * 10,
    maxHealth: baseHealth + level * 10,
    type,
    speed: baseSpeed + level * 0.3,
    damage: baseDamage + level * 3,
  });
};

const spawnCollectible = () => {
  const rand = Math.random();
  let type: Collectible['type'];
  if (rand < 0.7) type = 'coin';
  else if (rand < 0.85) type = 'artifact';
  else if (rand < 0.90) type = 'shield';
  else if (rand < 0.95) type = 'rapidFire';
  else type = 'magnet';

  collectibles.push({
    id: idCounter++,
    x: GAME_WIDTH + 30,
    y: GROUND_Y - 60 - Math.random() * 100,
    type,
  });
};

self.onmessage = (e) => {
  const { type, payload } = e.data;

  if (type === 'START_GAME') {
    upgrades = payload.upgrades;
    gameState = {
      status: 'playing',
      score: 0,
      coins: payload.coins,
      artifacts: 0,
      totalCoins: payload.coins,
      health: getMaxHealth(),
      maxHealth: getMaxHealth(),
      level: 1,
      distance: 0,
    };
    enemies = [];
    collectibles = [];
    bullets = [];
    particles = [];
    spawnTimer = 0;
    collectibleTimer = 0;
    lastTime = payload.timestamp;
    
    sendState();
  } else if (type === 'STOP_GAME') {
    gameState.status = 'menu';
  } else if (type === 'SHOOT') {
    if (gameState.status !== 'playing') return;
    const now = payload.timestamp;
    if (now - lastShotTime < getFireRate()) return;
    lastShotTime = now;
    
    const startX = PLAYER_X + 60;
    const startY = GROUND_Y - 80;
    const dx = payload.targetX - startX;
    const dy = payload.targetY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const speed = 15;
    
    bullets.push({
      id: idCounter++,
      x: startX,
      y: startY,
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed,
    });
  } else if (type === 'TICK') {
    if (gameState.status !== 'playing') {
      self.postMessage({ type: 'SYNC_BUSY_FALSE' });
      return;
    }
    
    const timestamp = payload.timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;
    
    updateGame(deltaTime);
    sendState();
  }
};

function updateGame(deltaTime: number) {
  const speed = getSpeed();
  
  backgroundOffset = (backgroundOffset + speed) % 600;
  camelFrame = (camelFrame + 0.15) % 4;
  
  gameState.distance += speed * 0.1;
  gameState.level = Math.min(5, Math.floor(gameState.distance / 500) + 1);
  
  spawnTimer += deltaTime;
  const spawnInterval = Math.max(1500 - gameState.level * 200, 600);
  if (spawnTimer > spawnInterval) {
    spawnEnemy();
    spawnTimer = 0;
  }
  
  collectibleTimer += deltaTime;
  if (collectibleTimer > 1200) {
    spawnCollectible();
    collectibleTimer = 0;
  }
  
  bullets = bullets
    .map(b => ({ ...b, x: b.x + b.vx, y: b.y + b.vy }))
    .filter(b => b.x < GAME_WIDTH + 50 && b.x > -50 && b.y > -50 && b.y < GAME_HEIGHT + 50);
    
  particles = particles
    .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, life: p.life - 1 }))
    .filter(p => p.life > 0);
    
  let damageToPlayer = 0;
  enemies = enemies.map(enemy => {
    const newX = enemy.x - enemy.speed;
    if (newX < -50) {
      damageToPlayer += enemy.damage;
      return null;
    }
    return { ...enemy, x: newX };
  }).filter(Boolean) as Enemy[];
  
  if (damageToPlayer > 0) {
    gameState.health = Math.max(0, gameState.health - damageToPlayer);
  }
  
  collectibles = collectibles
    .map(c => ({ ...c, x: c.x - speed * 1.5 }))
    .filter(c => c.x > -50);
    
  const damage = getDamage();
  const remainingBullets: Bullet[] = [];
  const killedEnemyIds = new Set<number>();
  
  enemies.forEach(enemy => {
    let wasHit = false;
    bullets.forEach(bullet => {
      if (killedEnemyIds.has(enemy.id)) return;
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - (enemy.y - 20);
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
        enemy.health -= damage;
        wasHit = true;
        createParticles(bullet.x, bullet.y, '#FFD700', 5);
      }
    });
    
    if (enemy.health <= 0) {
      killedEnemyIds.add(enemy.id);
      gameState.score += (enemy.type === 'motorcycle' ? 50 : 30);
      gameState.coins += (enemy.type === 'motorcycle' ? 15 : 10);
      gameState.totalCoins += (enemy.type === 'motorcycle' ? 15 : 10);
      createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
    }
  });
  
  enemies = enemies.filter(enemy => !killedEnemyIds.has(enemy.id));
  
  bullets.forEach(bullet => {
    let hit = false;
    enemies.forEach(enemy => {
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - (enemy.y - 20);
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
        hit = true;
      }
    });
    if (!hit) remainingBullets.push(bullet);
  });
  bullets = remainingBullets;
  
  const remainingCollectibles: Collectible[] = [];
  collectibles.forEach(c => {
    const dx = c.x - PLAYER_X;
    const dy = c.y - (GROUND_Y - 50);
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
      createParticles(c.x, c.y, c.type === 'coin' ? '#FFD700' : '#9333EA', 8);
      
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
    } else {
      remainingCollectibles.push(c);
    }
  });
  collectibles = remainingCollectibles;
  
  if (gameState.health <= 0) {
    gameState.status = 'gameOver';
  }
}

function sendState() {
  self.postMessage({
    type: 'STATE_UPDATE',
    payload: {
      gameState,
      enemies,
      collectibles,
      bullets,
      particles,
      backgroundOffset,
      camelFrame
    }
  });
}
