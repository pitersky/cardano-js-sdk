import {
  ConnectionConfig,
  createConnectionObject,
  createInteractionContext,
  createStateQueryClient,
  getServerHealth
} from '@cardano-ogmios/client';
import { Logger, dummyLogger } from 'ts-log';
import { ProviderError, ProviderFailure, TimeSettingsProvider } from '@cardano-sdk/core';
import { mapTimeSettings } from './mappers';

/**
 * Connect to an [Ogmios](https://ogmios.dev/) instance
 *
 * @param {ConnectionConfig} connectionConfig Ogmios connection configuration
 * @param {Logger} logger object implementing the Logger abstract class
 * @returns {TimeSettingsProvider} TimeSettingsProvider
 * @throws {ProviderError}
 */
export const ogmiosTimeSettingsProvider = (
  connectionConfig: ConnectionConfig,
  logger: Logger = dummyLogger
): TimeSettingsProvider => ({
  async healthCheck() {
    try {
      const serverHealth = await getServerHealth({ connection: createConnectionObject(connectionConfig) });
      return { ok: serverHealth.networkSynchronization > 0.99 };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error.name === 'FetchError') {
        return { ok: false };
      }
      throw new ProviderError(ProviderFailure.Unknown, error);
    }
  },
  timeSettings: async () => {
    const interactionContext = await createInteractionContext(
      (error) => {
        logger.error.bind(logger)({ error: error.name, module: 'ogmiosTimeSettingsProvider' }, error.message);
      },
      logger.info.bind(logger),
      { connection: connectionConfig, interactionType: 'LongRunning' }
    );
    const stateQueryClient = await createStateQueryClient(interactionContext);
    try {
      const eraSummaries = await stateQueryClient.eraSummaries();
      const systemStart = await stateQueryClient.systemStart();

      return eraSummaries.map((era) => mapTimeSettings(era, systemStart));
    } catch (error) {
      throw new ProviderError(ProviderFailure.Unknown, error);
    } finally {
      await stateQueryClient.shutdown();
    }
  }
});
