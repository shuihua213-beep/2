import React, { useState, useEffect, useCallback, useRef } from 'react';

class SoundManager {
  private audioContext: AudioContext | null = null;
  private isPlayingBgm = false;

  private initContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.audioContext;
  }

  startBgm() {
    if (this.isPlayingBgm) return;
    const ctx = this.initContext();
    this.isPlayingBgm = true;
    
    const playNote = (freq: number, time: number, duration: number) => {
      if (!this.isPlayingBgm) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.08, time + 0.05);
      gain.gain.linearRampToValueAtTime(0, time + duration - 0.05);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + duration);
    };

    const melody = [330, 392, 440, 392, 330, 294, 330, 392];
    const bass = [131, 147, 165, 147];
    let noteIndex = 0;
    let bassIndex = 0;

    const playBgmLoop = () => {
      if (!this.isPlayingBgm) return;
      const now = ctx.currentTime;
      playNote(melody[noteIndex], now, 0.4);
      if (noteIndex % 2 === 0) {
        playNote(bass[bassIndex], now, 0.8);
        bassIndex = (bassIndex + 1) % bass.length;
      }
      noteIndex = (noteIndex + 1) % melody.length;
      setTimeout(playBgmLoop, 400);
    };
    
    playBgmLoop();
  }

  stopBgm() {
    this.isPlayingBgm = false;
  }

  toggleBgm() {
    if (this.isPlayingBgm) {
      this.stopBgm();
      return false;
    } else {
      this.startBgm();
      return true;
    }
  }

  getBgmStatus() {
    return this.isPlayingBgm;
  }

  playHit() {
    const ctx = this.initContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(800, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  }

  playBonus() {
    const ctx = this.initContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(523, ctx.currentTime);
    oscillator.frequency.setValueAtTime(659, ctx.currentTime + 0.1);
    oscillator.frequency.setValueAtTime(784, ctx.currentTime + 0.2);
    
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.35);
  }

  playExplosion() {
    const ctx = this.initContext();
    const bufferSize = ctx.sampleRate * 0.4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    
    const noise = ctx.createBufferSource();
    const gainNode = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    
    noise.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    
    noise.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    gainNode.gain.setValueAtTime(0.5, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    noise.start(ctx.currentTime);
  }

  playMiss() {
    const ctx = this.initContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.setValueAtTime(300, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3);
    
    gainNode.gain.setValueAtTime(0.2, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
  }

  playGameOver() {
    const ctx = this.initContext();
    const notes = [392, 349, 330, 262];
    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.2);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.25);
      
      oscillator.start(ctx.currentTime + i * 0.2);
      oscillator.stop(ctx.currentTime + i * 0.2 + 0.25);
    });
  }

  playStart() {
    const ctx = this.initContext();
    const notes = [262, 330, 392, 523];
    notes.forEach((freq, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.value = freq;
      gainNode.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.1);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.15);
      
      oscillator.start(ctx.currentTime + i * 0.1);
      oscillator.stop(ctx.currentTime + i * 0.1 + 0.15);
    });
  }
}

const soundManager = new SoundManager();

interface Target {
  id: number;
  x: number;
  y: number;
  type: 'normal' | 'bonus' | 'fast' | 'tough' | 'bomb';
  health: number;
  maxHealth: number;
  createdAt: number;
  duration: number;
}

