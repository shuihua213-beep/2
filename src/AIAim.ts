export interface EnemySnapshot {
  id: number;
  x: number;
  y: number;
  speed: number;
  health: number;
  maxHealth: number;
  type: 'horse' | 'motorcycle';
}

interface AimAssistModelFile {
  inputSize: number;
  outputSize: number;
  lookAheadFrames: number;
  kernel: number[][];
  bias: number[];
}

interface TensorLike {
  arraySync(): unknown;
  dispose(): void;
}

interface LayersModelLike {
  add(layer: unknown): void;
  setWeights(weights: TensorLike[]): void;
  predict(input: TensorLike): TensorLike | TensorLike[];
  dispose(): void;
}

interface TensorFlowLike {
  ready(): Promise<void>;
  sequential(): LayersModelLike;
  tensor2d(values: number[][], shape?: [number, number]): TensorLike;
  tensor1d(values: number[]): TensorLike;
  tidy<T>(callback: () => T): T;
  layers: {
    dense(config: {
      inputShape?: number[];
      units: number;
      useBias: boolean;
      activation: 'linear';
    }): unknown;
  };
}

declare global {
  interface Window {
    tf?: TensorFlowLike;
  }
}

const MODEL_URL = new URL('./aim-assist-model.json', import.meta.url).href;
const BULLET_SPEED = 15;

export interface AimTarget {
  enemyId: number;
  x: number;
  y: number;
  confidence: number;
}

export class AIAimAssistant {
  private model: LayersModelLike | null = null;
  private loadTask: Promise<void> | null = null;
  private lookAheadFrames = 12;

  async load() {
    if (this.model) {
      return;
    }

    if (!this.loadTask) {
      this.loadTask = this.initialize().catch((error) => {
        this.loadTask = null;
        throw error;
      });
    }

    return this.loadTask;
  }

  isReady() {
    return this.model !== null;
  }

  chooseTarget(params: {
    enemies: EnemySnapshot[];
    shooterX: number;
    shooterY: number;
    clickX: number;
    clickY: number;
    gameWidth: number;
    gameHeight: number;
  }): AimTarget | null {
    if (!this.model || params.enemies.length === 0) {
      return null;
    }

    const predictions = this.predictPositions(
      params.enemies.map((enemy) => [enemy.x, enemy.y - 20, -enemy.speed, 0]),
    );

    let bestTarget: AimTarget | null = null;

    params.enemies.forEach((enemy, index) => {
      const prediction = predictions[index] ?? [enemy.x, enemy.y - 20];
      const [predictedX, predictedY] = prediction;
      const distanceFromShooter = Math.hypot(predictedX - params.shooterX, predictedY - params.shooterY);
      const travelFrames = distanceFromShooter / BULLET_SPEED;
      const frameGap = Math.abs(travelFrames - this.lookAheadFrames);
      const clickDistance = Math.hypot(predictedX - params.clickX, predictedY - params.clickY);
      const isOnScreen = predictedX >= params.shooterX && predictedX <= params.gameWidth + 40 && predictedY >= 0 && predictedY <= params.gameHeight;
      const score =
        (isOnScreen ? 1.1 : -2) +
        1 / (1 + frameGap) +
        1 / (1 + distanceFromShooter / 260) +
        1 / (1 + clickDistance / 180) +
        (enemy.health / enemy.maxHealth) * 0.1 +
        (enemy.type === 'motorcycle' ? 0.08 : 0);

      if (!bestTarget || score > bestTarget.confidence) {
        bestTarget = {
          enemyId: enemy.id,
          x: predictedX,
          y: predictedY,
          confidence: score,
        };
      }
    });

    return bestTarget;
  }

  dispose() {
    this.model?.dispose();
    this.model = null;
    this.loadTask = null;
  }

  private async initialize() {
    const tf = window.tf;

    if (!tf) {
      throw new Error('TensorFlow.js unavailable');
    }

    await tf.ready();

    const response = await fetch(MODEL_URL);
    if (!response.ok) {
      throw new Error('Model file unavailable');
    }

    const modelFile = (await response.json()) as AimAssistModelFile;
    this.lookAheadFrames = modelFile.lookAheadFrames;

    const model = tf.sequential();
    model.add(
      tf.layers.dense({
        inputShape: [modelFile.inputSize],
        units: modelFile.outputSize,
        useBias: true,
        activation: 'linear',
      }),
    );

    const kernelTensor = tf.tensor2d(modelFile.kernel, [modelFile.inputSize, modelFile.outputSize]);
    const biasTensor = tf.tensor1d(modelFile.bias);
    model.setWeights([kernelTensor, biasTensor]);
    kernelTensor.dispose();
    biasTensor.dispose();

    this.model = model;
  }

  private predictPositions(features: number[][]) {
    if (!this.model) {
      return [] as number[][];
    }

    return window.tf!.tidy(() => {
      const inputTensor = window.tf!.tensor2d(features, [features.length, 4]);
      const predictionTensor = this.model!.predict(inputTensor);
      const outputTensor = Array.isArray(predictionTensor) ? predictionTensor[0] : predictionTensor;
      const values = outputTensor.arraySync() as number[][];
      inputTensor.dispose();
      outputTensor.dispose();
      return values;
    });
  }
}
