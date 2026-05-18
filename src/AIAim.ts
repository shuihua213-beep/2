import * as tf from '@tensorflow/tfjs';

interface EnemyData {
  id: number;
  x: number;
  y: number;
  speed: number;
}

export class AIAim {
  private model: tf.Sequential | null = null;
  private isLoaded: boolean = false;
  private isLoading: boolean = false;

  async loadModel(): Promise<void> {
    if (this.isLoaded || this.isLoading) return;
    this.isLoading = true;

    // Create a simple linear regression model for prediction
    const model = tf.sequential();
    model.add(tf.layers.dense({ inputShape: [3], units: 1 }));
    model.compile({ loss: 'meanSquaredError', optimizer: 'sgd' });

    // Train the model with dummy data (predicting future position based on current x, y, speed)
    const xs = tf.tensor2d([
      [100, 300, 2],
      [200, 280, 3],
      [300, 320, 2.5],
      [400, 290, 3.5],
      [500, 310, 2],
    ]);
    const ys = tf.tensor2d([[90], [190], [295], [395], [495]]);

    await model.fit(xs, ys, { epochs: 50 });

    this.model = model;
    this.isLoaded = true;
    this.isLoading = false;
  }

  getIsLoaded(): boolean {
    return this.isLoaded;
  }

  getIsLoading(): boolean {
    return this.isLoading;
  }

  predictEnemyPosition(enemy: EnemyData): { x: number; y: number } {
    // Simple prediction: enemy moves left by speed (since they move from right to left)
    // Also use the model for a slightly smarter prediction
    let predictedX = enemy.x - enemy.speed * 5; // Predict 5 frames ahead
    let predictedY = enemy.y;

    if (this.model) {
      const input = tf.tensor2d([[enemy.x, enemy.y, enemy.speed]]);
      const prediction = this.model.predict(input) as tf.Tensor2D;
      const result = prediction.dataSync();
      predictedX = result[0];
      prediction.dispose();
      input.dispose();
    }

    return { x: predictedX, y: predictedY };
  }

  selectBestTarget(
    enemies: EnemyData[],
    playerX: number,
    playerY: number
  ): { x: number; y: number } | null {
    if (enemies.length === 0) return null;

    let bestTarget: { x: number; y: number } | null = null;
    let bestScore = -Infinity;

    for (const enemy of enemies) {
      const predicted = this.predictEnemyPosition(enemy);
      
      // Score based on distance (closer is better)
      const dx = predicted.x - playerX;
      const dy = predicted.y - playerY;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const score = 1000 - distance; // Higher score for closer enemies

      if (score > bestScore) {
        bestScore = score;
        bestTarget = predicted;
      }
    }

    return bestTarget;
  }
}
