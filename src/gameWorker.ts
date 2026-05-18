
// 游戏常量
const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const PLAYER_X = 120;
const GROUND_Y = 380;

// 类型定义
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

// 消息类型
type WorkerMessage = 
  | { type: 'startGame'; gameState: GameState; upgrades: Upgrades }
  | { type: 'shoot'; targetX: number; targetY: number }
  | { type: 'stop' };

type MainThreadMessage = 
  | { 
      type: 'update'; 
      enemies: Enemy[]; 
      collectibles: Collectible[]; 
      bullets: Bullet[]; 
      particles: Particle[]; 
      gameState: GameState;
      camelFrame: number;
      backgroundOffset: number;
    }
  | { type: 'gameOver'; gameState: GameState };

// 游戏状态
let enemies: Enemy[] = [];
let collectibles: Collectible[] = [];
let bullets: Bullet[] = [];
let particles: Particle[] = [];
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
let idCounter = 0;
let spawnTimer = 0;
let collectibleTimer = 0;
let lastShot = 0;
let camelFrame = 0;
let backgroundOffset = 0;
let animationFrameId: number | null = null;
let lastTime = 0;

// 简单的随机数生成器（与主线程解耦）
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}
const random = seededRandom(Date.now());

const getDamage = () => 25 + upgrades.weaponDamage * 15;
const getFireRate = () => 400 - upgrades.weaponFireRate * 60;
const getSpeed = () => 2 + upgrades.camelSpeed * 0.5;

const createParticles = (x: number, y: number, color: string, count: number) => {
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
};

const spawnEnemy = () => {
  const type = random() > 0.6 ? 'motorcycle' : 'horse';
  const level = gameState.level;
  
  const baseHealth = type === 'motorcycle' ? 60 : 40;
  const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
  const baseDamage = type === 'motorcycle' ? 20 : 15;
  
  const newEnemy: Enemy = {
    id: idCounter++,
    x: GAME_WIDTH + 50,
    y: GROUND_Y - 20 - random() * 40,
    health: baseHealth + level * 10,
    maxHealth: baseHealth + level * 10,
    type,
    speed: baseSpeed + level * 0.3,
    damage: baseDamage + level * 3,
  };
  
  enemies.push(newEnemy);
};

const spawnCollectible = () => {
  const rand = random();
  let type: Collectible['type'];
  if (rand < 0.7) type = 'coin';
  else if (rand < 0.85) type = 'artifact';
  else if (rand < 0.90) type = 'shield';
  else if (rand < 0.95) type = 'rapidFire';
  else type = 'magnet';

  const newCollectible: Collectible = {
    id: idCounter++,
    x: GAME_WIDTH + 30,
    y: GROUND_Y - 60 - random() * 100,
    type,
  };
  
  collectibles.push(newCollectible);
};

const shoot = (targetX: number, targetY: number) => {
  const now = Date.now();
  if (now - lastShot < getFireRate()) return;
  if (gameState.status !== 'playing') return;
  
  lastShot = now;
  
  const startX = PLAYER_X + 60;
  const startY = GROUND_Y - 80;
  const dx = targetX - startX;
  const dy = targetY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  const speed = 15;
  
  const newBullet: Bullet = {
    id: idCounter++,
    x: startX,
    y: startY,
    vx: (dx / distance) * speed,
    vy: (dy / distance) * speed,
  };
  
  bullets.push(newBullet);
};

