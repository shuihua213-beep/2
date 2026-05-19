import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import type { Awareness } from 'y-protocols/awareness';

export interface SharedWallet {
  coins: number;
  totalCoins: number;
}

export interface SharedUpgrades {
  weaponDamage: number;
  weaponFireRate: number;
  camelHealth: number;
  camelSpeed: number;
}

export type UpgradeKey = keyof SharedUpgrades;

export interface RemotePlayer {
  clientId: number;
  name: string;
  color: string;
  activeUpgrade: UpgradeKey | null;
  updatedAt: number;
}

export interface ProviderSnapshot {
  wallet: SharedWallet;
  upgrades: SharedUpgrades;
  remotePlayers: RemotePlayer[];
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
}

interface AwarenessUser {
  actorId: string;
  name: string;
  color: string;
}

interface AwarenessCursor {
  activeUpgrade: UpgradeKey | null;
  updatedAt: number;
}

interface AwarenessState {
  user?: AwarenessUser;
  cursor?: AwarenessCursor;
}

interface WalletOperation {
  type: 'wallet';
  actorId: string;
  timestamp: number;
  wallet: SharedWallet;
}

interface UpgradeOperation {
  type: 'upgrade';
  actorId: string;
  timestamp: number;
  upgradeKey: UpgradeKey;
  level: number;
}

type ProgressOperation = WalletOperation | UpgradeOperation;

type SnapshotListener = (snapshot: ProviderSnapshot) => void;

const CLIENT_STORAGE_KEY = 'desert-ranger-yjs-client-id';
const CURSOR_TTL_MS = 10_000;
const PLAYER_COLORS = ['#f97316', '#06b6d4', '#22c55e', '#a855f7', '#ef4444', '#eab308'];

export const INITIAL_SHARED_WALLET: SharedWallet = {
  coins: 0,
  totalCoins: 0,
};

export const INITIAL_SHARED_UPGRADES: SharedUpgrades = {
  weaponDamage: 0,
  weaponFireRate: 0,
  camelHealth: 0,
  camelSpeed: 0,
};

