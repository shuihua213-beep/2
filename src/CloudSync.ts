export interface Upgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

export interface SyncData {
  timestamp: number;
  coins: number;
  artifacts: number;
  upgrades: Upgrades;
}

export class CloudSync {
  static getCloudData(userId: string): SyncData | null {
    const data = localStorage.getItem(`cloud_sync_${userId}`);
    return data ? JSON.parse(data) : null;
  }

  static setCloudData(userId: string, data: SyncData): void {
    localStorage.setItem(`cloud_sync_${userId}`, JSON.stringify(data));
  }

  static upload(userId: string, localData: Omit<SyncData, 'timestamp'>): SyncData {
    const cloudData = this.getCloudData(userId);
    const now = Date.now();
    
    if (!cloudData) {
      const newData = { ...localData, timestamp: now };
      this.setCloudData(userId, newData);
      return newData;
    }

    const mergedData: SyncData = {
      timestamp: now,
      coins: localData.coins, // 上传时以本地最新数据为准
      artifacts: localData.artifacts,
      upgrades: {
        weaponDamage: Math.max(localData.upgrades.weaponDamage, cloudData.upgrades.weaponDamage),
        weaponFireRate: Math.max(localData.upgrades.weaponFireRate, cloudData.upgrades.weaponFireRate),
        camelHealth: Math.max(localData.upgrades.camelHealth, cloudData.upgrades.camelHealth),
        camelSpeed: Math.max(localData.upgrades.camelSpeed, cloudData.upgrades.camelSpeed),
      }
    };
    
    this.setCloudData(userId, mergedData);
    return mergedData;
  }

  static sync(userId: string, localData: Omit<SyncData, 'timestamp'>, localLastUpdated: number): SyncData {
    const cloudData = this.getCloudData(userId);
    
    if (!cloudData) {
      const newData = { ...localData, timestamp: localLastUpdated || Date.now() };
      this.setCloudData(userId, newData);
      return newData;
    }

    const isCloudNewer = cloudData.timestamp > (localLastUpdated || 0);

    const mergedData: SyncData = {
      timestamp: Math.max(cloudData.timestamp, localLastUpdated || 0),
      // 冲突处理：以最后更新时间戳为准
      coins: isCloudNewer ? cloudData.coins : localData.coins,
      artifacts: isCloudNewer ? cloudData.artifacts : localData.artifacts,
      // 技能树：保留最高等级
      upgrades: {
        weaponDamage: Math.max(localData.upgrades.weaponDamage, cloudData.upgrades.weaponDamage),
        weaponFireRate: Math.max(localData.upgrades.weaponFireRate, cloudData.upgrades.weaponFireRate),
        camelHealth: Math.max(localData.upgrades.camelHealth, cloudData.upgrades.camelHealth),
        camelSpeed: Math.max(localData.upgrades.camelSpeed, cloudData.upgrades.camelSpeed),
      }
    };

    this.setCloudData(userId, mergedData);
    return mergedData;
  }
}
