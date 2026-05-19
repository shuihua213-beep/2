
export interface SaveData {
  totalCoins: number;
  artifacts: number;
  upgrades: {
    weaponDamage: number;
    weaponFireRate: number;
    camelHealth: number;
    camelSpeed: number;
  };
  updatedAt: number;
}

const CLOUD_STORAGE_KEY = 'cloud-sync-data';
const CURRENT_USER_KEY = 'current-user-id';

export class CloudSync {
  static getCurrentUserId(): string | null {
    return localStorage.getItem(CURRENT_USER_KEY);
  }

  static setCurrentUserId(userId: string): void {
    localStorage.setItem(CURRENT_USER_KEY, userId);
  }

  static logout(): void {
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  static upload(data: Omit<SaveData, 'updatedAt'>): boolean {
    const userId = this.getCurrentUserId();
    if (!userId) return false;

    const cloudData = this.getCloudData();
    const saveData: SaveData = {
      ...data,
      updatedAt: Date.now(),
    };

    cloudData[userId] = saveData;
    localStorage.setItem(CLOUD_STORAGE_KEY, JSON.stringify(cloudData));
    return true;
  }

  static download(): SaveData | null {
    const userId = this.getCurrentUserId();
    if (!userId) return null;

    const cloudData = this.getCloudData();
    return cloudData[userId] || null;
  }

  static merge(localData: Omit<SaveData, 'updatedAt'>, cloudData: SaveData): SaveData {
    // For upgrades, take the max level
    const mergedUpgrades = {
      weaponDamage: Math.max(localData.upgrades.weaponDamage, cloudData.upgrades.weaponDamage),
      weaponFireRate: Math.max(localData.upgrades.weaponFireRate, cloudData.upgrades.weaponFireRate),
      camelHealth: Math.max(localData.upgrades.camelHealth, cloudData.upgrades.camelHealth),
      camelSpeed: Math.max(localData.upgrades.camelSpeed, cloudData.upgrades.camelSpeed),
    };

    // For coins and artifacts, take the max
    const mergedTotalCoins = Math.max(localData.totalCoins, cloudData.totalCoins);
    const mergedArtifacts = Math.max(localData.artifacts, cloudData.artifacts);

    return {
      totalCoins: mergedTotalCoins,
      artifacts: mergedArtifacts,
      upgrades: mergedUpgrades,
      updatedAt: Date.now(),
    };
  }

  private static getCloudData(): Record<string, SaveData> {
    const data = localStorage.getItem(CLOUD_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }
}
