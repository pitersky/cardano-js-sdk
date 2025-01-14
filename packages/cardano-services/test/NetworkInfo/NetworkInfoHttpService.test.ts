/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable sonarjs/no-duplicate-string */
/* eslint-disable sonarjs/cognitive-complexity */
/* eslint-disable sonarjs/no-identical-functions */
import { DbSyncNetworkInfoProvider, NetworkInfoCacheKey, NetworkInfoHttpService } from '../../src/NetworkInfo';
import { HttpServer, HttpServerConfig } from '../../src';
import { InMemoryCache, UNLIMITED_CACHE_TTL } from '../../src/InMemoryCache';
import { NetworkInfoProvider, ProviderError, ProviderFailure, StakeSummary, SupplySummary } from '@cardano-sdk/core';
import { Pool } from 'pg';
import { doServerRequest, ingestDbData, sleep, wrapWithTransaction } from '../util';
import { getPort } from 'get-port-please';
import { networkInfoHttpProvider } from '@cardano-sdk/cardano-services-client';
import axios from 'axios';

const UNSUPPORTED_MEDIA_STRING = 'Request failed with status code 415';
const APPLICATION_CBOR = 'application/cbor';
const APPLICATION_JSON = 'application/json';

describe('NetworkInfoHttpService', () => {
  let httpServer: HttpServer;
  let networkInfoProvider: DbSyncNetworkInfoProvider;
  let service: NetworkInfoHttpService;
  let port: number;
  let apiUrlBase: string;
  let config: HttpServerConfig;
  let doNetworkInfoRequest: ReturnType<typeof doServerRequest>;

  const dbPollInterval = 2 * 1000;
  const cache = new InMemoryCache(UNLIMITED_CACHE_TTL);
  const cardanoNodeConfigPath = process.env.CARDANO_NODE_CONFIG_PATH!;
  const db = new Pool({ connectionString: process.env.DB_CONNECTION_STRING, max: 1, min: 1 });

  describe('unhealthy NetworkInfoProvider', () => {
    beforeEach(async () => {
      port = await getPort();
      config = { listen: { port } };
      networkInfoProvider = {
        currentWalletProtocolParameters: jest.fn(),
        genesisParameters: jest.fn(),
        healthCheck: jest.fn(() => Promise.resolve({ ok: false })),
        ledgerTip: jest.fn(),
        lovelaceSupply: jest.fn(),
        stake: jest.fn(),
        timeSettings: jest.fn()
      } as unknown as DbSyncNetworkInfoProvider;
    });

    it('should not throw during service create if the NetworkInfoProvider is unhealthy', () => {
      expect(() => new NetworkInfoHttpService({ networkInfoProvider })).not.toThrow(
        new ProviderError(ProviderFailure.Unhealthy)
      );
    });

    it('throws during service initialization if the NetworkInfoProvider is unhealthy', async () => {
      service = new NetworkInfoHttpService({ networkInfoProvider });
      httpServer = new HttpServer(config, { services: [service] });
      await expect(httpServer.initialize()).rejects.toThrow(new ProviderError(ProviderFailure.Unhealthy));
    });
  });

  describe('healthy state', () => {
    const dbConnectionQuerySpy = jest.spyOn(db, 'query');
    const invalidateCacheSpy = jest.spyOn(cache, 'invalidate');
    const DB_POLL_QUERIES_COUNT = 1;

    beforeAll(async () => {
      port = await getPort();
      config = { listen: { port } };
      apiUrlBase = `http://localhost:${port}/network-info`;
      networkInfoProvider = new DbSyncNetworkInfoProvider({ cardanoNodeConfigPath, dbPollInterval }, { cache, db });
      service = new NetworkInfoHttpService({ networkInfoProvider });
      httpServer = new HttpServer(config, { services: [service] });
      doNetworkInfoRequest = doServerRequest(apiUrlBase);

      await httpServer.initialize();
      await httpServer.start();
    });

    afterAll(async () => {
      await db.end();
      await httpServer.shutdown();
      await cache.shutdown();
      jest.clearAllTimers();
    });

    beforeEach(async () => {
      await cache.clear();
      dbConnectionQuerySpy.mockClear();
      invalidateCacheSpy.mockClear();
    });

    describe('start', () => {
      it('should start epoch polling once the db provider is initialized and started', async () => {
        expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toBeUndefined();
        expect(cache.keys().length).toEqual(0);

        await sleep(dbPollInterval * 2);

        expect(cache.keys().length).toEqual(1);
        expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toBeDefined();
        expect(invalidateCacheSpy).not.toHaveBeenCalled();
      });
    });

    describe('/health', () => {
      it('forwards the networkInfoProvider health response', async () => {
        const res = await axios.post(`${apiUrlBase}/health`, {
          headers: { 'Content-Type': APPLICATION_JSON }
        });
        expect(res.status).toBe(200);
        expect(res.data).toEqual({ ok: true });
      });
    });

    describe('/time-settings', () => {
      it('returns a 200 coded response with a well formed HTTP request', async () => {
        expect((await axios.post(`${apiUrlBase}/time-settings`, { args: [] })).status).toEqual(200);
      });

      it('returns a 415 coded response if the wrong content type header is used', async () => {
        try {
          await axios.post(
            `${apiUrlBase}/time-settings`,
            { args: [] },
            { headers: { 'Content-Type': APPLICATION_CBOR } }
          );
        } catch (error: any) {
          expect(error.response.status).toBe(415);
          expect(error.message).toBe(UNSUPPORTED_MEDIA_STRING);
        }
      });
    });

    describe('/stake', () => {
      const path = '/stake';
      const stakeTotalQueriesCount = 2;

      it('returns a 200 coded response with a well formed HTTP request', async () => {
        expect((await axios.post(`${apiUrlBase}/stake`, { args: [] })).status).toEqual(200);
      });

      it('returns a 415 coded response if the wrong content type header is used', async () => {
        try {
          await axios.post(`${apiUrlBase}/stake`, { args: [] }, { headers: { 'Content-Type': APPLICATION_CBOR } });
        } catch (error: any) {
          expect(error.response.status).toBe(415);
          expect(error.message).toBe(UNSUPPORTED_MEDIA_STRING);
        }
      });

      it('should query the DB only once when the response is cached', async () => {
        await doNetworkInfoRequest<[], StakeSummary>(path, []);
        await doNetworkInfoRequest<[], StakeSummary>(path, []);

        expect(dbConnectionQuerySpy).toHaveBeenCalledTimes(stakeTotalQueriesCount);
        expect(cache.keys().length).toEqual(stakeTotalQueriesCount);
      });

      it('should call db-sync queries again once the cache is cleared', async () => {
        await doNetworkInfoRequest<[], StakeSummary>(path, []);
        await cache.clear();
        expect(cache.keys().length).toEqual(0);

        await doNetworkInfoRequest<[], StakeSummary>(path, []);
        expect(dbConnectionQuerySpy).toBeCalledTimes(stakeTotalQueriesCount * 2);
      });

      it('should not invalidate the epoch values from the cache if there is no epoch rollover', async () => {
        const currentEpochNo = 205;
        const totalQueriesCount = stakeTotalQueriesCount + DB_POLL_QUERIES_COUNT;

        await doNetworkInfoRequest<[], StakeSummary>(path, []);

        expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toBeUndefined();
        expect(cache.keys().length).toEqual(stakeTotalQueriesCount);

        await sleep(dbPollInterval);

        expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toEqual(currentEpochNo);
        expect(cache.keys().length).toEqual(totalQueriesCount);
        expect(dbConnectionQuerySpy).toBeCalledTimes(totalQueriesCount);
        expect(invalidateCacheSpy).not.toHaveBeenCalled();
      });

      it(
        'should invalidate cached epoch values once the epoch rollover is captured by polling',
        wrapWithTransaction(async (dbConnection) => {
          const greaterEpoch = 255;

          await doNetworkInfoRequest<[], StakeSummary>(path, []);
          await sleep(dbPollInterval);

          expect(cache.keys().length).toEqual(stakeTotalQueriesCount + DB_POLL_QUERIES_COUNT);
          await ingestDbData(
            dbConnection,
            'epoch',
            ['id', 'out_sum', 'fees', 'tx_count', 'blk_count', 'no', 'start_time', 'end_time'],
            [greaterEpoch, 58_389_393_484_858, 43_424_552, 55_666, 10_000, greaterEpoch, '2022-05-28', '2022-06-02']
          );

          await sleep(dbPollInterval);
          expect(invalidateCacheSpy).toHaveBeenCalledWith([
            NetworkInfoCacheKey.TOTAL_SUPPLY,
            NetworkInfoCacheKey.ACTIVE_STAKE
          ]);

          expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toEqual(greaterEpoch);
          expect(cache.keys().length).toEqual(2);

          await sleep(dbPollInterval);
        }, db)
      );
    });

    describe('/lovelace-supply', () => {
      const path = '/lovelace-supply';
      const lovelaceSupplyTotalQueriesCount = 2;

      it('returns a 200 coded response with a well formed HTTP request', async () => {
        expect((await axios.post(`${apiUrlBase}/lovelace-supply`, { args: [] })).status).toEqual(200);
      });

      it('returns a 415 coded response if the wrong content type header is used', async () => {
        try {
          await axios.post(
            `${apiUrlBase}/lovelace-supply`,
            { args: [] },
            { headers: { 'Content-Type': APPLICATION_CBOR } }
          );
        } catch (error: any) {
          expect(error.response.status).toBe(415);
          expect(error.message).toBe(UNSUPPORTED_MEDIA_STRING);
        }
      });

      it('should query the DB only once when the response is cached', async () => {
        await doNetworkInfoRequest<[], SupplySummary>(path, []);
        await doNetworkInfoRequest<[], SupplySummary>(path, []);

        expect(dbConnectionQuerySpy).toHaveBeenCalledTimes(lovelaceSupplyTotalQueriesCount);
        expect(cache.keys().length).toEqual(lovelaceSupplyTotalQueriesCount);
      });

      it('should call db-sync queries again once the cache is cleared', async () => {
        await doNetworkInfoRequest<[], SupplySummary>(path, []);
        await cache.clear();
        expect(cache.keys().length).toEqual(0);

        await doNetworkInfoRequest<[], SupplySummary>(path, []);
        expect(dbConnectionQuerySpy).toBeCalledTimes(lovelaceSupplyTotalQueriesCount * 2);
      });

      it('should not invalidate the epoch values from the cache if there is no epoch rollover', async () => {
        const currentEpochNo = 205;
        const totalQueriesCount = lovelaceSupplyTotalQueriesCount + DB_POLL_QUERIES_COUNT;

        await doNetworkInfoRequest<[], StakeSummary>(path, []);
        expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toBeUndefined();
        expect(cache.keys().length).toEqual(lovelaceSupplyTotalQueriesCount);
        await sleep(dbPollInterval);

        expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toEqual(currentEpochNo);
        expect(cache.keys().length).toEqual(totalQueriesCount);
        expect(dbConnectionQuerySpy).toBeCalledTimes(totalQueriesCount);
        expect(invalidateCacheSpy).not.toHaveBeenCalled();
      });

      it(
        'should invalidate cached epoch values once the epoch rollover is captured by polling',
        wrapWithTransaction(async (dbConnection) => {
          const greaterEpoch = 255;

          await doNetworkInfoRequest<[], SupplySummary>(path, []);
          await sleep(dbPollInterval);

          expect(cache.keys().length).toEqual(lovelaceSupplyTotalQueriesCount + DB_POLL_QUERIES_COUNT);

          await ingestDbData(
            dbConnection,
            'epoch',
            ['id', 'out_sum', 'fees', 'tx_count', 'blk_count', 'no', 'start_time', 'end_time'],
            [greaterEpoch, 58_389_393_484_858, 43_424_552, 55_666, 10_000, greaterEpoch, '2022-05-28', '2022-06-02']
          );

          await sleep(dbPollInterval);
          expect(invalidateCacheSpy).toHaveBeenCalledWith([
            NetworkInfoCacheKey.TOTAL_SUPPLY,
            NetworkInfoCacheKey.ACTIVE_STAKE
          ]);
          expect(cache.getVal(NetworkInfoCacheKey.CURRENT_EPOCH)).toEqual(greaterEpoch);
          expect(cache.keys().length).toEqual(2);

          await sleep(dbPollInterval);
        }, db)
      );
    });

    describe('/ledger-tip', () => {
      it('returns a 200 coded response with a well formed HTTP request', async () => {
        expect((await axios.post(`${apiUrlBase}/ledger-tip`, { args: [] })).status).toEqual(200);
      });

      it('returns a 415 coded response if the wrong content type header is used', async () => {
        try {
          await axios.post(`${apiUrlBase}/ledger-tip`, { args: [] }, { headers: { 'Content-Type': APPLICATION_CBOR } });
        } catch (error: any) {
          expect(error.response.status).toBe(415);
          expect(error.message).toBe(UNSUPPORTED_MEDIA_STRING);
        }
      });
    });

    describe('/current-wallet-protocol-parameters', () => {
      it('returns a 200 coded response with a well formed HTTP request', async () => {
        expect((await axios.post(`${apiUrlBase}/current-wallet-protocol-parameters`, { args: [] })).status).toEqual(
          200
        );
      });

      it('returns a 415 coded response if the wrong content type header is used', async () => {
        try {
          await axios.post(
            `${apiUrlBase}/current-wallet-protocol-parameters`,
            { args: [] },
            { headers: { 'Content-Type': APPLICATION_CBOR } }
          );
        } catch (error: any) {
          expect(error.response.status).toBe(415);
          expect(error.message).toBe(UNSUPPORTED_MEDIA_STRING);
        }
      });
    });

    describe('/genesis-parameters', () => {
      it('returns a 200 coded response with a well formed HTTP request', async () => {
        expect((await axios.post(`${apiUrlBase}/genesis-parameters`, { args: [] })).status).toEqual(200);
      });

      it('returns a 415 coded response if the wrong content type header is used', async () => {
        try {
          await axios.post(
            `${apiUrlBase}/genesis-parameters`,
            { args: [] },
            { headers: { 'Content-Type': APPLICATION_CBOR } }
          );
        } catch (error: any) {
          expect(error.response.status).toBe(415);
          expect(error.message).toBe(UNSUPPORTED_MEDIA_STRING);
        }
      });
    });

    describe('with NetworkInfoHttpProvider', () => {
      let provider: NetworkInfoProvider;

      beforeEach(async () => {
        provider = networkInfoHttpProvider(apiUrlBase);
      });

      it('response is an object of lovelace supply info', async () => {
        const response = await provider.lovelaceSupply();
        expect(response).toMatchSnapshot();
      });

      it('response is an object of stake info', async () => {
        const response = await provider.stake();
        expect(response).toMatchSnapshot();
      });

      it('response is an object of ledger tip', async () => {
        const response = await provider.ledgerTip();
        expect(response).toMatchSnapshot();
      });

      it('response is an object of time settings', async () => {
        const response = await provider.timeSettings();
        expect(response).toMatchSnapshot();
      });

      it('response is an object of current wallet protocol parameters', async () => {
        const response = await provider.currentWalletProtocolParameters();
        expect(response).toMatchSnapshot();
      });

      it('response is an object of genesis parameters', async () => {
        const response = await provider.genesisParameters();
        expect(response).toMatchSnapshot();
      });
    });
  });
});
