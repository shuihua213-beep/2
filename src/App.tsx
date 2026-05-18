import { useState, useEffect, useCallback, useRef } from 'react';
import type { Enemy, Collectible, Bullet, Particle, GameState, Upgrades, ComputedValues, WorkerToMainMessage, MainToWorkerMessage } from './gameTypes';
import { GAME_WIDTH, GAME_HEIGHT, PLAYER_X, GROUND_Y } from './gameTypes';

const UPGRADE_COSTS = {
  weaponDamage: [100, 250, 500, 1000, 2000],
  weaponFireRate: [150, 300, 600, 1200, 2500],
  camelHealth: [200, 400, 800, 1600, 3200],
  camelSpeed: [100, 200, 400, 800, 1600],
};

const UPGRADE_NAMES: Record<keyof Upgrades, string> = {
  weaponDamage: '\uD83D\uDD2B \u6B66\u5668\u4F24\u5BB3',
  weaponFireRate: '\u26A1 \u5C04\u51FB\u901F\u5EA6',
  camelHealth: '\u2764\uFE0F \u751F\u547D\u4E0A\u9650',
  camelSpeed: '\uD83D\uDC2A \u79FB\u52A8\u901F\u5EA6',
};

function computeValues(upgrades: Upgrades): ComputedValues {
  return {
    damage: 25 + upgrades.weaponDamage * 15,
    fireRate: 400 - upgrades.weaponFireRate * 60,
    maxHealth: 100 + upgrades.camelHealth * 25,
    speed: 2 + upgrades.camelSpeed * 0.5,
  };
}

