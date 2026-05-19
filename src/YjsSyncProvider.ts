import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { Awareness } from 'y-protocols/awareness';

export interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  cursor?: {
    upgradeType: string | null;
    timestamp: number;
  };
}

export class YjsSyncProvider {
  public doc: Y.Doc;
  public provider: WebrtcProvider;
  public awareness: Awareness;
  public gameState: Y.Map<any>;
  public upgrades: Y.Map<number>;
  public coins: Y.Map<number>;

  private static instance: YjsSyncProvider | null = null;
  private static readonly ROOM_NAME = 'desert-ranger-game';

  public static getInstance(): YjsSyncProvider {
    if (!YjsSyncProvider.instance) {
      YjsSyncProvider.instance = new YjsSyncProvider();
    }
    return YjsSyncProvider.instance;
  }

  private constructor() {
    this.doc = new Y.Doc();

    this.gameState = this.doc.getMap('gameState');
    this.upgrades = this.doc.getMap('upgrades');
    this.coins = this.doc.getMap('coins');

    this.provider = new WebrtcProvider(YjsSyncProvider.ROOM_NAME, this.doc, {
      signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-us.herokuapp.com'],
    });

    this.awareness = this.provider.awareness;

    this.initializeLocalState();
    this.setupAwareness();
  }

  private initializeLocalState(): void {
    const userId = Math.random().toString(36).substring(2, 9);
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
    const color = colors[Math.floor(Math.random() * colors.length)];

    const localState: AwarenessState = {
      user: {
        id: userId,
        name: `Player ${userId}`,
        color,
      },
      cursor: {
        upgradeType: null,
        timestamp: 0,
      },
    };

    this.awareness.setLocalStateField('user', localState.user);
    this.awareness.setLocalStateField('cursor', localState.cursor);
  }

  private setupAwareness(): void {
    window.addEventListener('beforeunload', () => {
      this.awareness.setLocalState(null);
    });
  }

  public setCursor(upgradeType: string | null): void {
    this.awareness.setLocalStateField('cursor', {
      upgradeType,
      timestamp: Date.now(),
    });
  }

  public getOtherUsers(): Array<{
    user: { id: string; name: string; color: string };
    cursor: { upgradeType: string | null; timestamp: number };
  }> {
    const users: any[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      if (clientId !== this.awareness.clientID && state.user) {
        users.push(state);
      }
    });
    return users;
  }

  public destroy(): void {
    this.provider.destroy();
    YjsSyncProvider.instance = null;
  }
}
