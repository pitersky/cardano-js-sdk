import { BAD_CONNECTION_URL, GOOD_CONNECTION_URL, removeAllQueues, testLogger, txsPromise } from './utils';
import { ProviderError, TxSubmitProvider } from '@cardano-sdk/core';
import { RabbitMqTxSubmitProvider, TxSubmitWorker } from '../src';

describe('RabbitMqTxSubmitProvider', () => {
  let logger: ReturnType<typeof testLogger>;
  let provider: TxSubmitProvider | undefined;

  beforeEach(async () => {
    await removeAllQueues();
    logger = testLogger();
  });

  afterEach(async () => {
    if (provider) {
      await provider.close!();
      provider = undefined;
    }

    // Uncomment this to have evidence of all the log messages
    // console.log(logger.messages);
  });

  describe('healthCheck', () => {
    it('is not ok if cannot connect', async () => {
      provider = new RabbitMqTxSubmitProvider({ rabbitmqUrl: BAD_CONNECTION_URL });
      const res = await provider.healthCheck();
      expect(res).toEqual({ ok: false });
    });

    it('is ok if can connect', async () => {
      provider = new RabbitMqTxSubmitProvider({ rabbitmqUrl: GOOD_CONNECTION_URL });
      const resA = await provider.healthCheck();
      // Call again to cover the idemopotent RabbitMqTxSubmitProvider.#connectAndCreateChannel() operation
      const resB = await provider.healthCheck();
      expect(resA).toEqual({ ok: true });
      expect(resB).toEqual({ ok: true });
    });
  });

  describe('submitTx', () => {
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const performTest = async (rabbitmqUrl: URL) => {
      try {
        const txs = await txsPromise;
        provider = new RabbitMqTxSubmitProvider({ rabbitmqUrl }, { logger });
        const resA = await provider.submitTx(txs[0].txBodyUint8Array);
        // Called again to cover the idemopotent RabbitMqTxSubmitProvider.#ensureQueue() operation
        const resB = await provider.submitTx(txs[1].txBodyUint8Array);
        expect(resA).toBeUndefined();
        expect(resB).toBeUndefined();
      } catch (error) {
        expect((error as ProviderError).innerError).toBeInstanceOf(ProviderError);
      }
    };

    it('resolves if successful', async () => {
      const worker = new TxSubmitWorker(
        { parallel: true, rabbitmqUrl: GOOD_CONNECTION_URL },
        { logger, txSubmitProvider: { healthCheck: async () => ({ ok: true }), submitTx: () => Promise.resolve() } }
      );

      expect.assertions(2);
      await worker.start();
      await performTest(GOOD_CONNECTION_URL);
      await worker.stop();
    });

    it('rejects with errors thrown by the service', async () => {
      expect.assertions(1);
      await performTest(BAD_CONNECTION_URL);
    });
  });
});
