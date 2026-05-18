export const GAME_WIDTH = 900;
export const GAME_HEIGHT = 500;
export const PLAYER_X = 120;
export const GROUND_Y = 380;

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

export type WorkerMessage = 
  | { type: 'INIT'; payload: { upgrades: Upgrades; coins: number } }
  | { type: 'TICK'; payload: { timestamp: number } }
  | { type: 'SHOOT'; payload: { targetX: number; targetY: number } }
  | { type: 'STOP' };

export type MainMessage = 
  | { type: 'SYNC'; payload: SyncPayload }
  | { type: 'GAME_OVER'; payload: { score: number; coins: number; artifacts: number; distance: number; level: number } };

export interface SyncPayload {
  gameState: GameState;
  enemies: Enemy[];
  collectibles: Collectible[];
  bullets: Bullet[];
  particles: Particle[];
  camelFrame: number;
  backgroundOffset: number;
}
