import { Cardano, ProviderError, ProviderFailure, util } from '@cardano-sdk/core';
import { txSubmitHttpProvider } from '../../src';
import MockAdapter from 'axios-mock-adapter';
import axios, { AxiosError, AxiosResponse } from 'axios';

const url = 'http://some-hostname:3000/tx-submit';

const axiosError = (bodyError = new Error('error')) => {
  const response = {
    data: util.toSerializableObject(new ProviderError(ProviderFailure.BadRequest, bodyError))
  } as AxiosResponse;
  const error = new AxiosError(undefined, undefined, undefined, undefined, response);
  Object.defineProperty(error, 'response', { value: response });
  return error;
};

describe('txSubmitHttpProvider', () => {
  describe('healthCheck', () => {
    it('is not ok if cannot connect', async () => {
      const provider = txSubmitHttpProvider(url);
      await expect(provider.healthCheck()).resolves.toEqual({ ok: false });
    });
  });
  describe('mocked', () => {
    let axiosMock: MockAdapter;
    beforeAll(() => {
      axiosMock = new MockAdapter(axios);
    });

    afterEach(() => {
      axiosMock.reset();
    });

    afterAll(() => {
      axiosMock.restore();
    });

    describe('healthCheck', () => {
      it('is ok if 200 response body is { ok: true }', async () => {
        axiosMock.onPost().replyOnce(200, { ok: true });
        const provider = txSubmitHttpProvider(url);
        await expect(provider.healthCheck()).resolves.toEqual({ ok: true });
      });

      it('is not ok if 200 response body is { ok: false }', async () => {
        axiosMock.onPost().replyOnce(200, { ok: false });
        const provider = txSubmitHttpProvider(url);
        await expect(provider.healthCheck()).resolves.toEqual({ ok: false });
      });
    });

    describe('submitTx', () => {
      it('resolves if successful', async () => {
        axiosMock.onPost().replyOnce(200, '');
        const provider = txSubmitHttpProvider(url);
        await expect(provider.submitTx(new Uint8Array())).resolves.not.toThrow();
      });

      describe('errors', () => {
        const testError = (bodyError: Error, providerErrorType: unknown) => async () => {
          try {
            axiosMock.onPost().replyOnce(() => {
              throw axiosError(bodyError);
            });
            const provider = txSubmitHttpProvider(url);
            await provider.submitTx(new Uint8Array());
            throw new Error('Expected to throw');
          } catch (error) {
            if (error instanceof ProviderError) {
              expect(error.reason).toBe(ProviderFailure.BadRequest);
              const innerError = error.innerError as Cardano.TxSubmissionError;
              expect(innerError).toBeInstanceOf(providerErrorType);
            } else {
              throw new TypeError('Expected ProviderError');
            }
          }
        };

        it(
          'rehydrates errors',
          testError(
            new Cardano.TxSubmissionErrors.BadInputsError({ badInputs: [] }),
            Cardano.TxSubmissionErrors.BadInputsError
          )
        );

        it(
          'maps unrecognized errors to UnknownTxSubmissionError',
          testError(new Error('Unknown error'), Cardano.UnknownTxSubmissionError)
        );
      });
    });
  });
});