import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

const ROOM_NAME = 'dune-ranger-game-sync';

export interface CursorState {
  userId: string;
  skillType: string | null;
  timestamp: number;
}

export interface YjsSyncProvider {
  ydoc: Y.Doc;
  webrtcProvider: WebrtcProvider;
  awareness: WebrtcProvider['awareness'];
  userId: string;
  destroy: () => void;
}

export function createYjsSyncProvider(): YjsSyncProvider {
  const ydoc = new Y.Doc();
  const userId = generateUserId();

  const webrtcProvider = new WebrtcProvider(ROOM_NAME, ydoc, {
    signaling: [
      'wss://y-webrtc-eu.fly.dev',
      'wss://y-webrtc-usa.fly.dev',
    ],
    password: 'dune-ranger-secret-2024',
  });

  const awareness = webrtcProvider.awareness;

  awareness.setLocalStateField('userId', userId);
  awareness.setLocalStateField('cursor', null);

  return {
    ydoc,
    webrtcProvider,
    awareness,
    userId,
    destroy: () => {
      awareness.destroy();
      webrtcProvider.destroy();
      ydoc.destroy();
    },
  };
}

function generateUserId(): string {
  return `user_${Math.random().toString(36).substring(2, 9)}`;
}
