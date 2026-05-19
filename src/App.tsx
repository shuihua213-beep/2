import { useState, useEffect, useCallback, useRef } from 'react';
import { useYjsSync } from './YjsBinding';

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
  
  const {
    syncedCoins,
    syncedUpgrades: upgrades,
    syncCoins,
    syncUpgrade,
    activeUsers,
    setHoveredUpgrade
  } = useYjsSync(0, {
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  });

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

  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [camelFrame, setCamelFrame] = useState(0);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);
  
  const lastShotRef = useRef(0);
  const idCounterRef = useRef(0);
  const spawnTimerRef = useRef(0);
  const collectibleTimerRef = useRef(0);
  const gameStateRef = useRef(gameState);
  
  gameStateRef.current = gameState;

  const getDamage = () => 25 + upgrades.weaponDamage * 15;
  const getFireRate = () => 400 - upgrades.weaponFireRate * 60;
  const getMaxHealth = () => 100 + upgrades.camelHealth * 25;
  const getSpeed = () => 2 + upgrades.camelSpeed * 0.5;

  // 创建粒子效果
  const createParticles = (x: number, y: number, color: string, count: number) => {
    const newParticles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      newParticles.push({
        id: idCounterRef.current++,
        x,
        y,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8 - 2,
        life: 30,
        color,
      });
    }
    setParticles(prev => [...prev, ...newParticles]);
  };

  // 生成敌人
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
    
    setEnemies(prev => [...prev, newEnemy]);
  }, []);

  // 生成收集物
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
    
    setCollectibles(prev => [...prev, newCollectible]);
  }, []);

  // 射击
  const shoot = useCallback((targetX: number, targetY: number) => {
    const now = Date.now();
    if (now - lastShotRef.current < getFireRate()) return;
    if (gameStateRef.current.status !== 'playing') return;
    
    lastShotRef.current = now;
    
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
    
    setBullets(prev => [...prev, newBullet]);
  }, [upgrades.weaponFireRate]);

  // 处理点击
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameStateRef.current.status !== 'playing') return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    shoot(x, y);
  };

  // 处理触摸
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

  // 游戏主循环
  const gameLoop = useCallback((timestamp: number) => {
    if (gameStateRef.current.status !== 'playing') return;
    
    const deltaTime = timestamp - lastTimeRef.current;
    lastTimeRef.current = timestamp;
    
    const speed = getSpeed();
    
    // 更新背景
    setBackgroundOffset(prev => (prev + speed) % 600);
    setCamelFrame(prev => (prev + 0.15) % 4);
    
    // 更新距离和等级
    setGameState(prev => {
      const newDistance = prev.distance + speed * 0.1;
      const newLevel = Math.min(5, Math.floor(newDistance / 500) + 1);
      return { ...prev, distance: newDistance, level: newLevel };
    });
    
    // 生成敌人
    spawnTimerRef.current += deltaTime;
    const spawnInterval = Math.max(1500 - gameStateRef.current.level * 200, 600);
    if (spawnTimerRef.current > spawnInterval) {
      spawnEnemy();
      spawnTimerRef.current = 0;
    }
    
    // 生成收集物
    collectibleTimerRef.current += deltaTime;
    if (collectibleTimerRef.current > 1200) {
      spawnCollectible();
      collectibleTimerRef.current = 0;
    }
    
    // 更新子弹
    setBullets(prev => prev
      .map(b => ({ ...b, x: b.x + b.vx, y: b.y + b.vy }))
      .filter(b => b.x < GAME_WIDTH + 50 && b.x > -50 && b.y > -50 && b.y < GAME_HEIGHT + 50)
    );
    
    // 更新粒子
    setParticles(prev => prev
      .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vy: p.vy + 0.3, life: p.life - 1 }))
      .filter(p => p.life > 0)
    );
    
    // 更新敌人位置
    setEnemies(prev => {
      const updated: Enemy[] = [];
      let damage = 0;
      
      prev.forEach(enemy => {
        const newX = enemy.x - enemy.speed;
        if (newX < -50) {
          // 敌人逃脱，造成伤害
          damage += enemy.damage;
        } else {
          updated.push({ ...enemy, x: newX });
        }
      });
      
      if (damage > 0) {
        setGameState(prev => ({
          ...prev,
          health: Math.max(0, prev.health - damage),
        }));
      }
      
      return updated;
    });
    
    // 更新收集物位置
    setCollectibles(prev => prev
      .map(c => ({ ...c, x: c.x - speed * 1.5 }))
      .filter(c => c.x > -50)
    );
    
    // 碰撞检测 - 子弹与敌人
    const damage = getDamage();
    setBullets(prevBullets => {
      const remainingBullets: Bullet[] = [];
      
      setEnemies(prevEnemies => {
        const remainingEnemies: Enemy[] = [];
        const killedEnemyIds: number[] = [];
        
        prevEnemies.forEach(enemy => {
          let enemyHealth = enemy.health;
          let wasHit = false;
          
          prevBullets.forEach(bullet => {
            if (killedEnemyIds.includes(enemy.id)) return;
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - (enemy.y - 20);
            if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
              enemyHealth -= damage;
              wasHit = true;
              // 添加击中效果
              createParticles(bullet.x, bullet.y, '#FFD700', 5);
            }
          });
          
          if (enemyHealth <= 0) {
            // 敌人死亡
            killedEnemyIds.push(enemy.id);
            setGameState(prev => ({
              ...prev,
              score: prev.score + (enemy.type === 'motorcycle' ? 50 : 30),
              // coins 和 totalCoins 将通过 syncCoins 更新
            }));
            const coinReward = enemy.type === 'motorcycle' ? 15 : 10;
            syncCoins((prev: number) => prev + coinReward);
            createParticles(enemy.x, enemy.y - 20, enemy.type === 'motorcycle' ? '#FF6B6B' : '#8B4513', 15);
          } else if (wasHit) {
            remainingEnemies.push({ ...enemy, health: enemyHealth });
          } else {
            remainingEnemies.push(enemy);
          }
        });
        
        // 过滤掉击中敌人的子弹
        prevBullets.forEach(bullet => {
          let hit = false;
          prevEnemies.forEach(enemy => {
            const dx = bullet.x - enemy.x;
            const dy = bullet.y - (enemy.y - 20);
            if (Math.abs(dx) < 40 && Math.abs(dy) < 40) {
              hit = true;
            }
          });
          if (!hit) remainingBullets.push(bullet);
        });
        
        return remainingEnemies;
      });
      
      return remainingBullets;
    });
    
    // 碰撞检测 - 收集物
    setCollectibles(prev => {
      const remaining: Collectible[] = [];
      
      prev.forEach(c => {
        const dx = c.x - PLAYER_X;
        const dy = c.y - (GROUND_Y - 50);
        if (Math.abs(dx) < 60 && Math.abs(dy) < 60) {
          // 收集到物品
          createParticles(c.x, c.y, c.type === 'coin' ? '#FFD700' : '#9333EA', 8);
          
          setGameState(prevState => {
            switch (c.type) {
              case 'coin':
                syncCoins((prev: number) => prev + 5);
                return { ...prevState, score: prevState.score + 5 };
              case 'artifact':
                return { ...prevState, artifacts: prevState.artifacts + 1, score: prevState.score + 100 };
              case 'shield':
                return { ...prevState, health: Math.min(prevState.maxHealth, prevState.health + 30) };
              case 'rapidFire':
              case 'magnet':
                return { ...prevState, score: prevState.score + 50 };
              default:
                return prevState;
            }
          });
        } else {
          remaining.push(c);
        }
      });
      
      return remaining;
    });
    
    // 检查游戏结束
    if (gameStateRef.current.health <= 0) {
      setGameState(prev => ({ ...prev, status: 'gameOver' }));
      return;
    }
    
    animationRef.current = requestAnimationFrame(gameLoop);
  }, [spawnEnemy, spawnCollectible, upgrades]);

  // 开始游戏循环
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

  // 开始游戏
  const startGame = () => {
    setGameState({
      status: 'playing',
      score: 0,
      coins: 0, // unused
      artifacts: 0,
      totalCoins: 0, // unused
      health: getMaxHealth(),
      maxHealth: getMaxHealth(),
      level: 1,
      distance: 0,
    });
    setEnemies([]);
    setCollectibles([]);
    setBullets([]);
    setParticles([]);
    spawnTimerRef.current = 0;
    collectibleTimerRef.current = 0;
  };

  // 返回主菜单
  const goToMenu = () => {
    setGameState(prev => ({
      ...prev,
      status: 'menu',
    }));
    setShowUpgradePanel(false);
  };

  // 升级
  const buyUpgrade = (type: keyof Upgrades) => {
    const level = upgrades[type];
    if (level >= 5) return;
    
    const cost = UPGRADE_COSTS[type][level];
    if (syncedCoins < cost) return;
    
    syncCoins((prev: number) => prev - cost);
    syncUpgrade(type, level + 1);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 via-orange-300 to-amber-500 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl md:text-4xl font-bold text-amber-900 mb-4 drop-shadow-lg text-center">
        🏜️ 沙丘游侠：宝藏猎手 🐪
      </h1>
      
      {/* 游戏画面 */}
      <div 
        ref={gameRef}
        className="relative w-full max-w-4xl h-64 md:h-80 lg:h-96 bg-gradient-to-b from-sky-400 via-sky-300 to-amber-200 rounded-xl overflow-hidden shadow-2xl border-4 border-amber-700 cursor-crosshair select-none"
        onClick={handleClick}
        onTouchStart={handleTouch}
        style={{ aspectRatio: '16/9', maxHeight: '500px' }}
      >
        {/* 背景层 */}
        <div className="absolute inset-0 overflow-hidden">
          {/* 太阳 */}
          <div className="absolute top-4 right-8 w-12 h-12 md:w-16 md:h-16 bg-yellow-300 rounded-full shadow-lg animate-pulse" />
          
          {/* 云朵 */}
          <div 
            className="absolute top-8 text-4xl md:text-6xl opacity-80 transition-transform"
            style={{ transform: `translateX(${-backgroundOffset * 0.2 % 400}px)` }}
          >
            ☁️ ☁️ ☁️
          </div>
          
          {/* 远处的山丘 */}
          <div className="absolute bottom-20 left-0 right-0">
            <svg viewBox="0 0 900 100" className="w-full h-16 md:h-24 opacity-60">
              <path d="M0,100 Q150,20 300,80 T600,60 T900,100 L900,100 L0,100 Z" fill="#D2691E" />
            </svg>
          </div>
          
          {/* 沙丘背景 */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-32 md:h-40 bg-gradient-to-t from-amber-600 via-amber-500 to-transparent"
          />
          
          {/* 滚动的地面纹理 */}
          <div 
            className="absolute bottom-0 left-0 right-0 h-20 flex items-end transition-transform"
            style={{ transform: `translateX(${-backgroundOffset % 100}px)` }}
          >
            {[...Array(20)].map((_, i) => (
              <div key={i} className="flex-shrink-0 w-12 h-4 bg-amber-700 rounded-full mx-2 opacity-30" />
            ))}
          </div>
          
          {/* 仙人掌 */}
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
        
        {/* 游戏中UI */}
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
                <span>💰 {syncedCoins}</span>
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
        
        {/* 玩家骆驼 */}
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
              {/* 骑手 */}
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl md:text-3xl">
                🤠
              </div>
              {/* 枪 */}
              <div className="absolute top-4 right-0 text-xl md:text-2xl transform -rotate-12">
                🔫
              </div>
            </div>
          </div>
        )}
        
        {/* 敌人 */}
        {enemies.map(enemy => (
          <div 
            key={enemy.id} 
            className="absolute"
            style={{ left: enemy.x, top: enemy.y - 40 }}
          >
            {/* 血条 */}
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
        
        {/* 收集物 */}
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
        
        {/* 子弹 */}
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
        
        {/* 粒子效果 */}
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
        
        {/* 主菜单 */}
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
              💰 金币: {syncedCoins} | 💎 神器: {gameState.artifacts}
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
            
            {/* 升级面板 */}
            {showUpgradePanel && (
              <div className="mt-4 bg-amber-950/80 rounded-xl p-4 max-w-sm w-full mx-4">
                <h3 className="text-amber-200 text-lg font-bold mb-3 text-center">升级你的装备</h3>
                <div className="grid gap-2">
                  {(Object.keys(UPGRADE_NAMES) as (keyof Upgrades)[]).map(key => {
                    const level = upgrades[key];
                    const canUpgrade = level < 5;
                    const cost = canUpgrade ? UPGRADE_COSTS[key][level] : 0;
                    const canAfford = syncedCoins >= cost;
                    
                    // 获取在此升级项上的其他玩家
                    const hoveringUsers = Array.from(activeUsers.values()).filter(
                      u => u.hoveredUpgrade === key
                    );
                    
                    return (
                      <div 
                        key={key} 
                        className="relative flex items-center justify-between bg-amber-900/50 rounded-lg p-2"
                        onMouseEnter={() => setHoveredUpgrade(key)}
                        onMouseLeave={() => setHoveredUpgrade(null)}
                      >
                        {/* 其他玩家光标 */}
                        {hoveringUsers.length > 0 && (
                          <div className="absolute -top-3 -right-2 flex -space-x-2">
                            {hoveringUsers.map((user, i) => (
                              <div 
                                key={i}
                                className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold"
                                style={{ backgroundColor: user.color, zIndex: 10 - i }}
                                title="其他玩家正在查看"
                              >
                                {user.id?.substring(0, 2)}
                              </div>
                            ))}
                          </div>
                        )}
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
        
        {/* 游戏结束 */}
        {gameState.status === 'gameOver' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4">💀</div>
            <h2 className="text-2xl md:text-4xl font-bold text-red-400 mb-4">游戏结束</h2>
            <div className="bg-gray-900/80 rounded-xl p-4 mb-4 text-center">
              <p className="text-white text-lg mb-2">🏆 最终得分: <span className="text-yellow-400 font-bold">{gameState.score}</span></p>
              <p className="text-amber-200">💰 收集金币: {syncedCoins}</p>
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
      
      {/* 底部说明 */}
      <div className="mt-4 text-amber-900 text-xs md:text-sm text-center max-w-lg">
        <p>🎯 点击屏幕射击土匪 | 🪙 收集金币升级装备 | 💎 收集神器碎片</p>
        <p className="mt-1">🛡️ 护盾恢复生命 | ⚡ 快速射击 | 🧲 磁吸金币</p>
      </div>
    </div>
  );
}
