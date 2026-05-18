/* eslint-disable @typescript-eslint/no-explicit-any */
declare const tf: any;

const BULLET_SPEED = 15;

export interface EnemyInput {
  x: number;
  y: number;
  speed: number;
}

export interface AimResult {
  targetX: number;
  targetY: number;
}

type StatusCallback = (status: string) => void;

export class AIAim {
  private model: any = null;
  private _isReady = false;
  private _isLoading = true;
  private listeners: StatusCallback[] = [];

  get isReady() {
    return this._isReady;
  }

  get isLoading() {
    return this._isLoading;
  }

  constructor() {
    this.init();
  }

  onStatusChange(cb: StatusCallback) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  private emit(status: string) {
    this.listeners.forEach((fn) => fn(status));
  }

  private async init() {
    this.emit('AI 加载中...');
    try {
      await tf.ready();

      this.model = tf.sequential();
      this.model.add(
        tf.layers.dense({
          inputShape: [3],
          units: 2,
          activation: 'linear',
        }),
      );

      this.model.compile({
        optimizer: tf.train.sgd(0.02),
        loss: 'meanSquaredError',
      });

      const { xs, ys } = this.generateTrainingData(2000);

      this.emit('AI 训练中...');

      await this.model.fit(xs, ys, {
        epochs: 80,
        batchSize: 64,
        shuffle: true,
      });

      xs.dispose();
      ys.dispose();

      this._isReady = true;
      this._isLoading = false;
      this.emit('AI 就绪');
    } catch (err) {
      console.error('AI 模型加载失败:', err);
      this._isLoading = false;
      this.emit('AI 加载失败');
    }
  }

  private generateTrainingData(samples: number) {
    const inputs: number[] = [];
    const outputs: number[] = [];

    for (let i = 0; i < samples; i++) {
      const dx = Math.random() * 700 + 50;
      const dy = (Math.random() - 0.5) * 200;
      const speed = Math.random() * 5 + 1;

      const time = dx / BULLET_SPEED;
      const leadX = -speed * time;
      const leadY = 0;

      inputs.push(dx, dy, speed);
      outputs.push(leadX, leadY);
    }

    return {
      xs: tf.tensor2d(inputs, [samples, 3]),
      ys: tf.tensor2d(outputs, [samples, 2]),
    };
  }

  getBestAim(
    enemies: EnemyInput[],
    playerX: number,
    playerY: number,
  ): AimResult | null {
    if (enemies.length === 0) return null;

    const startX = playerX + 60;
    const startY = playerY - 80;

    let bestTargetX = 0;
    let bestTargetY = 0;
    let bestScore = Infinity;

    for (const enemy of enemies) {
      const dx = enemy.x - startX;
      const dy = enemy.y - 20 - startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dx <= 0) continue;

      let leadX: number;
      let leadY: number;

      if (this._isReady && this.model) {
        const tensor = tf.tensor2d([[dx, dy, enemy.speed]]);
        const pred = this.model.predict(tensor);
        const result = pred.dataSync();
        leadX = result[0];
        leadY = result[1];
        tensor.dispose();
        pred.dispose();
      } else {
        const time = dx / BULLET_SPEED;
        leadX = -enemy.speed * time;
        leadY = 0;
      }

      const targetX = enemy.x + leadX;
      const targetY = enemy.y - 20 + leadY;

      if (dist < bestScore) {
        bestScore = dist;
        bestTargetX = targetX;
        bestTargetY = targetY;
      }
    }

    if (bestScore === Infinity) return null;

    return { targetX: bestTargetX, targetY: bestTargetY };
  }
}