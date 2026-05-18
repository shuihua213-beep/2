// AIAim.ts
// @ts-ignore
const tf = window.tf;

let aimModel: any = null;
let isLoading = false;

export const initAimModel = async (onProgress?: (msg: string) => void) => {
  if (aimModel) return aimModel;
  if (isLoading) {
    // 简单的轮询等待
    while (isLoading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return aimModel;
  }

  isLoading = true;
  try {
    if (onProgress) onProgress('AI 加载中');
    aimModel = await tf.loadLayersModel('indexeddb://aim-model');
    console.log('Model loaded from IndexedDB');
    return aimModel;
  } catch (e) {
    console.log('No local model found, starting online training...');
    if (onProgress) onProgress('AI 加载中');
    
    // Create a simple linear regression model
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 2, inputShape: [6] }));
    model.compile({ optimizer: 'sgd', loss: 'meanSquaredError' });

    // Generate some synthetic training data
    // Inputs: [E_x, E_y, V_e, B_x, B_y, V_b]
    // Outputs: [Target_X, Target_Y]
    const numSamples = 500;
    const inputs = [];
    const outputs = [];

    for (let i = 0; i < numSamples; i++) {
      const Ex = 400 + Math.random() * 500;
      const Ey = 300 + Math.random() * 100;
      const Ve = 2 + Math.random() * 5;
      const Bx = 180; // PLAYER_X + 60
      const By = 300; // GROUND_Y - 80
      const Vb = 15; // bullet speed

      // Approximate time to reach
      const dx = Ex - Bx;
      const dy = Ey - By;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = dist / Vb;
      
      const targetX = Ex - Ve * t;
      const targetY = Ey;

      inputs.push([Ex, Ey, Ve, Bx, By, Vb]);
      outputs.push([targetX, targetY]);
    }

    const xs = tf.tensor2d(inputs, [numSamples, 6]);
    const ys = tf.tensor2d(outputs, [numSamples, 2]);

    await model.fit(xs, ys, {
      epochs: 50,
      callbacks: {
        onEpochEnd: (epoch: number, logs: any) => {
          if (epoch % 10 === 0) {
            console.log(`Epoch ${epoch}: loss = ${logs.loss}`);
          }
        }
      }
    });

    aimModel = model;
    
    try {
      await aimModel.save('indexeddb://aim-model');
      console.log('Model saved to IndexedDB');
    } catch (saveErr) {
      console.error('Failed to save model', saveErr);
    }

    return aimModel;
  } finally {
    isLoading = false;
  }
};

export const predictAim = (enemyX: number, enemyY: number, enemySpeed: number, bulletX: number, bulletY: number, bulletSpeed: number) => {
  if (!aimModel) return { x: enemyX, y: enemyY };
  
  return tf.tidy(() => {
    const input = tf.tensor2d([[enemyX, enemyY, enemySpeed, bulletX, bulletY, bulletSpeed]]);
    const output = aimModel.predict(input);
    const data = output.dataSync();
    return {
      x: data[0],
      y: data[1]
    };
  });
};
