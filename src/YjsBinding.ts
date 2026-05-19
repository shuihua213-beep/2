import { useCallback, useEffect, useState } from 'react';
import {
  INITIAL_SHARED_UPGRADES,
  INITIAL_SHARED_WALLET,
  YjsSyncProvider,
  type ProviderSnapshot,
  type RemotePlayer,
  type SharedUpgrades,
  type SharedWallet,
  type UpgradeKey,
} from './YjsSyncProvider';

export { INITIAL_SHARED_UPGRADES, INITIAL_SHARED_WALLET };
export type { RemotePlayer, SharedUpgrades, SharedWallet, UpgradeKey };

export function useYjsBinding() {
  const [provider] = useState(() => YjsSyncProvider.getInstance());
  const [snapshot, setSnapshot] = useState<ProviderSnapshot>(() => provider.getSnapshot());

  useEffect(() => provider.subscribe(setSnapshot), [provider]);

  const publishWallet = useCallback((wallet: SharedWallet) => {
    provider.publishWallet(wallet);
  }, [provider]);

  const publishUpgrade = useCallback((upgradeKey: UpgradeKey, level: number) => {
    provider.publishUpgrade(upgradeKey, level);
  }, [provider]);

  const setActiveUpgrade = useCallback((upgradeKey: UpgradeKey | null) => {
    provider.setActiveUpgrade(upgradeKey);
  }, [provider]);

  return {
    sharedWallet: snapshot.wallet,
    sharedUpgrades: snapshot.upgrades,
    remotePlayers: snapshot.remotePlayers,
    connectionStatus: snapshot.connectionStatus,
    initialWallet: INITIAL_SHARED_WALLET,
    initialUpgrades: INITIAL_SHARED_UPGRADES,
    publishWallet,
    publishUpgrade,
    setActiveUpgrade,
  };
}