function getClientId() {
  if (typeof window === 'undefined') {
    return 'server';
  }

  const existing = window.sessionStorage.getItem(CLIENT_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = typeof window.crypto?.randomUUID === 'function'
    ? window.crypto.randomUUID()
    : `player-${Math.random().toString(36).slice(2, 10)}`;

  window.sessionStorage.setItem(CLIENT_STORAGE_KEY, next);
  return next;
}

function pickColor(clientId: string) {
  let hash = 0;
  for (let index = 0; index < clientId.length; index += 1) {
    hash = (hash * 31 + clientId.charCodeAt(index)) % PLAYER_COLORS.length;
  }
  return PLAYER_COLORS[Math.abs(hash)] ?? PLAYER_COLORS[0];
}

function getRoomName() {
  if (typeof window === 'undefined') {
    return 'desert-ranger-progress';
  }

  return `desert-ranger-progress:${window.location.origin}${window.location.pathname}`;
}

function compareByRecency(left: { timestamp: number; actorId: string }, right: { timestamp: number; actorId: string }) {
  if (left.timestamp !== right.timestamp) {
    return left.timestamp - right.timestamp;
  }

  return left.actorId.localeCompare(right.actorId);
}

function clampLevel(level: number) {
  return Math.max(0, Math.min(5, Math.floor(level)));
}

export class YjsSyncProvider {
  private static instance: YjsSyncProvider | null = null;

  public static getInstance() {
    if (!YjsSyncProvider.instance) {
      YjsSyncProvider.instance = new YjsSyncProvider();
    }

    return YjsSyncProvider.instance;
  }

  private readonly clientId = getClientId();
  private readonly user: AwarenessUser = {
    actorId: this.clientId,
    name: `玩家 ${this.clientId.slice(0, 4)}`,
    color: pickColor(this.clientId),
  };

  private readonly listeners = new Set<SnapshotListener>();
  private readonly operations: Y.Array<ProgressOperation>;
  private connectionStatus: ProviderSnapshot['connectionStatus'] = 'connecting';
  private readonly unloadHandler = () => {
    this.awareness.setLocalState(null);
  };
  private readonly emit = () => {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  };

  public readonly doc: Y.Doc;
  public readonly provider: WebrtcProvider;
  public readonly awareness: Awareness;

  private constructor() {
    this.doc = new Y.Doc();
    this.operations = this.doc.getArray<ProgressOperation>('progress-operations');
    this.provider = new WebrtcProvider(getRoomName(), this.doc);
    this.awareness = this.provider.awareness;

    this.awareness.setLocalState({
      user: this.user,
      cursor: {
        activeUpgrade: null,
        updatedAt: 0,
      },
    });

    this.operations.observe(this.emit);
    this.awareness.on('change', this.emit);
    this.provider.on('status', ({ status }: { status: 'connected' | 'disconnected' }) => {
      this.connectionStatus = status;
      this.emit();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', this.unloadHandler);
    }
  }

  public subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.getSnapshot());

    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshot(): ProviderSnapshot {
    return {
      wallet: this.resolveWallet(),
      upgrades: this.resolveUpgrades(),
      remotePlayers: this.resolveRemotePlayers(),
      connectionStatus: this.connectionStatus,
    };
  }

  public publishWallet(wallet: SharedWallet) {
    this.operations.push([
      {
        type: 'wallet',
        actorId: this.clientId,
        timestamp: Date.now(),
        wallet: {
          coins: Math.max(0, Math.floor(wallet.coins)),
          totalCoins: Math.max(0, Math.floor(wallet.totalCoins)),
        },
      },
    ]);
  }

  public publishUpgrade(upgradeKey: UpgradeKey, level: number) {
    this.operations.push([
      {
        type: 'upgrade',
        actorId: this.clientId,
        timestamp: Date.now(),
        upgradeKey,
        level: clampLevel(level),
      },
    ]);
  }

  public setActiveUpgrade(upgradeKey: UpgradeKey | null) {
    this.awareness.setLocalStateField('cursor', {
      activeUpgrade: upgradeKey,
      updatedAt: Date.now(),
    } satisfies AwarenessCursor);
  }

  public destroy() {
    this.operations.unobserve(this.emit);
    this.awareness.off('change', this.emit);
    this.awareness.setLocalState(null);
    this.provider.destroy();
    this.doc.destroy();
    this.listeners.clear();

    if (typeof window !== 'undefined') {
      window.removeEventListener('beforeunload', this.unloadHandler);
    }

    YjsSyncProvider.instance = null;
  }

  private resolveWallet(): SharedWallet {
    const operations = this.operations.toArray() as ProgressOperation[];
    const walletOperations = operations
      .filter((operation: ProgressOperation): operation is WalletOperation => operation.type === 'wallet')
      .sort(compareByRecency);
    const latestWallet = walletOperations[walletOperations.length - 1];

    return latestWallet?.wallet ?? INITIAL_SHARED_WALLET;
  }

  private resolveUpgrades(): SharedUpgrades {
    const operations = this.operations.toArray() as ProgressOperation[];

    return operations
      .filter((operation: ProgressOperation): operation is UpgradeOperation => operation.type === 'upgrade')
      .reduce<SharedUpgrades>((current: SharedUpgrades, operation: UpgradeOperation) => {
        current[operation.upgradeKey] = Math.max(current[operation.upgradeKey], clampLevel(operation.level));
        return current;
      }, { ...INITIAL_SHARED_UPGRADES });
  }

  private resolveRemotePlayers(): RemotePlayer[] {
    const now = Date.now();
    const awarenessStates = Array.from(this.awareness.getStates().entries()) as Array<[number, AwarenessState]>;

    return awarenessStates
      .filter(([clientId]) => clientId !== this.doc.clientID)
      .map(([clientId, state]) => {
        const user = state.user;

        if (!user) {
          return null;
        }

        const cursor = state.cursor;
        const isCursorFresh = cursor && now - cursor.updatedAt <= CURSOR_TTL_MS;

        return {
          clientId,
          name: user.name,
          color: user.color,
          activeUpgrade: isCursorFresh ? cursor?.activeUpgrade ?? null : null,
          updatedAt: cursor?.updatedAt ?? 0,
        } satisfies RemotePlayer;
      })
      .filter((player): player is RemotePlayer => player !== null)
      .sort((left, right) => left.name.localeCompare(right.name));
  }
}