const gameLoop = (timestamp: number) => {
  if (gameState.status !== 'playing') return;
  
  const deltaTime = timestamp - lastTime;
  lastTime = timestamp;
  
  const speed = getSpeed();
  
  // 更新背景和骆驼动画
  backgroundOffset = (backgroundOffset + speed) % 600;
  camelFrame = (camelFrame + 0.15) % 4;
  
  // 更新距离和等级
  const newDistance = gameState.distance + speed * 0.1;
  const newLevel = Math.min(5, Math.floor(newDistance / 500) + 1);
  gameState = { ...gameState, distance: newDistance, level: newLevel };
  
  // 生成敌人
  spawnTimer += deltaTime;
  const spawnInterval = Math.max(1500 - gameState.level * 200, 600);
  if (spawnTimer > spawnInterval) {
    spawnEnemy();
    spawnTimer = 0;
  }
  
  // 生成收集物
  collectibleTimer += deltaTime;
  if (collectibleTimer > 1200) {
    spawnCollectible();
    collectibleTimer = 0;
  }
  
  // 更新子弹
  bullets = bullets
    .map(b => ({ ...b, x: b.x + b.vx, y: b.y + b.vy }))
    .filter(b => b.x < GAME_WIDTH + 50 && b.x > -50 && b.y > -50 && b.y < GAME_HEIGHT + 50);
  
  // 更新粒子
  particles = particles
    .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, life: p.life - 1 }))
    .filter(p => p.life > 0);
  
  // 更新敌人位置
  let damageToPlayer = 0;
  enemies = enemies.filter(enemy => {
    const newX = enemy.x - enemy.speed;
    if (newX < -50) {
      damageToPlayer += enemy.damage;
      return false;
    }
    enemy.x = newX;
    return true;
  });
  
  if (damageToPlayer > 0) {
    gameState = { ...gameState, health: Math.max(0, gameState.health - damageToPlayer) };
  }
  
  // 更新收集物位置
  collectibles = collectibles
    .map(c => ({ ...c, x: c.x - speed * 1.5 }))
    .filter(c => c.x > -50);
  
  // 碰撞检测 - 子弹与敌人
  const damage = getDamage();
  const remainingBullets: Bullet[] = [];
  const remainingEnemies: Enemy[] = [];
  const killedEnemyIds: number[] = [];
  
  enemies.forEach(enemy => {
    let enemyHealth = enemy.health;
    let wasHit = false;
    
    bullets.forEach(bullet => {
      if (killedEnemyIds.includes(enemy.id)) return;
      const dx = bullet.x - enemy.x;
      const dy = bullet.y - (enemy.y - 20);
      if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
        enemyHealth -= damage;
        wasHit = true;
        createParticles(bullet.x, bullet.y, '#FFD700', 5);
      }
    });
    
    if (enemyHealth <= 0) {
      killedEnemyIds.push(enemy.id);
      gameState = {
        ...gameState,
        score: gameState.score + (enemy.type === 'motorcycle' ? 50 : 30),
        coins: gameState.coins + (enemy.type === 'motorcycle' ? 15 : 10),
        totalCoins: gameState.totalCoins + (enemy.type === 'motorcycle' ? 15 : 10),
      };
      createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
    } else if (wasHit) {
      remainingEnemies.push({ ...enemy, health: enemyHealth });
    } else {
      remainingEnemies.push(enemy);
    }
  });
  
  // 过滤掉击中敌人的子弹
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
  
  enemies = remainingEnemies;
  bullets = remainingBullets;
  
  // 碰撞检测 - 收集物
  collectibles = collectibles.filter(c => {
    const dx = c.x - PLAYER_X;
    const dy = c.y - (GROUND_Y - 50);
    if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
      createParticles(c.x, c.y, c.type === 'coin' ? '#FFD700' : '#9333EA', 8);
      
      switch (c.type) {
        case 'coin':
          gameState = { ...gameState, coins: gameState.coins + 5, score: gameState.score + 5, totalCoins: gameState.totalCoins + 5 };
          break;
        case 'artifact':
          gameState = { ...gameState, artifacts: gameState.artifacts + 1, score: gameState.score + 100 };
          break;
        case 'shield':
          gameState = { ...gameState, health: Math.min(gameState.maxHealth, gameState.health + 30) };
          break;
        case 'rapidFire':
        case 'magnet':
          gameState = { ...gameState, score: gameState.score + 50 };
          break;
      }
      return false;
    }
    return true;
  });
  
  // 发送更新给主线程
  postMessage({
    type: 'update',
    enemies,
    collectibles,
    bullets,
    particles,
    gameState,
    camelFrame,
    backgroundOffset,
  } as MainThreadMessage);
  
  // 检查游戏结束
  if (gameState.health <= 0) {
    gameState = { ...gameState, status: 'gameOver' };
    postMessage({ type: 'gameOver', gameState } as MainThreadMessage);
    return;
  }
  
  animationFrameId = requestAnimationFrame(gameLoop);
};

// 处理来自主线程的消息
self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const message = e.data;
  
  switch (message.type) {
    case 'startGame':
      gameState = message.gameState;
      upgrades = message.upgrades;
      enemies = [];
      collectibles = [];
      bullets = [];
      particles = [];
      idCounter = 0;
      spawnTimer = 0;
      collectibleTimer = 0;
      lastShot = 0;
      camelFrame = 0;
      backgroundOffset = 0;
      lastTime = performance.now();
      animationFrameId = requestAnimationFrame(gameLoop);
      break;
    case 'shoot':
      shoot(message.targetX, message.targetY);
      break;
    case 'stop':
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      break;
  }
};
