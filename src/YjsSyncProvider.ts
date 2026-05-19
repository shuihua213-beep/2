import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

const ROOM_NAME = 'dune-ranger-p2p';

export const ydoc = new Y.Doc();

export const provider = new WebrtcProvider(ROOM_NAME, ydoc, {
  signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com', 'wss://y-webrtc-signaling-us.herokuapp.com'],
});

export const awareness = provider.awareness;

export const sharedCoins = ydoc.getMap<number>('coins');

export const sharedUpgrades = ydoc.getMap<number>('upgrades');