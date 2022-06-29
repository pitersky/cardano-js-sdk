import { Cardano, CardanoNodeError } from '@cardano-sdk/core';
import { Connection, createConnectionObject } from '@cardano-ogmios/client';
import { cardanoNode } from '../../src';
import { createMockOgmiosServer, listenPromise, serverClosePromise } from '../mocks/mockOgmiosServer';
import { getRandomPort } from 'get-port-please';
import http from 'http';

describe('cardanoNode', () => {
  let mockServer: http.Server;
  let connection: Connection;
  let node: Cardano.CardanoNode;

  beforeAll(async () => {
    connection = createConnectionObject({ port: await getRandomPort() });
  });

  describe('eraSummaries', () => {
    describe('success', () => {
      beforeAll(async () => {
        mockServer = createMockOgmiosServer({ stateQuery: { eraSummaries: { response: { success: true } } } });
        await listenPromise(mockServer, connection.port);
        node = cardanoNode(connection);
      });

      afterAll(async () => {
        await serverClosePromise(mockServer);
      });

      it('resolves if successful', async () => {
        const res = await node.StateQuery.eraSummaries();
        expect(res).toMatchSnapshot();
      });
    });

    describe('failure', () => {
      beforeAll(async () => {
        mockServer = createMockOgmiosServer({
          stateQuery: { eraSummaries: { response: { failWith: { type: 'queryUnavailableInEra' }, success: false } } }
        });
        await listenPromise(mockServer, connection.port);
        node = cardanoNode(connection);
      });
      afterEach(async () => {
        await serverClosePromise(mockServer);
      });

      it('rejects with errors thrown by the service', async () => {
        await expect(node.StateQuery.eraSummaries()).rejects.toThrowError(CardanoNodeError);
      });
    });
  });
});
