export interface Upgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

export interface SyncProgress {
  totalCoins: number;
  artifacts: number;
  upgrades: Upgrades;
  updatedAt: number;
}

export interface CloudRecord extends SyncProgress {
  userId: string;
}

export const DEFAULT_UPGRADES: Upgrades = {
  weaponDamage: 0,
  weaponFireRate: 0,
  camelHealth: 0,
  camelSpeed: 0,
};

const LOCAL_PROGRESS_KEY = 'dune-ranger-local-progress';
const CLOUD_RECORDS_KEY = 'dune-ranger-cloud-records';
const SAVED_USER_KEY = 'dune-ranger-cloud-user-id';

const getStorage = () => {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
};

const clampLevel = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(5, Math.floor(value)));
};

const normalizeUpgrades = (value: unknown): Upgrades => {
  const source = typeof value === 'object' && value !== null ? value as Partial<Record<keyof Upgrades, unknown>> : {};

  return {
    weaponDamage: clampLevel(source.weaponDamage),
    weaponFireRate: clampLevel(source.weaponFireRate),
    camelHealth: clampLevel(source.camelHealth),
    camelSpeed: clampLevel(source.camelSpeed),
  };
};

const toNonNegativeInteger = (value: unknown): number | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
};

const toTimestamp = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return value;
};

const normalizeProgress = (value: unknown): SyncProgress | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const source = value as Partial<Record<keyof SyncProgress, unknown>>;
  const totalCoins = toNonNegativeInteger(source.totalCoins);
  const artifacts = toNonNegativeInteger(source.artifacts);

  if (totalCoins === null || artifacts === null) {
    return null;
  }

  return {
    totalCoins,
    artifacts,
    upgrades: normalizeUpgrades(source.upgrades),
    updatedAt: toTimestamp(source.updatedAt),
  };
};

export const createDefaultProgress = (): SyncProgress => ({
  totalCoins: 0,
  artifacts: 0,
  upgrades: { ...DEFAULT_UPGRADES },
  updatedAt: 0,
});

export const loadLocalProgress = (): SyncProgress | null => {
  const storage = getStorage();
  const raw = storage?.getItem(LOCAL_PROGRESS_KEY);

  if (!raw) {
    return null;
  }

  try {
    return normalizeProgress(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const saveLocalProgress = (progress: SyncProgress) => {
  const storage = getStorage();
  storage?.setItem(LOCAL_PROGRESS_KEY, JSON.stringify(progress));
};

export const loadSavedUserId = () => {
  const storage = getStorage();
  return storage?.getItem(SAVED_USER_KEY) ?? '';
};

export const saveSavedUserId = (userId: string) => {
  const storage = getStorage();
  storage?.setItem(SAVED_USER_KEY, userId);
};

const loadCloudRecords = (): Record<string, CloudRecord> => {
  const storage = getStorage();
  const raw = storage?.getItem(CLOUD_RECORDS_KEY);

  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return {};
    }

    return Object.entries(parsed).reduce<Record<string, CloudRecord>>((records, [userId, value]) => {
      const record = parseCloudRecord(JSON.stringify(value));
      if (record && record.userId === userId) {
        records[userId] = record;
      }
      return records;
    }, {});
  } catch {
    return {};
  }
};

const saveCloudRecords = (records: Record<string, CloudRecord>) => {
  const storage = getStorage();
  storage?.setItem(CLOUD_RECORDS_KEY, JSON.stringify(records));
};

export const loadCloudRecord = (userId: string): CloudRecord | null => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    return null;
  }

  const records = loadCloudRecords();
  return records[normalizedUserId] ?? null;
};

export const saveCloudRecord = (record: CloudRecord) => {
  const normalizedUserId = record.userId.trim();
  if (!normalizedUserId) {
    return;
  }

  const records = loadCloudRecords();
  records[normalizedUserId] = {
    ...record,
    userId: normalizedUserId,
    upgrades: { ...record.upgrades },
  };
  saveCloudRecords(records);
};

export const exportCloudRecord = (record: CloudRecord) => JSON.stringify(record, null, 2);

export const parseCloudRecord = (serialized: string): CloudRecord | null => {
  try {
    const parsed = JSON.parse(serialized);
    if (typeof parsed !== 'object' || parsed === null || typeof parsed.userId !== 'string' || !parsed.userId.trim()) {
      return null;
    }

    const progress = normalizeProgress(parsed);
    if (!progress) {
      return null;
    }

    return {
      userId: parsed.userId.trim(),
      ...progress,
    };
  } catch {
    return null;
  }
};

export const mergeSyncProgress = (local: SyncProgress, remote: SyncProgress): SyncProgress => {
  const localIsNewer = local.updatedAt > remote.updatedAt;
  const timestampsEqual = local.updatedAt === remote.updatedAt;

  return {
    totalCoins: timestampsEqual ? Math.max(local.totalCoins, remote.totalCoins) : localIsNewer ? local.totalCoins : remote.totalCoins,
    artifacts: timestampsEqual ? Math.max(local.artifacts, remote.artifacts) : localIsNewer ? local.artifacts : remote.artifacts,
    upgrades: {
      weaponDamage: Math.max(local.upgrades.weaponDamage, remote.upgrades.weaponDamage),
      weaponFireRate: Math.max(local.upgrades.weaponFireRate, remote.upgrades.weaponFireRate),
      camelHealth: Math.max(local.upgrades.camelHealth, remote.upgrades.camelHealth),
      camelSpeed: Math.max(local.upgrades.camelSpeed, remote.upgrades.camelSpeed),
    },
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
};
