import { ConnectionStatus, ConnectionStatusTrackerInternals, createSimpleConnectionStatusTracker } from '../../../src';
import { Subject, filter, firstValueFrom } from 'rxjs';
import { createTestScheduler } from '@cardano-sdk/util-dev';

describe('createBrowserConnectionStatusTracker', () => {
  it('creates ConnectionStatusTracker that always emits `up` when in Node', async () => {
    const connectionStatus = firstValueFrom(createSimpleConnectionStatusTracker({ isNodeEnv: () => true }));
    expect(await connectionStatus).toBe(ConnectionStatus.up);
  });

  describe('Browser', () => {
    let mockInternals: ConnectionStatusTrackerInternals;
    const connEvents = new Subject<boolean>();

    beforeEach(() => {
      mockInternals = {
        isNodeEnv: () => false,
        isOnline: jest.fn(() => true),
        offline$: () => connEvents.pipe(filter((online) => !online)),
        online$: () => connEvents.pipe(filter((online) => online))
      };
    });

    it('emits `up` as starting value', async () => {
      const connectionStatus = firstValueFrom(createSimpleConnectionStatusTracker(mockInternals));
      expect(await connectionStatus).toBe(ConnectionStatus.up);
    });

    it('emits `down` when offline$ emits and no longer online', () => {
      createTestScheduler().run(({ cold, expectObservable }) => {
        mockInternals.offline$ = () => cold('-a|');
        mockInternals.online$ = () => cold('--|');
        mockInternals.isOnline = jest.fn().mockReturnValueOnce(true).mockReturnValueOnce(false);
        const connectionStatus$ = createSimpleConnectionStatusTracker(mockInternals);
        expectObservable(connectionStatus$).toBe('xd|', { d: ConnectionStatus.down, x: ConnectionStatus.up });
      });
    });

    it('emits only distinct values', () => {
      createTestScheduler().run(({ cold, expectObservable }) => {
        mockInternals.offline$ = () => cold('-aa|');
        mockInternals.online$ = () => cold('---|');
        mockInternals.isOnline = jest
          .fn()
          .mockReturnValueOnce(true)
          .mockReturnValueOnce(false)
          .mockReturnValueOnce(false);
        const connectionStatus$ = createSimpleConnectionStatusTracker(mockInternals);
        expectObservable(connectionStatus$).toBe('xd-|', { d: ConnectionStatus.down, x: ConnectionStatus.up });
      });
    });

    it('subsequent subscribers get the last known value', () => {
      createTestScheduler().run(({ cold, expectObservable }) => {
        mockInternals.offline$ = () => cold('---|');
        mockInternals.online$ = () => cold('---|');

        const connectionStatus$ = createSimpleConnectionStatusTracker(mockInternals);
        expectObservable(connectionStatus$).toBe('u--|', { u: ConnectionStatus.up });
        expectObservable(connectionStatus$).toBe('u--|', { u: ConnectionStatus.up });
      });
    });
  });
});
