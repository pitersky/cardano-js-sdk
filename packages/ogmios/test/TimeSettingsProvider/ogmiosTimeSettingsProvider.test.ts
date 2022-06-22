import { Connection, createConnectionObject } from '@cardano-ogmios/client';
import { ProviderError, TimeSettingsProvider } from '@cardano-sdk/core';
import { createMockOgmiosServer, listenPromise, serverClosePromise } from '../mocks/mockOgmiosServer';
import { getRandomPort } from 'get-port-please';
import { ogmiosTimeSettingsProvider } from '../../src';
import http from 'http';

describe('ogmiosTimeSettingsProvider', () => {
  let mockServer: http.Server;
  let connection: Connection;
  let provider: TimeSettingsProvider;

  beforeAll(async () => {
    connection = createConnectionObject({ port: await getRandomPort() });
  });
  describe('healthCheck', () => {
    afterEach(async () => {
      if (mockServer !== undefined) {
        await serverClosePromise(mockServer);
      }
    });

    it('is not ok if cannot connect', async () => {
      provider = ogmiosTimeSettingsProvider(connection);
      const res = await provider.healthCheck();
      expect(res).toEqual({ ok: false });
    });

    it('is ok if node is close to the network tip', async () => {
      mockServer = createMockOgmiosServer({
        healthCheck: { response: { networkSynchronization: 0.999, success: true } }
      });
      await listenPromise(mockServer, connection.port);
      provider = ogmiosTimeSettingsProvider(connection);
      const res = await provider.healthCheck();
      expect(res).toEqual({ ok: true });
    });

    it('is not ok if node is not close to the network tip', async () => {
      mockServer = createMockOgmiosServer({
        healthCheck: { response: { networkSynchronization: 0.8, success: true } }
      });
      await listenPromise(mockServer, connection.port);
      provider = ogmiosTimeSettingsProvider(connection);
      const res = await provider.healthCheck();
      expect(res).toEqual({ ok: false });
    });

    it('throws a typed error if caught during the service interaction', async () => {
      mockServer = createMockOgmiosServer({
        healthCheck: { response: { failWith: new Error('Some error'), success: false } }
      });
      await listenPromise(mockServer, connection.port);
      provider = ogmiosTimeSettingsProvider(connection);
      await expect(provider.healthCheck()).rejects.toThrowError(ProviderError);
    });
  });

  describe('timeSettings', () => {
    describe('success', () => {
      beforeAll(async () => {
        mockServer = createMockOgmiosServer({ timeSettings: { response: { success: true } } });
        await listenPromise(mockServer, connection.port);
        provider = ogmiosTimeSettingsProvider(connection);
      });

      afterAll(async () => {
        await serverClosePromise(mockServer);
      });

      it('resolves if successful', async () => {
        const res = await provider.timeSettings();
        expect(res).toMatchSnapshot();
      });
    });

    describe('failure', () => {
      beforeAll(async () => {
        mockServer = createMockOgmiosServer({
          timeSettings: { response: { failWith: { type: 'queryUnavailableInEra' }, success: false } }
        });
        await listenPromise(mockServer, connection.port);
        provider = ogmiosTimeSettingsProvider(connection);
      });
      afterEach(async () => {
        await serverClosePromise(mockServer);
      });

      it('rejects with errors thrown by the service', async () => {
        await expect(provider.timeSettings()).rejects.toThrowError(ProviderError);
      });
    });
  });
});