interface Explosion {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'gameOver'>('idle');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(5);
  const [targets, setTargets] = useState<Target[]>([]);
  const [explosions, setExplosions] = useState<Explosion[]>([]);
  const [highScore, setHighScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [level, setLevel] = useState(1);
  const [bgmEnabled, setBgmEnabled] = useState(false);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const targetIdRef = useRef(0);
  const explosionIdRef = useRef(0);

  useEffect(() => {
    if (gameState === 'playing' && bgmEnabled) {
      soundManager.startBgm();
    } else {
      soundManager.stopBgm();
    }
  }, [gameState, bgmEnabled]);

  useEffect(() => {
    const newLevel = Math.floor(score / 100) + 1;
    if (newLevel !== level) {
      setLevel(newLevel);
    }
  }, [score, level]);

  const createTarget = useCallback(() => {
    if (!gameAreaRef.current) return;
    
    const area = gameAreaRef.current.getBoundingClientRect();
    const padding = 100;
    
    const rand = Math.random();
    let type: Target['type'];
    if (rand < 0.5) type = 'normal';
    else if (rand < 0.65) type = 'bonus';
    else if (rand < 0.80) type = 'fast';
    else if (rand < 0.92) type = 'tough';
    else type = 'bomb';
    
    let health = 1;
    let duration = 2500 - level * 80;
    duration = Math.max(duration, 1000);
    
    if (type === 'tough') health = 3;
    if (type === 'fast') duration = Math.max(duration - 500, 800);
    
    const newTarget: Target = {
      id: targetIdRef.current++,
      x: padding + Math.random() * (area.width - padding * 2),
      y: padding + Math.random() * (area.height - padding * 2),
      type,
      health,
      maxHealth: health,
      createdAt: Date.now(),
      duration,
    };
    
    setTargets(prev => [...prev, newTarget]);
  }, [level]);

  const addExplosion = useCallback((x: number, y: number, text: string, color: string) => {
    const explosion: Explosion = {
      id: explosionIdRef.current++,
      x,
      y,
      text,
      color,
    };
    setExplosions(prev => [...prev, explosion]);
    
    setTimeout(() => {
      setExplosions(prev => prev.filter(e => e.id !== explosion.id));
    }, 600);
  }, []);

  const handleTargetClick = useCallback((target: Target, e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (target.type === 'bomb') {
      soundManager.playExplosion();
      setScore(prev => Math.max(0, prev - 30));
      setLives(prev => prev - 1);
      setCombo(0);
      addExplosion(target.x, target.y, '💥 爆炸! -30', '#ef4444');
      setTargets(prev => prev.filter(t => t.id !== target.id));
      return;
    }
    
    const newHealth = target.health - 1;
    
    if (newHealth <= 0) {
      let points = 10;
      let text = '砰!';
      let color = '#22c55e';
      
      switch (target.type) {
        case 'bonus':
          soundManager.playBonus();
          points = 35;
          text = '🌟 太棒了! +35';
          color = '#f59e0b';
          break;
        case 'fast':
          soundManager.playBonus();
          points = 25;
          text = '⚡ 快手! +25';
          color = '#0ea5e9';
          break;
        case 'tough':
          soundManager.playBonus();
          points = 50;
          text = '💪 击杀! +50';
          color = '#ef4444';
          break;
        default:
          soundManager.playHit();
          points = 10 + Math.min(combo, 10) * 2;
          text = `命中! +${points}`;
      }
      
      setScore(prev => prev + points);
      setCombo(prev => prev + 1);
      addExplosion(target.x, target.y, text, color);
      setTargets(prev => prev.filter(t => t.id !== target.id));
    } else {
      soundManager.playHit();
      setTargets(prev => 
        prev.map(t => t.id === target.id ? { ...t, health: newHealth } : t)
      );
      addExplosion(target.x, target.y, `击中! (${newHealth}/${target.maxHealth})`, '#fbbf24');
    }
  }, [combo, addExplosion]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const interval = setInterval(() => {
      const now = Date.now();
      setTargets(prev => {
        const remaining: Target[] = [];
        prev.forEach(t => {
          if (now - t.createdAt >= t.duration) {
            if (t.type !== 'bomb') {
              soundManager.playMiss();
              setLives(l => l - 1);
              setCombo(0);
            }
          } else {
            remaining.push(t);
          }
        });
        return remaining;
      });
    }, 50);
    
    return () => clearInterval(interval);
  }, [gameState]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    
    const spawnInterval = Math.max(1800 - level * 80, 400);
    
    const interval = setInterval(() => {
      createTarget();
    }, spawnInterval);
    
    return () => clearInterval(interval);
  }, [gameState, createTarget, level]);

  useEffect(() => {
    if (lives <= 0 && gameState === 'playing') {
      soundManager.playGameOver();
      setGameState('gameOver');
      setHighScore(prev => Math.max(prev, score));
    }
  }, [lives, gameState, score]);

  const startGame = () => {
    soundManager.playStart();
    setGameState('playing');
    setScore(0);
    setLives(5);
    setTargets([]);
    setExplosions([]);
    setCombo(0);
    setLevel(1);
  };

  const renderTarget = (target: Target) => {
    const opacity = 1;
    const timeLeft = 1 - (Date.now() - target.createdAt) / target.duration;
    
    const getTargetContent = () => {
      switch (target.type) {
        case 'normal':
          return (
            <svg viewBox="0 0 100 100" className="w-full h-full">
              <circle cx="50" cy="50" r="42" fill="#94a3b8" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
              <circle cx="50" cy="50" r="30" fill="#cbd5e1" stroke="#1e293b" strokeWidth="4" />
              <circle cx="50" cy="50" r="18" fill="#64748b" stroke="#1e293b" strokeWidth="3" />
              <circle cx="50" cy="50" r="7" fill="#1e293b" />
              {/* 手绘感装饰 */}
              <path d="M 50 5 Q 52 15 50 20" fill="none" stroke="#1e293b" strokeWidth="2" />
              <path d="M 50 80 Q 48 85 50 95" fill="none" stroke="#1e293b" strokeWidth="2" />
              <path d="M 5 50 Q 15 48 20 50" fill="none" stroke="#1e293b" strokeWidth="2" />
              <path d="M 80 50 Q 85 52 95 50" fill="none" stroke="#1e293b" strokeWidth="2" />
            </svg>
          );
        case 'bonus':
          return (
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* 星形 */}
              <polygon 
                points="50,5 61,40 98,40 68,62 79,97 50,75 21,97 32,62 2,40 39,40" 
                fill="#fbbf24" 
                stroke="#92400e" 
                strokeWidth="4"
                strokeLinejoin="round"
              />
              <circle cx="50" cy="50" r="12" fill="#fef3c7" />
              <text x="50" y="55" textAnchor="middle" fontSize="16" fill="#92400e">$</text>
            </svg>
          );
        case 'fast':
          return (
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* 快速目标 */}
              <ellipse cx="50" cy="50" rx="45" ry="30" fill="#38bdf8" stroke="#0369a1" strokeWidth="5" />
              <text x="50" y="58" textAnchor="middle" fontSize="28" fill="white">⚡</text>
              {/* 速度线 */}
              <path d="M 5 45 L 20 50 L 5 55" fill="none" stroke="#0369a1" strokeWidth="3" />
              <path d="M 80 45 L 95 50 L 80 55" fill="none" stroke="#0369a1" strokeWidth="3" />
            </svg>
          );
        case 'tough':
          return (
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* 强壮怪物 */}
              <rect x="10" y="10" width="80" height="80" rx="15" fill="#f87171" stroke="#991b1b" strokeWidth="5" />
              {/* 眼睛 */}
              <circle cx="32" cy="40" r="10" fill="white" />
              <circle cx="68" cy="40" r="10" fill="white" />
              <circle cx="32" cy="42" r="5" fill="#1e293b" />
              <circle cx="68" cy="42" r="5" fill="#1e293b" />
              {/* 嘴巴 */}
              <path d="M 30 65 Q 50 80 70 65" fill="none" stroke="#1e293b" strokeWidth="5" strokeLinecap="round" />
              {/* 生命条 */}
              <rect x="15" y="88" width="70" height="8" rx="4" fill="#1e293b" />
              <rect x="15" y="88" width={70 * (target.health / target.maxHealth)} height="8" rx="4" fill="#22c55e" />
            </svg>
          );
        case 'bomb':
          return (
            <svg viewBox="0 0 100 100" className="w-full h-full">
              {/* 炸弹 */}
              <circle cx="50" cy="58" r="35" fill="#1f2937" stroke="#111827" strokeWidth="4" />
              {/* 高光 */}
              <ellipse cx="38" cy="48" rx="8" ry="6" fill="#4b5563" />
              {/* 引线 */}
              <path d="M 50 23 Q 60 10 70 15 Q 80 5 75 20" fill="none" stroke="#78350f" strokeWidth="4" strokeLinecap="round" />
              {/* 火花 */}
              <text x="75" y="18" fontSize="16">💥</text>
              {/* 骷髅标记 */}
              <text x="50" y="68" textAnchor="middle" fontSize="24">☠️</text>
            </svg>
          );
      }
    };

    const size = target.type === 'fast' ? 55 : (target.type === 'tough' ? 75 : 65);

    return (
      <div
        key={target.id}
        className="absolute cursor-crosshair transform -translate-x-1/2 -translate-y-1/2 hover:scale-110 transition-transform duration-75"
        style={{
          left: target.x,
          top: target.y,
          width: size,
          height: size,
          opacity,
          animation: 'wobble 0.6s ease-in-out infinite',
        }}
        onClick={(e) => handleTargetClick(target, e)}
      >
        {getTargetContent()}
        {/* 时间条 */}
        <div 
          className="absolute -bottom-3 left-0 h-2 bg-gray-800 rounded-full"
          style={{ width: '100%' }}
        >
          <div 
            className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500 rounded-full transition-all duration-100"
            style={{ width: `${Math.max(timeLeft * 100, 0)}%` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="w-screen h-screen overflow-hidden relative select-none" style={{
      background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #fcd34d 100%)',
    }}>
      {/* 手绘网格背景 */}
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `
            repeating-linear-gradient(0deg, #1e293b 0px, #1e293b 1px, transparent 1px, transparent 30px),
            repeating-linear-gradient(90deg, #1e293b 0px, #1e293b 1px, transparent 1px, transparent 30px)
          `,
        }}
      />

      {/* 装饰涂鸦 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-16 left-8 text-5xl opacity-20 transform -rotate-12">✨</div>
        <div className="absolute top-32 right-16 text-4xl opacity-20 transform rotate-12">⭐</div>
        <div className="absolute bottom-32 left-16 text-4xl opacity-20">💫</div>
        <div className="absolute bottom-16 right-8 text-5xl opacity-20 transform rotate-6">🌟</div>
        {/* 简笔画装饰 */}
        <svg className="absolute top-20 left-1/4 opacity-10" width="100" height="100" viewBox="0 0 100 100">
          <path d="M 10 50 Q 30 20 50 50 T 90 50" fill="none" stroke="#1e293b" strokeWidth="3" strokeLinecap="round" />
        </svg>
      </div>

      {/* 主标题 */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-10">
        <h1 className="text-3xl md:text-4xl font-black text-center"
          style={{
            fontFamily: 'Comic Sans MS, cursive, sans-serif',
            color: '#1e293b',
            textShadow: '3px 3px 0 #fef3c7, 4px 4px 0 #1e293b',
            letterSpacing: '2px',
          }}>
          🎯 快手涂鸦射手 🎯
        </h1>
      </div>

      {/* 游戏状态UI */}
      {gameState === 'playing' && (
        <>
          {/* 分数 */}
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-white rounded-2xl px-5 py-3 transform rotate-2 shadow-lg"
              style={{ border: '4px solid #1e293b' }}>
              <div className="text-xs font-bold text-gray-500 uppercase">分数</div>
              <div className="text-3xl font-black text-blue-600">{score}</div>
            </div>
          </div>

          {/* 等级 */}
          <div className="absolute top-24 right-4 z-10">
            <div className="bg-yellow-200 rounded-xl px-4 py-2 transform rotate-1 shadow-lg"
              style={{ border: '3px solid #1e293b' }}>
              <div className="text-sm font-black text-yellow-800">Lv.{level}</div>
            </div>
          </div>

          {/* 音乐控制 */}
          <button
            onClick={() => setBgmEnabled(!bgmEnabled)}
            className="absolute top-44 right-4 z-10"
          >
            <div className={`rounded-xl px-4 py-2 transform shadow-lg transition-all ${bgmEnabled ? 'bg-green-200' : 'bg-gray-200'}`}
              style={{ border: '3px solid #1e293b' }}>
              <div className="text-xl">{bgmEnabled ? '🔊' : '🔇'}</div>
            </div>
          </button>

          {/* 生命值 */}
          <div className="absolute top-4 left-4 z-10">
            <div className="bg-white rounded-2xl px-5 py-3 transform -rotate-2 shadow-lg"
              style={{ border: '4px solid #1e293b' }}>
              <div className="text-xs font-bold text-gray-500 uppercase">生命</div>
              <div className="text-2xl tracking-wider">
                {Array.from({ length: 5 }).map((_, i) => (
                  <span key={i} className={i < lives ? '' : 'opacity-30'}>
                    {i < lives ? '❤️' : '🖤'}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 连击 */}
          {combo > 1 && (
            <div className="absolute top-24 left-4 z-10">
              <div className="bg-gradient-to-r from-orange-400 to-red-500 text-white rounded-xl px-4 py-2 transform -rotate-1 shadow-lg animate-pulse"
                style={{ border: '3px solid #1e293b' }}>
                <div className="text-sm font-black">🔥 连击 x{combo}!</div>
              </div>
            </div>
          )}
        </>
      )}

      {/* 游戏区域 */}
      <div
        ref={gameAreaRef}
        className="absolute inset-0"
        style={{ cursor: 'crosshair' }}
      >
        {targets.map(target => renderTarget(target))}
        
        {/* 爆炸效果 */}
        {explosions.map(explosion => (
          <div
            key={explosion.id}
            className="absolute transform -translate-x-1/2 pointer-events-none z-20"
            style={{
              left: explosion.x,
              top: explosion.y,
            }}
          >
            <div
              className="bg-white rounded-xl px-4 py-2 text-xl font-black whitespace-nowrap animate-bounce"
              style={{
                color: explosion.color,
                border: `4px solid ${explosion.color}`,
                boxShadow: `0 4px 20px ${explosion.color}50`,
                animation: 'explodePop 0.6s ease-out forwards',
              }}
            >
              {explosion.text}
            </div>
          </div>
        ))}
      </div>

      {/* 开始界面 */}
      {gameState === 'idle' && (
        <div className="absolute inset-0 flex items-center justify-center bg-amber-50 bg-opacity-95 z-30">
          <div className="text-center max-w-lg mx-4">
            <div className="mb-6">
              <span className="text-7xl block mb-4 animate-bounce">🎯</span>
              <h2 className="text-5xl font-black mb-4"
                style={{
                  fontFamily: 'Comic Sans MS, cursive',
                  color: '#1e293b',
                  textShadow: '4px 4px 0 #fbbf24, 6px 6px 0 #1e293b',
                }}>
                快手涂鸦射手
              </h2>
              <p className="text-xl text-gray-600 font-bold">
                快速点击目标，考验你的反应力！
              </p>
            </div>
            
            <div className="bg-white rounded-2xl p-6 mb-8 transform rotate-1 shadow-xl"
              style={{ border: '4px solid #1e293b' }}>
              <h3 className="text-xl font-black mb-4 text-gray-800">📖 游戏规则</h3>
              <div className="space-y-3 text-left">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">🎯</span>
                  <span className="font-semibold text-gray-700">灰色靶子 - 普通目标 (+10分)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⭐</span>
                  <span className="font-semibold text-yellow-600">金色星星 - 高分目标 (+35分)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚡</span>
                  <span className="font-semibold text-blue-600">蓝色闪电 - 快速目标 (+25分)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">😈</span>
                  <span className="font-semibold text-red-600">红色怪物 - 需多次点击 (+50分)</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">💣</span>
                  <span className="font-semibold text-gray-800">炸弹 - 不要点！(-30分 -1❤️)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4 justify-center items-center mb-6">
              <button
                onClick={startGame}
                className="group bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-3xl font-black text-white px-12 py-5 rounded-2xl transform hover:scale-110 transition-all duration-200 shadow-xl"
                style={{
                  fontFamily: 'Comic Sans MS, cursive',
                  border: '5px solid #166534',
                  boxShadow: '6px 6px 0 #14532d',
                }}
              >
                🚀 开始游戏！
              </button>
              
              <button
                onClick={() => setBgmEnabled(!bgmEnabled)}
                className={`text-3xl px-6 py-5 rounded-2xl transform hover:scale-110 transition-all duration-200 shadow-xl ${bgmEnabled ? 'bg-green-400 text-white' : 'bg-gray-300 text-gray-600'}`}
                style={{
                  border: `5px solid ${bgmEnabled ? '#166534' : '#6b7280'}`,
                  boxShadow: `6px 6px 0 ${bgmEnabled ? '#14532d' : '#4b5563'}`,
                }}
                title={bgmEnabled ? '关闭背景音乐' : '开启背景音乐'}
              >
                {bgmEnabled ? '🔊' : '🔇'}
              </button>
            </div>

            {highScore > 0 && (
              <div className="mt-8 bg-gradient-to-r from-yellow-100 to-amber-100 rounded-xl px-6 py-3 inline-block"
                style={{ border: '3px solid #b45309' }}>
                <span className="text-lg font-black text-amber-700">🏆 最高分: {highScore}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 游戏结束界面 */}
      {gameState === 'gameOver' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-80 z-30">
          <div className="text-center max-w-md mx-4">
            <div className="mb-6">
              <span className="text-7xl block mb-4">💀</span>
              <h2 className="text-5xl font-black mb-4 text-white"
                style={{
                  fontFamily: 'Comic Sans MS, cursive',
                  textShadow: '4px 4px 0 #f87171, 6px 6px 0 #000',
                }}>
                游戏结束！
              </h2>
            </div>
            
            <div className="bg-white rounded-2xl p-8 mb-8 transform -rotate-1 shadow-2xl"
              style={{ border: '4px solid #1e293b' }}>
              <div className="text-4xl font-black text-blue-600 mb-4">
                最终得分
              </div>
              <div className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-purple-600 mb-4">
                {score}
              </div>
              <div className="text-lg font-bold text-gray-500">
                达到等级: Lv.{level}
              </div>
              
              {score >= highScore && score > 0 && (
                <div className="mt-4 text-2xl text-yellow-500 font-black animate-pulse">
                  🎉 新纪录！🎉
                </div>
              )}
            </div>

            <div className="flex gap-4 justify-center">
              <button
                onClick={startGame}
                className="bg-gradient-to-br from-green-400 to-green-600 hover:from-green-500 hover:to-green-700 text-2xl font-black text-white px-10 py-4 rounded-2xl transform hover:scale-110 transition-all duration-200 shadow-xl"
                style={{
                  fontFamily: 'Comic Sans MS, cursive',
                  border: '4px solid #166534',
                  boxShadow: '5px 5px 0 #14532d',
                }}
              >
                🔄 再来一局！
              </button>

              <button
                onClick={() => setGameState('idle')}
                className="bg-gradient-to-br from-gray-300 to-gray-400 hover:from-gray-400 hover:to-gray-500 text-2xl font-black text-gray-700 px-10 py-4 rounded-2xl transform hover:scale-110 transition-all duration-200 shadow-xl"
                style={{
                  fontFamily: 'Comic Sans MS, cursive',
                  border: '4px solid #374151',
                  boxShadow: '5px 5px 0 #1f2937',
                }}
              >
                🏠 返回
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 自定义CSS动画 */}
      <style>{`
        @keyframes wobble {
          0%, 100% { transform: translate(-50%, -50%) rotate(-4deg); }
          50% { transform: translate(-50%, -50%) rotate(4deg); }
        }
        
        @keyframes explodePop {
          0% { 
            opacity: 1; 
            transform: scale(0.5) translate(-50%, -50%);
          }
          50% {
            opacity: 1;
            transform: scale(1.3) translate(-38%, -38%);
          }
          100% { 
            opacity: 0; 
            transform: scale(1.5) translate(-33%, -33%) translateY(-30px);
          }
        }
      `}</style>
    </div>
  );
};

export default App;