import { Action, InMemoryCache, UNLIMITED_CACHE_TTL } from '../../InMemoryCache';
import { NetworkInfoCacheKey } from '.';
import { Shutdown } from '@cardano-sdk/util';

export const POLL_INTERVAL_DEFAULT = 10_000;

export const pollService = (cache: InMemoryCache, action: Action<number>, interval: number): Shutdown => {
  const executePoll = async () => {
    const lastEpoch = await action();
    const currentEpoch = cache.getVal<number>(NetworkInfoCacheKey.CURRENT_EPOCH);
    const shouldInvalidateEpochValues = !!(currentEpoch && lastEpoch > currentEpoch);

    if (!currentEpoch || shouldInvalidateEpochValues) {
      cache.set<number>(NetworkInfoCacheKey.CURRENT_EPOCH, lastEpoch, UNLIMITED_CACHE_TTL);
      shouldInvalidateEpochValues
        ? cache.invalidate([NetworkInfoCacheKey.TOTAL_SUPPLY, NetworkInfoCacheKey.ACTIVE_STAKE])
        : void 0;
    }
  };

  const timeout = setInterval(executePoll, interval);

  return {
    shutdown: () => clearInterval(timeout)
  };
};
