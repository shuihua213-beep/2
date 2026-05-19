import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';

// 共享的 Yjs 文档
export const ydoc = new Y.Doc();

// WebRTC P2P 同步提供者 (无中心服务器)
export const provider = new WebrtcProvider('dune-ranger-p2p-sync-v1', ydoc);

// Awareness 用于状态（如光标、当前查看的技能）
export const awareness = provider.awareness;

// 共享状态
export const sharedCoins = ydoc.getMap<number>('coins');
export const sharedUpgrades = ydoc.getMap<number>('upgrades');
