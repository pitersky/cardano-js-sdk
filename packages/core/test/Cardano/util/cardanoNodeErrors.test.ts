import { CardanoNodeError, CardanoNodeErrors, util } from '../../../src/Cardano';

const unavailableQueryError = new CardanoNodeErrors.QueryUnavailableInCurrentEraError('currentEpoch');
const unknownResultError = new CardanoNodeErrors.UnknownResultError('result');
const someOtherError = new Error('some other error');
const someString = 'some string';

describe('cardanoNodeErros', () => {
  describe('isCardanoNodeError', () => {
    it('is true if the value is a cardano node error', () => {
      expect(util.isCardanoNodeError(unavailableQueryError)).toBe(true);
    });

    it('is false if a single generic error is not a cardano node error', () => {
      expect(util.isCardanoNodeError(someOtherError)).toBe(false);
    });

    it('is false if a non-error value is passed', () => {
      expect(util.isCardanoNodeError(someString)).toBe(false);
    });
  });

  describe('asCardanoNodeError', () => {
    it('returns the same error if it is a cardano node error', () => {
      expect(util.asCardanoNodeError(unavailableQueryError)).toBe<CardanoNodeError>(unavailableQueryError);
    });

    it('returns null if error is not a cardano node error', () => {
      expect(util.asCardanoNodeError(someOtherError)).toBeNull();
    });

    it('returns null if a non-error value is passed', () => {
      expect(util.asCardanoNodeError(someString)).toBeNull();
    });

    it('returns the first error if all values in an array are cardano node errors', () => {
      expect(util.asCardanoNodeError([unavailableQueryError, unknownResultError])).toBe<CardanoNodeError>(
        unavailableQueryError
      );
    });

    it('returns the first cardano node error if at least one value in an array is a cardano node error', () => {
      expect(util.asCardanoNodeError([someOtherError, unknownResultError])).toBe<CardanoNodeError>(unknownResultError);
    });

    it('returns null if none of the values in an array are cardano node errors', () => {
      expect(util.asCardanoNodeError([someOtherError, someString])).toBeNull();
    });
  });
});
