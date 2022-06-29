import { Cardano, CardanoNodeError, CardanoNodeFailure } from '@cardano-sdk/core';
import {
  ConnectionConfig,
  ServerNotReady,
  WebSocketClosed,
  createInteractionContext,
  createStateQueryClient
} from '@cardano-ogmios/client';
import { Logger, dummyLogger } from 'ts-log';
import { mapEraSummary } from './mappers';

/**
 * Connects to the cardano node through ogmios
 *
 * @param {ConnectionConfig} connectionConfig Ogmios connection configuration
 * @param {Logger} logger object implementing the Logger abstract class
 * @returns {Cardano.CardanoNode} CardanoNode instance
 * @throws {CardanoNodeError}
 */
export const cardanoNode = (connectionConfig: ConnectionConfig, logger: Logger = dummyLogger): Cardano.CardanoNode => {
  const getInteractionContext = async (methodName: string) =>
    createInteractionContext(
      (error) => {
        logger.error.bind(logger)({ error: error.name, module: `cardanoNode.StateQuery.${methodName}` }, error.message);
      },
      logger.info.bind(logger),
      { connection: connectionConfig, interactionType: 'LongRunning' }
    );

  return {
    StateQuery: {
      eraSummaries: async () => {
        const interactionContext = await getInteractionContext('eraSummaries');
        const stateQueryClient = await createStateQueryClient(interactionContext);
        try {
          const systemStart = await stateQueryClient.systemStart();
          const eraSummaries = await stateQueryClient.eraSummaries();
          return eraSummaries.map((era) => mapEraSummary(era, systemStart));
        } catch (error) {
          throw error instanceof WebSocketClosed || error instanceof ServerNotReady
            ? new CardanoNodeError(CardanoNodeFailure.ConnectionError, error)
            : new CardanoNodeError(CardanoNodeFailure.Unknown, error);
        } finally {
          await stateQueryClient.shutdown();
        }
      }
    }
  };
};
