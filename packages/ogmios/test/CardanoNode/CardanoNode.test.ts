import { Cardano } from '@cardano-sdk/core';
import { CardanoNode } from '../../src';
import { Connection, createConnectionObject } from '@cardano-ogmios/client';
import { createMockOgmiosServer, listenPromise, serverClosePromise } from '../mocks/mockOgmiosServer';
import { getRandomPort } from 'get-port-please';
import http from 'http';

describe('CardanoNode', () => {
  let mockServer: http.Server;
  let connection: Connection;
  let node: Cardano.CardanoNode;

  beforeAll(async () => {
    connection = createConnectionObject({ port: await getRandomPort() });
  });

  describe('not initialized', () => {
    beforeAll(async () => {
      mockServer = createMockOgmiosServer({
        stateQuery: { eraSummaries: { response: { success: true } }, systemStart: { response: { success: true } } }
      });
      node = new CardanoNode();
      await listenPromise(mockServer, connection.port);
    });
    afterAll(async () => {
      await serverClosePromise(mockServer);
    });

    it('eraSummaries rejects with not initialized error', async () => {
      await expect(node.eraSummaries()).rejects.toThrowError(
        new Cardano.CardanoNodeNotInitializedError('eraSummaries')
      );
    });
    it('systemStart rejects with not initialized error', async () => {
      await expect(node.systemStart()).rejects.toThrowError(new Cardano.CardanoNodeNotInitializedError('systemStart'));
    });
    it('shutdown rejects with not initialized error', async () => {
      await expect(node.shutdown()).rejects.toThrowError(new Cardano.CardanoNodeNotInitializedError('shutdown'));
    });
  });

  describe('initialized', () => {
    describe('eraSummaries', () => {
      describe('success', () => {
        beforeAll(async () => {
          mockServer = createMockOgmiosServer({
            stateQuery: { eraSummaries: { response: { success: true } }, systemStart: { response: { success: true } } }
          });
          await listenPromise(mockServer, connection.port);
          node = new CardanoNode();
          await node.initialize(connection);
        });
        afterAll(async () => {
          await node.shutdown();
          await serverClosePromise(mockServer);
        });

        it('resolves if successful', async () => {
          const res = await node.eraSummaries();
          expect(res).toMatchSnapshot();
        });
      });

      describe('failure', () => {
        beforeAll(async () => {
          mockServer = createMockOgmiosServer({
            stateQuery: {
              eraSummaries: { response: { failWith: { type: 'unknownResultError' }, success: false } },
              systemStart: { response: { success: true } }
            }
          });
          await listenPromise(mockServer, connection.port);
          node = new CardanoNode();
          await node.initialize(connection);
        });
        afterAll(async () => {
          await node.shutdown();
          await serverClosePromise(mockServer);
        });

        it('rejects with errors thrown by the service', async () => {
          await expect(node.eraSummaries()).rejects.toThrowError(Cardano.CardanoNodeErrors.UnknownResultError);
        });
      });
    });

    describe('systemStart', () => {
      describe('success', () => {
        beforeAll(async () => {
          mockServer = createMockOgmiosServer({ stateQuery: { systemStart: { response: { success: true } } } });
          await listenPromise(mockServer, connection.port);
          node = new CardanoNode();
          await node.initialize(connection);
        });
        afterAll(async () => {
          await node.shutdown();
          await serverClosePromise(mockServer);
        });

        it('resolves if successful', async () => {
          const res = await node.systemStart();
          expect(res).toMatchSnapshot();
        });
      });

      describe('failure', () => {
        beforeAll(async () => {
          mockServer = createMockOgmiosServer({
            stateQuery: { systemStart: { response: { failWith: { type: 'queryUnavailableInEra' }, success: false } } }
          });
          await listenPromise(mockServer, connection.port);
          node = new CardanoNode();
          await node.initialize(connection);
        });
        afterAll(async () => {
          await node.shutdown();
          await serverClosePromise(mockServer);
        });

        it('rejects with errors thrown by the service', async () => {
          await expect(node.systemStart()).rejects.toThrowError(
            Cardano.CardanoNodeErrors.QueryUnavailableInCurrentEraError
          );
        });
      });
    });

    describe('shutdown', () => {
      beforeAll(async () => {
        mockServer = createMockOgmiosServer({ stateQuery: { systemStart: { response: { success: true } } } });
        await listenPromise(mockServer, connection.port);
        node = new CardanoNode();
      });
      afterAll(async () => {
        await serverClosePromise(mockServer);
      });

      beforeEach(async () => {
        await node.initialize(connection);
      });

      it('shuts down successfully', async () => {
        await expect(node.shutdown()).resolves.not.toThrow();
      });
      it('throws when querying after shutting down', async () => {
        await node.shutdown();
        await expect(node.systemStart()).rejects.toThrow(Cardano.CardanoNodeNotInitializedError);
      });
    });
  });
});
