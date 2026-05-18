import { useState, useEffect, useCallback, useRef } from 'react';

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
  const workerRef = useRef<Worker | null>(null);
  
  const [workerState, setWorkerState] = useState<WorkerState>({
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
  });

  const [upgrades, setUpgrades] = useState<Upgrades>({
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  });

  const [camelFrame, setCamelFrame] = useState(0);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);
  const camelFrameRef = useRef(0);

  useEffect(() => {
    workerRef.current = new Worker(new URL('./gameWorker.ts', import.meta.url), { type: 'module' });

    workerRef.current.onmessage = (e: MessageEvent) => {
      const { type, state } = e.data;
      if (type === 'stateUpdate') {
        setWorkerState(state);
        if (state.gameState.status === 'playing') {
          camelFrameRef.current += 0.15;
          setCamelFrame(camelFrameRef.current % 4);
          setBackgroundOffset(prev => (prev + (2 + state.upgrades.camelSpeed * 0.5)) % 600);
        }
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'setUpgrades', data: upgrades });
    }
  }, [upgrades]);

  const getMaxHealth = () => 100 + upgrades.camelHealth * 25;

  const shoot = useCallback((targetX: number, targetY: number) => {
    workerRef.current?.postMessage({ type: 'shoot', data: { x: targetX, y: targetY } });
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (workerState.gameState.status !== 'playing') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    shoot(x, y);
  };

  const handleTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (workerState.gameState.status !== 'playing') return;
    e.preventDefault();
    
    const rect = e.currentTarget.getBoundingClientRect();
    const touch = e.touches[0];
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (touch.clientX - rect.left) * scaleX;
    const y = (touch.clientY - rect.top) * scaleY;
    
    shoot(x, y);
  };

  const startGame = () => {
    workerRef.current?.postMessage({ type: 'startGame' });
  };

  const goToMenu = () => {
    workerRef.current?.postMessage({ type: 'goToMenu' });
    setUpgrades({
      weaponDamage: 0,
      weaponFireRate: 0,
      camelHealth: 0,
      camelSpeed: 0,
    });
  };

  const buyUpgrade = (type: keyof Upgrades) => {
    const level = upgrades[type];
    if (level >= 5) return;
    
    const cost = UPGRADE_COSTS[type][level];
    if (workerState.gameState.coins < cost) return;
    
    setUpgrades(prev => ({
      ...prev,
      [type]: prev[type] + 1,
    }));
  };

  const { gameState, enemies, collectibles, bullets, particles } = workerState;

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
          
          <div className="absolute bottom-0 left-0 right-0 h-32 md:h-40 bg-gradient-to-t from-amber-600 via-amber-500 to-transparent" />
          
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
        
        {enemies.map(enemy => (
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
        
        {collectibles.map(c => (
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
        
        {bullets.map(b => (
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
        
        {particles.map(p => (
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