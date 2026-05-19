import { produce } from 'immer';

const GAME_WIDTH = 900;
const GAME_HEIGHT = 500;
const PLAYER_X = 120;
const GROUND_Y = 380;

export const MAX_HISTORY_STEPS = 50;

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

export interface AppState {
  gameState: GameState;
  upgrades: Upgrades;
  enemies: Enemy[];
  collectibles: Collectible[];
  bullets: Bullet[];
  particles: Particle[];
  camelFrame: number;
  backgroundOffset: number;
  showUpgradePanel: boolean;
  idCounter: number;
  spawnTimer: number;
  collectibleTimer: number;
}

export interface HistoryState {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

export type AppAction =
  | { type: 'START_GAME' }
  | { type: 'GO_TO_MENU' }
  | { type: 'TOGGLE_UPGRADE_PANEL' }
  | { type: 'BUY_UPGRADE'; upgradeType: keyof Upgrades }
  | { type: 'SHOOT'; targetX: number; targetY: number }
  | { type: 'TICK'; deltaTime: number }
  | { type: 'UNDO' }
  | { type: 'REDO' };

export const UPGRADE_COSTS = {
  weaponDamage: [100, 250, 500, 1000, 2000],
  weaponFireRate: [150, 300, 600, 1200, 2500],
  camelHealth: [200, 400, 800, 1600, 3200],
  camelSpeed: [100, 200, 400, 800, 1600],
};

export const UPGRADE_NAMES: Record<keyof Upgrades, string> = {
  weaponDamage: '🔫 武器伤害',
  weaponFireRate: '⚡ 射击速度',
  camelHealth: '❤️ 生命上限',
  camelSpeed: '🐪 移动速度',
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

export const createInitialAppState = (): AppState => ({
  gameState: createInitialGameState(),
  upgrades: createInitialUpgrades(),
  enemies: [],
  collectibles: [],
  bullets: [],
  particles: [],
  camelFrame: 0,
  backgroundOffset: 0,
  showUpgradePanel: false,
  idCounter: 0,
  spawnTimer: 0,
  collectibleTimer: 0,
});

export const createInitialHistoryState = (): HistoryState => ({
  past: [],
  present: createInitialAppState(),
  future: [],
});

export const getDamage = (upgrades: Upgrades) => 25 + upgrades.weaponDamage * 15;
export const getFireRate = (upgrades: Upgrades) => 400 - upgrades.weaponFireRate * 60;
const getMaxHealth = (upgrades: Upgrades) => 100 + upgrades.camelHealth * 25;
const getSpeed = (upgrades: Upgrades) => 2 + upgrades.camelSpeed * 0.5;

const getNextId = (state: AppState) => {
  const id = state.idCounter;
  state.idCounter += 1;
  return id;
};

const addParticles = (state: AppState, x: number, y: number, color: string, count: number) => {
  for (let index = 0; index < count; index += 1) {
    state.particles.push({
      id: getNextId(state),
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8 - 2,
      life: 30,
      color,
    });
  }
};

const spawnEnemy = (state: AppState) => {
  const type: Enemy['type'] = Math.random() > 0.6 ? 'motorcycle' : 'horse';
  const level = state.gameState.level;
  const baseHealth = type === 'motorcycle' ? 60 : 40;
  const baseSpeed = type === 'motorcycle' ? 3.5 : 2.5;
  const baseDamage = type === 'motorcycle' ? 20 : 15;

  state.enemies.push({
    id: getNextId(state),
    x: GAME_WIDTH + 50,
    y: GROUND_Y - 20 - Math.random() * 40,
    health: baseHealth + level * 10,
    maxHealth: baseHealth + level * 10,
    type,
    speed: baseSpeed + level * 0.3,
    damage: baseDamage + level * 3,
  });
};

const spawnCollectible = (state: AppState) => {
  const rand = Math.random();
  let type: Collectible['type'];

  if (rand < 0.7) {
    type = 'coin';
  } else if (rand < 0.85) {
    type = 'artifact';
  } else if (rand < 0.9) {
    type = 'shield';
  } else if (rand < 0.95) {
    type = 'rapidFire';
  } else {
    type = 'magnet';
  }

  state.collectibles.push({
    id: getNextId(state),
    x: GAME_WIDTH + 30,
    y: GROUND_Y - 60 - Math.random() * 100,
    type,
  });
};

const shouldRecordHistory = (action: AppAction) => action.type !== 'TOGGLE_UPGRADE_PANEL' && action.type !== 'SHOOT';

const reduceAppState = (state: AppState, action: AppAction) => produce<AppState>(state, (draft: AppState) => {
  switch (action.type) {
    case 'START_GAME': {
      const startingCoins = draft.gameState.coins;
      const maxHealth = getMaxHealth(draft.upgrades);
      draft.gameState = {
        status: 'playing',
        score: 0,
        coins: startingCoins,
        artifacts: 0,
        totalCoins: startingCoins,
        health: maxHealth,
        maxHealth,
        level: 1,
        distance: 0,
      };
      draft.enemies = [];
      draft.collectibles = [];
      draft.bullets = [];
      draft.particles = [];
      draft.camelFrame = 0;
      draft.backgroundOffset = 0;
      draft.showUpgradePanel = false;
      draft.spawnTimer = 0;
      draft.collectibleTimer = 0;
      return;
    }
    case 'GO_TO_MENU': {
      draft.gameState.status = 'menu';
      draft.gameState.coins = draft.gameState.totalCoins;
      draft.enemies = [];
      draft.collectibles = [];
      draft.bullets = [];
      draft.particles = [];
      draft.showUpgradePanel = false;
      draft.spawnTimer = 0;
      draft.collectibleTimer = 0;
      return;
    }
    case 'TOGGLE_UPGRADE_PANEL': {
      draft.showUpgradePanel = !draft.showUpgradePanel;
      return;
    }
    case 'BUY_UPGRADE': {
      const level = draft.upgrades[action.upgradeType];
      if (level >= 5) {
        return;
      }

      const cost = UPGRADE_COSTS[action.upgradeType][level];
      if (draft.gameState.coins < cost) {
        return;
      }

      draft.gameState.coins -= cost;
      draft.gameState.totalCoins -= cost;
      draft.upgrades[action.upgradeType] += 1;
      return;
    }
    case 'SHOOT': {
      if (draft.gameState.status !== 'playing') {
        return;
      }

      const startX = PLAYER_X + 60;
      const startY = GROUND_Y - 80;
      const dx = action.targetX - startX;
      const dy = action.targetY - startY;
      const distance = Math.hypot(dx, dy);
      if (distance === 0) {
        return;
      }

      const speed = 15;
      draft.bullets.push({
        id: getNextId(draft),
        x: startX,
        y: startY,
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
      });
      return;
    }
    case 'TICK': {
      if (draft.gameState.status !== 'playing') {
        return;
      }

      const speed = getSpeed(draft.upgrades);
      draft.backgroundOffset = (draft.backgroundOffset + speed) % 600;
      draft.camelFrame = (draft.camelFrame + 0.15) % 4;
      draft.gameState.distance += speed * 0.1;
      draft.gameState.level = Math.min(5, Math.floor(draft.gameState.distance / 500) + 1);

      draft.spawnTimer += action.deltaTime;
      const spawnInterval = Math.max(1500 - draft.gameState.level * 200, 600);
      if (draft.spawnTimer > spawnInterval) {
        spawnEnemy(draft);
        draft.spawnTimer = 0;
      }

      draft.collectibleTimer += action.deltaTime;
      if (draft.collectibleTimer > 1200) {
        spawnCollectible(draft);
        draft.collectibleTimer = 0;
      }

      draft.bullets = draft.bullets
        .map((bullet: Bullet) => ({
          ...bullet,
          x: bullet.x + bullet.vx,
          y: bullet.y + bullet.vy,
        }))
        .filter((bullet: Bullet) => bullet.x < GAME_WIDTH + 50 && bullet.x > -50 && bullet.y > -50 && bullet.y < GAME_HEIGHT + 50);

      draft.particles = draft.particles
        .map((particle: Particle) => ({
          ...particle,
          x: particle.x + particle.vx,
          y: particle.y + particle.vy,
          vy: particle.vy + 0.3,
          life: particle.life - 1,
        }))
        .filter((particle: Particle) => particle.life > 0);

      let escapedDamage = 0;
      draft.enemies = draft.enemies.reduce((remaining: Enemy[], enemy: Enemy) => {
        const newX = enemy.x - enemy.speed;
        if (newX < -50) {
          escapedDamage += enemy.damage;
          return remaining;
        }

        remaining.push({ ...enemy, x: newX });
        return remaining;
      }, []);

      if (escapedDamage > 0) {
        draft.gameState.health = Math.max(0, draft.gameState.health - escapedDamage);
      }

      draft.collectibles = draft.collectibles
        .map((collectible: Collectible) => ({
          ...collectible,
          x: collectible.x - speed * 1.5,
        }))
        .filter((collectible: Collectible) => collectible.x > -50);

      const damage = getDamage(draft.upgrades);
      const hitBulletIds = new Set<number>();
      const remainingEnemies: Enemy[] = [];

      for (const enemy of draft.enemies) {
        let enemyHealth = enemy.health;
        let wasHit = false;

        for (const bullet of draft.bullets) {
          if (hitBulletIds.has(bullet.id)) {
            continue;
          }

          const dx = bullet.x - enemy.x;
          const dy = bullet.y - (enemy.y - 20);
          if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
            enemyHealth -= damage;
            wasHit = true;
            hitBulletIds.add(bullet.id);
            addParticles(draft, bullet.x, bullet.y, '#FFD700', 5);
          }
        }

        if (enemyHealth <= 0) {
          const reward = enemy.type === 'motorcycle' ? 15 : 10;
          draft.gameState.score += enemy.type === 'motorcycle' ? 50 : 30;
          draft.gameState.coins += reward;
          draft.gameState.totalCoins += reward;
          addParticles(draft, enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
        } else if (wasHit) {
          remainingEnemies.push({ ...enemy, health: enemyHealth });
        } else {
          remainingEnemies.push(enemy);
        }
      }

      draft.enemies = remainingEnemies;
      draft.bullets = draft.bullets.filter((bullet: Bullet) => !hitBulletIds.has(bullet.id));

      const remainingCollectibles: Collectible[] = [];
      for (const collectible of draft.collectibles) {
        const dx = collectible.x - PLAYER_X;
        const dy = collectible.y - (GROUND_Y - 50);
        if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
          addParticles(draft, collectible.x, collectible.y, collectible.type === 'coin' ? '#FFD700' : '#9333EA', 8);
          switch (collectible.type) {
            case 'coin':
              draft.gameState.coins += 5;
              draft.gameState.score += 5;
              draft.gameState.totalCoins += 5;
              break;
            case 'artifact':
              draft.gameState.artifacts += 1;
              draft.gameState.score += 100;
              break;
            case 'shield':
              draft.gameState.health = Math.min(draft.gameState.maxHealth, draft.gameState.health + 30);
              break;
            case 'rapidFire':
            case 'magnet':
              draft.gameState.score += 50;
              break;
          }
        } else {
          remainingCollectibles.push(collectible);
        }
      }

      draft.collectibles = remainingCollectibles;

      if (draft.gameState.health <= 0) {
        draft.gameState.status = 'gameOver';
      }
      return;
    }
    case 'UNDO':
    case 'REDO': {
      return;
    }
  }
});

export const historyReducer = (state: HistoryState, action: AppAction): HistoryState => {
  if (action.type === 'UNDO') {
    const previous = state.past[state.past.length - 1];
    if (!previous) {
      return state;
    }

    return {
      past: state.past.slice(0, -1),
      present: previous,
      future: [state.present, ...state.future],
    };
  }

  if (action.type === 'REDO') {
    const next = state.future[0];
    if (!next) {
      return state;
    }

    return {
      past: [...state.past, state.present].slice(-MAX_HISTORY_STEPS),
      present: next,
      future: state.future.slice(1),
    };
  }

  const nextPresent = reduceAppState(state.present, action);
  if (nextPresent === state.present) {
    return state;
  }

  if (!shouldRecordHistory(action)) {
    return {
      ...state,
      present: nextPresent,
    };
  }

  return {
    past: [...state.past, state.present].slice(-MAX_HISTORY_STEPS),
    present: nextPresent,
    future: [],
  };
};
