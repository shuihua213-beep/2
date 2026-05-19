import * as Y from 'yjs';
import { YjsSyncProvider } from './YjsSyncProvider';

export interface GameSyncState {
  coins: number;
  totalCoins: number;
  score: number;
  artifacts: number;
  upgrades: {
    weaponDamage: number;
    weaponFireRate: number;
    camelHealth: number;
    camelSpeed: number;
  };
}

export interface RemoteCursor {
  userId: string;
  skillType: string | null;
  timestamp: number;
}

export class YjsBinding {
  private ydoc: Y.Doc;
  private ygame: Y.Map<unknown>;
  private yupgrades: Y.Map<number>;
  private awareness: YjsSyncProvider['awareness'];
  private localUserId: string;
  private onChangeCallback: ((state: GameSyncState) => void) | null = null;
  private onCursorChangeCallback: ((cursors: RemoteCursor[]) => void) | null = null;
  private isLocalUpdate: boolean = false;

  constructor(provider: YjsSyncProvider) {
    this.ydoc = provider.ydoc;
    this.awareness = provider.awareness;
    this.localUserId = provider.userId;

    this.ygame = this.ydoc.getMap('game');
    this.yupgrades = this.ygame.get('upgrades') as Y.Map<number>;

    if (!this.yupgrades) {
      this.yupgrades = new Y.Map<number>();
      this.yupgrades.set('weaponDamage', 0);
      this.yupgrades.set('weaponFireRate', 0);
      this.yupgrades.set('camelHealth', 0);
      this.yupgrades.set('camelSpeed', 0);
      this.ygame.set('upgrades', this.yupgrades);
    }

    if (!this.ygame.has('coins')) {
      this.ygame.set('coins', 0);
      this.ygame.set('totalCoins', 0);
      this.ygame.set('score', 0);
      this.ygame.set('artifacts', 0);
    }

    this.ygame.observe(this.handleGameChange);
    this.yupgrades.observe(this.handleUpgradeChange);
    this.awareness.on('change', this.handleAwarenessChange);
  }

  private handleGameChange = () => {
    if (this.isLocalUpdate) return;
    this.notifyChange();
  };

  private handleUpgradeChange = () => {
    if (this.isLocalUpdate) return;
    this.notifyChange();
  };

  private handleAwarenessChange = () => {
    if (!this.onCursorChangeCallback) return;

    const states = Array.from(this.awareness.getStates().entries()) as [number, { userId: string; cursor?: { skillType: string | null; timestamp: number } }][];
    const cursors: RemoteCursor[] = states
      .filter(([_, state]) => state?.userId !== this.localUserId)
      .map(([_, state]) => ({
        userId: state.userId,
        skillType: state.cursor?.skillType || null,
        timestamp: state.cursor?.timestamp || 0,
      }))
      .filter((c): c is RemoteCursor => c.skillType !== null);

    this.onCursorChangeCallback(cursors);
  };

  private notifyChange = () => {
    if (!this.onChangeCallback) return;
    const state = this.getSyncState();
    this.onChangeCallback(state);
  };

  getSyncState(): GameSyncState {
    return {
      coins: this.ygame.get('coins') as number,
      totalCoins: this.ygame.get('totalCoins') as number,
      score: this.ygame.get('score') as number,
      artifacts: this.ygame.get('artifacts') as number,
      upgrades: {
        weaponDamage: this.yupgrades.get('weaponDamage') || 0,
        weaponFireRate: this.yupgrades.get('weaponFireRate') || 0,
        camelHealth: this.yupgrades.get('camelHealth') || 0,
        camelSpeed: this.yupgrades.get('camelSpeed') || 0,
      },
    };
  }

  updateCoins(coins: number, totalCoins: number) {
    this.isLocalUpdate = true;
    this.ydoc.transact(() => {
      const currentCoins = this.ygame.get('coins') as number;
      const currentTotal = this.ygame.get('totalCoins') as number;
      
      if (coins > currentCoins) {
        this.ygame.set('coins', coins);
      }
      if (totalCoins > currentTotal) {
        this.ygame.set('totalCoins', totalCoins);
      }
    });
    this.isLocalUpdate = false;
  }

  updateScore(score: number) {
    this.isLocalUpdate = true;
    this.ydoc.transact(() => {
      const currentScore = this.ygame.get('score') as number;
      if (score > currentScore) {
        this.ygame.set('score', score);
      }
    });
    this.isLocalUpdate = false;
  }

  updateArtifacts(artifacts: number) {
    this.isLocalUpdate = true;
    this.ydoc.transact(() => {
      const currentArtifacts = this.ygame.get('artifacts') as number;
      if (artifacts > currentArtifacts) {
        this.ygame.set('artifacts', artifacts);
      }
    });
    this.isLocalUpdate = false;
  }

  upgradeSkill(type: keyof GameSyncState['upgrades'], newLevel: number) {
    this.isLocalUpdate = true;
    this.ydoc.transact(() => {
      const currentLevel = this.yupgrades.get(type) || 0;
      if (newLevel > currentLevel) {
        this.yupgrades.set(type, newLevel);
      }
    });
    this.isLocalUpdate = false;
  }

  setCursor(skillType: string | null) {
    this.awareness.setLocalStateField('cursor', {
      skillType,
      timestamp: Date.now(),
    });
  }

  onChange(callback: (state: GameSyncState) => void) {
    this.onChangeCallback = callback;
  }

  onCursorChange(callback: (cursors: RemoteCursor[]) => void) {
    this.onCursorChangeCallback = callback;
  }

  destroy() {
    this.ygame.unobserve(this.handleGameChange);
    this.yupgrades.unobserve(this.handleUpgradeChange);
    this.awareness.off('change', this.handleAwarenessChange);
    this.setCursor(null);
  }
}