export default function App() {
  const gameRef = useRef<HTMLDivElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const rafRef = useRef<number>(0);
  const pendingRef = useRef<WorkerToMainMessage | null>(null);
  const computedRef = useRef<ComputedValues>({ damage: 25, fireRate: 400, maxHealth: 100, speed: 2 });

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

  const [upgrades, setUpgrades] = useState<Upgrades>({
    weaponDamage: 0,
    weaponFireRate: 0,
    camelHealth: 0,
    camelSpeed: 0,
  });

  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [collectibles, setCollectibles] = useState<Collectible[]>([]);
  const [bullets, setBullets] = useState<Bullet[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [camelFrame, setCamelFrame] = useState(0);
  const [backgroundOffset, setBackgroundOffset] = useState(0);
  const [showUpgradePanel, setShowUpgradePanel] = useState(false);

  const sendToWorker = useCallback((msg: MainToWorkerMessage) => {
    workerRef.current?.postMessage(msg);
  }, []);

  useEffect(() => {
    const worker = new Worker(new URL('./gameWorker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerToMainMessage>) => {
      pendingRef.current = e.data;
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0;
          const state = pendingRef.current;
          if (!state) return;
          pendingRef.current = null;
          setGameState(state.gameState);
          setEnemies(state.enemies);
          setCollectibles(state.collectibles);
          setBullets(state.bullets);
          setParticles(state.particles);
          setBackgroundOffset(state.backgroundOffset);
          setCamelFrame(state.camelFrame);
        });
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, []);

  useEffect(() => {
    computedRef.current = computeValues(upgrades);
    sendToWorker({ type: 'setComputed', computed: computedRef.current });
  }, [upgrades, sendToWorker]);

  const resolveClickCoords = useCallback((clientX: number, clientY: number, rect: DOMRect) => {
    const scaleX = GAME_WIDTH / rect.width;
    const scaleY = GAME_HEIGHT / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gameState.status !== 'playing') return;
    const coords = resolveClickCoords(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
    sendToWorker({ type: 'shoot', targetX: coords.x, targetY: coords.y });
  };

  const handleTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    if (gameState.status !== 'playing') return;
    e.preventDefault();
    const touch = e.touches[0];
    const coords = resolveClickCoords(touch.clientX, touch.clientY, e.currentTarget.getBoundingClientRect());
    sendToWorker({ type: 'shoot', targetX: coords.x, targetY: coords.y });
  };

  const startGame = () => {
    sendToWorker({ type: 'start', computed: computedRef.current, initialCoins: gameState.coins });
  };

  const goToMenu = () => {
    sendToWorker({ type: 'stop' });
    setGameState((prev) => ({
      ...prev,
      status: 'menu',
      coins: prev.totalCoins,
    }));
    setShowUpgradePanel(false);
  };

  const buyUpgrade = (type: keyof Upgrades) => {
    const level = upgrades[type];
    if (level >= 5) return;

    const cost = UPGRADE_COSTS[type][level];
    if (gameState.coins < cost) return;

    setGameState((prev) => ({
      ...prev,
      coins: prev.coins - cost,
      totalCoins: prev.totalCoins - cost,
    }));

    setUpgrades((prev) => ({
      ...prev,
      [type]: prev[type] + 1,
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-200 via-orange-300 to-amber-500 flex flex-col items-center justify-center p-4">
      <h1 className="text-2xl md:text-4xl font-bold text-amber-900 mb-4 drop-shadow-lg text-center">
        \uD83C\uDFDC\uFE0F \u6C99\u4E18\u6E38\u4FA0\uFF1A\u5B9D\u85CF\u730E\u624B \uD83D\uDC2A
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
            \u2601\uFE0F \u2601\uFE0F \u2601\uFE0F
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
            \uD83C\uDF35
          </div>
          <div
            className="absolute bottom-20 text-2xl md:text-4xl transition-transform"
            style={{ transform: `translateX(${500 - backgroundOffset * 0.5 % 600}px)` }}
          >
            \uD83C\uDF35
          </div>
          <div
            className="absolute bottom-16 text-xl md:text-3xl transition-transform"
            style={{ transform: `translateX(${750 - backgroundOffset * 0.5 % 700}px)` }}
          >
            \uD83C\uDFDC\uFE0F
          </div>
        </div>

        {gameState.status === 'playing' && (
          <div className="absolute top-2 left-2 right-2 flex justify-between items-start pointer-events-none">
            <div className="bg-black/50 rounded-lg p-2 md:p-3 text-white text-xs md:text-sm backdrop-blur-sm">
              <div className="flex items-center gap-2 mb-1">
                <span>\u2764\uFE0F</span>
                <div className="w-20 md:w-28 h-2 md:h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-red-500 to-red-400 transition-all duration-300"
                    style={{ width: `${(gameState.health / gameState.maxHealth) * 100}%` }}
                  />
                </div>
                <span className="text-xs">{gameState.health}/{gameState.maxHealth}</span>
              </div>
              <div className="flex gap-2 md:gap-4">
                <span>\uD83D\uDCB0 {gameState.coins}</span>
                <span>\uD83C\uDFC6 {gameState.score}</span>
                <span>\u2B50 {gameState.level}</span>
              </div>
            </div>

            <button
              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-lg text-xs md:text-sm pointer-events-auto transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                goToMenu();
              }}
            >
              \u9000\u51FA
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
              \uD83D\uDC2A
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-2xl md:text-3xl">
                \uD83E\uDD20
              </div>
              <div className="absolute top-4 right-0 text-xl md:text-2xl transform -rotate-12">
                \uD83D\uDD2B
              </div>
            </div>
          </div>
        )}

        {enemies.map((enemy) => (
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
                  \uD83C\uDFCD\uFE0F
                  <span className="absolute -top-3 left-2 text-xl">\uD83D\uDE08</span>
                </span>
              ) : (
                <span className="relative">
                  \uD83D\uDC34
                  <span className="absolute -top-3 left-2 text-xl">\uD83E\uDD21</span>
                </span>
              )}
            </div>
          </div>
        ))}

        {collectibles.map((c) => (
          <div
            key={c.id}
            className="absolute animate-bounce"
            style={{ left: c.x, top: c.y }}
          >
            <div className={`text-2xl md:text-3xl drop-shadow-lg ${c.type !== 'coin' ? 'animate-pulse' : ''}`}>
              {c.type === 'coin' && '\uD83E\uDE99'}
              {c.type === 'artifact' && '\uD83D\uDC8E'}
              {c.type === 'shield' && '\uD83D\uDEE1\uFE0F'}
              {c.type === 'rapidFire' && '\u26A1'}
              {c.type === 'magnet' && '\uD83E\uDDF2'}
            </div>
          </div>
        ))}

        {bullets.map((b) => (
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

        {particles.map((p) => (
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
            <div className="text-5xl md:text-6xl mb-4 animate-bounce">\uD83C\uDFDC\uFE0F</div>
            <h2 className="text-2xl md:text-4xl font-bold text-amber-100 mb-2 text-center px-4">
              \u6C99\u4E18\u6E38\u4FA0\uFF1A\u5B9D\u85CF\u730E\u624B
            </h2>
            <p className="text-amber-200 text-sm md:text-base mb-4 text-center px-4">
              \u5728\u5E7F\u88E4\u7684\u6C99\u6F20\u4E2D\u6536\u96C6\u5B9D\u85CF\uFF0C\u51FB\u9000\u571F\u532A\uFF01
            </p>
            <p className="text-yellow-300 text-lg md:text-xl mb-4">
              \uD83D\uDCB0 \u91D1\u5E01: {gameState.coins} | \uD83D\uDC8E \u795E\u5668: {gameState.artifacts}
            </p>

            <div className="flex flex-col gap-3">
              <button
                className="bg-green-500 hover:bg-green-400 text-white px-6 py-3 rounded-lg text-lg md:text-xl font-bold transition-all hover:scale-105 shadow-lg"
                onClick={startGame}
              >
                \uD83C\uDFAE \u5F00\u59CB\u5192\u9669
              </button>

              <button
                className="bg-amber-500 hover:bg-amber-400 text-white px-6 py-2 rounded-lg font-bold transition-all hover:scale-105 shadow-lg"
                onClick={() => setShowUpgradePanel(!showUpgradePanel)}
              >
                \u2699\uFE0F \u5347\u7EA7\u5546\u5E97
              </button>
            </div>

            {showUpgradePanel && (
              <div className="mt-4 bg-amber-950/80 rounded-xl p-4 max-w-sm w-full mx-4">
                <h3 className="text-amber-200 text-lg font-bold mb-3 text-center">\u5347\u7EA7\u4F60\u7684\u88C5\u5907</h3>
                <div className="grid gap-2">
                  {(Object.keys(UPGRADE_NAMES) as (keyof Upgrades)[]).map((key) => {
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
                          {canUpgrade ? `${cost} \uD83D\uDCB0` : '\u5DF2\u6EE1'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mt-4 text-amber-300 text-xs md:text-sm text-center px-4">
              \uD83D\uDCA1 \u70B9\u51FB\u5C4F\u5E55\u5C04\u51FB\u571F\u532A | \u6536\u96C6\u91D1\u5E01\u548C\u9053\u5177
            </div>
          </div>
        )}

        {gameState.status === 'gameOver' && (
          <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20 backdrop-blur-sm">
            <div className="text-5xl md:text-6xl mb-4">\uD83D\uDC80</div>
            <h2 className="text-2xl md:text-4xl font-bold text-red-400 mb-4">\u6E38\u620F\u7ED3\u675F</h2>
            <div className="bg-gray-900/80 rounded-xl p-4 mb-4 text-center">
              <p className="text-white text-lg mb-2">\uD83C\uDFC6 \u6700\u7EC8\u5F97\u5206: <span className="text-yellow-400 font-bold">{gameState.score}</span></p>
              <p className="text-amber-200">\uD83D\uDCB0 \u6536\u96C6\u91D1\u5E01: {gameState.coins}</p>
              <p className="text-purple-300">\uD83D\uDC8E \u795E\u5668\u788E\u7247: {gameState.artifacts}</p>
              <p className="text-blue-300">\uD83D\uDCCF \u884C\u8FDB\u8DDD\u79BB: {Math.floor(gameState.distance)}m</p>
              <p className="text-orange-300">\u2B50 \u8FBE\u5230\u7B49\u7EA7: {gameState.level}</p>
            </div>
            <div className="flex gap-3">
              <button
                className="bg-green-500 hover:bg-green-400 text-white px-6 py-3 rounded-lg text-lg font-bold transition-all hover:scale-105 shadow-lg"
                onClick={startGame}
              >
                \uD83D\uDD04 \u518D\u6765\u4E00\u6B21
              </button>
              <button
                className="bg-amber-500 hover:bg-amber-400 text-white px-6 py-3 rounded-lg font-bold transition-all hover:scale-105 shadow-lg"
                onClick={goToMenu}
              >
                \uD83C\uDFE0 \u8FD4\u56DE\u83DC\u5355
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 text-amber-900 text-xs md:text-sm text-center max-w-lg">
        <p>\uD83C\uDFAF \u70B9\u51FB\u5C4F\u5E55\u5C04\u51FB\u571F\u532A | \uD83E\uDE99 \u6536\u96C6\u91D1\u5E01\u5347\u7EA7\u88C5\u5907 | \uD83D\uDC8E \u6536\u96C6\u795E\u5668\u788E\u7247</p>
        <p className="mt-1">\uD83D\uDEE1\uFE0F \u62A4\u76FE\u6062\u590D\u751F\u547D | \u26A1 \u5FEB\u901F\u5C04\u51FB | \uD83E\uDDF2 \u78C1\u5438\u91D1\u5E01</p>
      </div>
    </div>
  );
}