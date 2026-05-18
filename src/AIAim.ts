import * as tf from '@tensorflow/tfjs';

export interface EnemyInfo {
  x: number;
  y: number;
  speed: number;
}

export interface AimResult {
  targetX: number;
  targetY: number;
  bestEnemyIndex: number;
}

export class AIAimAssistant {
  private model: tf.LayersModel | null = null;
  private _isReady = false;
  private _isLoading = false;

  get isReady(): boolean {
    return this._isReady;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  async init(): Promise<void> {
    if (this._isReady || this._isLoading) return;
    this._isLoading = true;

    try {
      await tf.ready();

      this.model = tf.sequential();
      this.model.add(
        tf.layers.dense({ inputShape: [4], units: 16, activation: 'relu' })
      );
      this.model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
      this.model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

      this.model.compile({
        optimizer: tf.train.adam(0.01),
        loss: 'meanSquaredError',
      });

      const { xs, ys } = this.generateTrainingData(500);

      await this.model.fit(xs, ys, {
        epochs: 30,
        batchSize: 64,
        shuffle: true,
        verbose: 0,
      });

      xs.dispose();
      ys.dispose();

      this._isReady = true;
    } catch (e) {
      console.error('AI model init failed:', e);
    } finally {
      this._isLoading = false;
    }
  }

  private generateTrainingData(samples: number) {
    const features: number[][] = [];
    const labels: number[][] = [];

    for (let i = 0; i < samples; i++) {
      const distance = 100 + Math.random() * 700;
      const enemySpeed = 1 + Math.random() * 5;
      const bulletSpeed = 10 + Math.random() * 10;
      const angle = Math.random() * Math.PI * 0.5 - Math.PI * 0.25;

      const timeToIntercept = distance / (bulletSpeed + enemySpeed * Math.cos(angle));

      features.push([
        distance / 800,
        enemySpeed / 5,
        bulletSpeed / 20,
        angle / Math.PI,
      ]);
      labels.push([Math.max(0, timeToIntercept) / 5]);
    }

    return {
      xs: tf.tensor2d(features),
      ys: tf.tensor2d(labels),
    };
  }

  predictBestTarget(
    enemies: EnemyInfo[],
    bulletStartX: number,
    bulletStartY: number,
    bulletSpeed: number
  ): AimResult | null {
    if (!this.model || !this._isReady || enemies.length === 0) return null;

    let bestIndex = 0;
    let bestScore = Infinity;
    let bestTime = 0;

    const features: number[][] = [];

    enemies.forEach((enemy) => {
      const dx = enemy.x - bulletStartX;
      const dy = enemy.y - bulletStartY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      features.push([
        distance / 800,
        enemy.speed / 5,
        bulletSpeed / 20,
        angle / Math.PI,
      ]);
    });

    const inputTensor = tf.tensor2d(features);
    const prediction = this.model.predict(inputTensor) as tf.Tensor;
    const times = prediction.dataSync();

    inputTensor.dispose();
    prediction.dispose();

    for (let i = 0; i < enemies.length; i++) {
      const predictedTime = times[i] * 5;
      if (predictedTime < bestScore) {
        bestScore = predictedTime;
        bestTime = predictedTime;
        bestIndex = i;
      }
    }

    const bestEnemy = enemies[bestIndex];
    const predictedX = bestEnemy.x - bestEnemy.speed * bestTime;
    const predictedY = bestEnemy.y;

    return {
      targetX: predictedX,
      targetY: predictedY,
      bestEnemyIndex: bestIndex,
    };
  }

  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
      this._isReady = false;
    }
  }
}
