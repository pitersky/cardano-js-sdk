import { CACHE_TTL_DEFAULT } from '../../src/InMemoryCache';
import { Connection } from '@cardano-ogmios/client';
import { HttpServer } from '../../src';
import { MissingProgramOption, ServiceNames, loadHttpServer } from '../../src/Program';
import { POLL_INTERVAL_DEFAULT } from '../../src/NetworkInfo';
import { ProviderError, ProviderFailure } from '@cardano-sdk/core';
import { URL } from 'url';
import {
  createConnectionObjectWithRandomPort,
  createHealthyMockOgmiosServer,
  createUnhealthyMockOgmiosServer,
  ogmiosServerReady
} from '../util';
import { getRandomPort } from 'get-port-please';
import { listenPromise, serverClosePromise } from '../../src/util';
import http from 'http';

describe('loadHttpServer', () => {
  let apiUrl: URL;
  let cardanoNodeConfigPath: string;
  let dbConnectionString: string;
  let cacheTtl: number;
  let pollInterval: number;
  let httpServer: HttpServer;
  let ogmiosConnection: Connection;
  let ogmiosServer: http.Server;

  beforeEach(async () => {
    apiUrl = new URL(`http://localhost:${await getRandomPort()}`);
    dbConnectionString = process.env.DB_CONNECTION_STRING!;
    cardanoNodeConfigPath = process.env.CARDANO_NODE_CONFIG_PATH!;
    ogmiosConnection = await createConnectionObjectWithRandomPort();
    cacheTtl = CACHE_TTL_DEFAULT;
    pollInterval = POLL_INTERVAL_DEFAULT;
  });

  describe('healthy internal providers', () => {
    beforeEach(async () => {
      ogmiosServer = createHealthyMockOgmiosServer();
      await listenPromise(ogmiosServer, { port: ogmiosConnection.port });
      await ogmiosServerReady(ogmiosConnection);
    });

    afterEach(async () => {
      await serverClosePromise(ogmiosServer);
    });

    it('loads the nominated HTTP services and server if required program arguments are set', async () => {
      httpServer = await loadHttpServer({
        apiUrl,
        options: {
          cacheTtl,
          cardanoNodeConfigPath,
          dbConnectionString,
          ogmiosUrl: new URL(ogmiosConnection.address.webSocket),
          pollInterval
        },
        serviceNames: [
          ServiceNames.StakePool,
          ServiceNames.TxSubmit,
          ServiceNames.ChainHistory,
          ServiceNames.Utxo,
          ServiceNames.NetworkInfo
        ]
      });
      expect(httpServer).toBeInstanceOf(HttpServer);
    });

    it('throws if postgres-dependent service is nominated without providing the connection string', async () => {
      await expect(
        async () =>
          await loadHttpServer({
            apiUrl,
            serviceNames: [ServiceNames.StakePool]
          })
      ).rejects.toThrow(MissingProgramOption);
    });

    it('throws if genesis-config dependent service is nominated without providing the node config path', async () => {
      await expect(
        async () =>
          await loadHttpServer({
            apiUrl,
            serviceNames: [ServiceNames.NetworkInfo]
          })
      ).rejects.toThrow(MissingProgramOption);
    });
  });

  describe('unhealthy internal providers', () => {
    beforeEach(async () => {
      ogmiosServer = createUnhealthyMockOgmiosServer();
      await listenPromise(ogmiosServer, { port: ogmiosConnection.port });
      await ogmiosServerReady(ogmiosConnection);
    });

    afterEach(async () => {
      await serverClosePromise(ogmiosServer);
    });

    it('throws if any internal providers are unhealthy', async () => {
      await expect(
        async () =>
          await loadHttpServer({
            apiUrl,
            options: {
              cacheTtl,
              dbConnectionString,
              ogmiosUrl: new URL(ogmiosConnection.address.webSocket),
              pollInterval
            },
            serviceNames: [ServiceNames.StakePool, ServiceNames.TxSubmit]
          })
      ).rejects.toThrow(new ProviderError(ProviderFailure.Unhealthy));
    });
  });
});
