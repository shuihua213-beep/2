const STORAGE_PREFIX = 'cloud_sync_';
const CURRENT_USER_KEY = 'cloud_sync_current_user';

export interface SyncData {
  userId: string;
  timestamp: number;
  upgrades: Record<string, number>;
  coins: number;
  totalCoins: number;
  artifacts: number;
}

export function login(): string | null {
  const userId = window.prompt('请输入你的用户 ID：');
  if (userId && userId.trim()) {
    localStorage.setItem(CURRENT_USER_KEY, userId.trim());
    return userId.trim();
  }
  return null;
}

export function getCurrentUser(): string | null {
  return localStorage.getItem(CURRENT_USER_KEY);
}

export function logout(): void {
  localStorage.removeItem(CURRENT_USER_KEY);
}

export function uploadData(data: Omit<SyncData, 'userId' | 'timestamp'>): boolean {
  const userId = getCurrentUser();
  if (!userId) return false;

  const syncData: SyncData = {
    userId,
    timestamp: Date.now(),
    ...data,
  };

  localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(syncData));
  return true;
}

export function downloadData(): SyncData | null {
  const userId = getCurrentUser();
  if (!userId) return null;

  const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as SyncData;
  } catch {
    return null;
  }
}

export function mergeData(local: SyncData, remote: SyncData): SyncData {
  if (remote.timestamp <= local.timestamp) {
    return local;
  }

  const mergedUpgrades: Record<string, number> = {};
  const allKeys = new Set([...Object.keys(local.upgrades), ...Object.keys(remote.upgrades)]);

  for (const key of allKeys) {
    mergedUpgrades[key] = Math.max(
      local.upgrades[key] || 0,
      remote.upgrades[key] || 0
    );
  }

  return {
    userId: local.userId,
    timestamp: Math.max(local.timestamp, remote.timestamp),
    upgrades: mergedUpgrades,
    coins: Math.max(local.coins, remote.coins),
    totalCoins: Math.max(local.totalCoins, remote.totalCoins),
    artifacts: Math.max(local.artifacts, remote.artifacts),
  };
}

export function exportDataJSON(): string | null {
  const userId = getCurrentUser();
  if (!userId) return null;

  const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
  return raw;
}

export function importDataJSON(jsonStr: string): SyncData | null {
  const userId = getCurrentUser();
  if (!userId) return null;

  let imported: SyncData;
  try {
    imported = JSON.parse(jsonStr) as SyncData;
  } catch {
    return null;
  }

  const existing = downloadData();

  let finalData: SyncData;
  if (existing) {
    finalData = mergeData({ ...existing, userId }, imported);
  } else {
    finalData = imported;
  }

  finalData.userId = userId;
  localStorage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(finalData));
  return finalData;
}
