// Review: we can refactor SDK utils so that they:
// - depend on minimal types that Pick only the fields they need.
// - are decomposed into smaller pieces, exporting more granular utils and types,
//   so that users can pick only what they need

import { BigIntMath } from '@cardano-sdk/util';
import { Cardano, ProtocolParametersRequiredByWallet } from '@cardano-sdk/core';
import { Observable, firstValueFrom } from 'rxjs';
import { OutputValidation } from '../types';
import { ResolveInputAddress } from '../KeyManagement';
import { computeMinimumCoinQuantity, tokenBundleSizeExceedsLimit } from '@cardano-sdk/cip2';
import { txInEquals } from './util';

export type ProtocolParametersRequiredByOutputValidator = Pick<
  ProtocolParametersRequiredByWallet,
  'coinsPerUtxoWord' | 'maxValueSize'
>;
export interface OutputValidatorContext {
  /**
   * Subscribed on every OutputValidator call
   */
  protocolParameters$: Observable<ProtocolParametersRequiredByOutputValidator>;
}
export interface InputResolverContext {
  utxo: {
    /**
     * Subscribed on every InputResolver call
     */
    available$: Observable<Cardano.Utxo[]>;
  };
}
export type WalletUtilContext = OutputValidatorContext & InputResolverContext;

export interface OutputValidator {
  /**
   * @returns Validates that token bundle size is within limits and computes minimum coin quantity
   */
  validateValue(output: Cardano.Value): Promise<OutputValidation>;
  /**
   * @returns For every value, validates that token bundle size is within limits and computes minimum coin quantity
   */
  validateValues(outputs: Iterable<Cardano.Value>): Promise<Map<Cardano.Value, OutputValidation>>;
  /**
   * @returns Validates that token bundle size is within limits and computes minimum coin quantity
   */
  validateOutput(output: Cardano.TxOut): Promise<OutputValidation>;
  /**
   * @returns For every output, validates that token bundle size is within limits and computes minimum coin quantity
   */
  validateOutputs(outputs: Iterable<Cardano.TxOut>): Promise<Map<Cardano.TxOut, OutputValidation>>;
}

export interface InputResolver {
  resolveInputAddress: ResolveInputAddress;
}

export const createOutputValidator = ({ protocolParameters$ }: OutputValidatorContext): OutputValidator => {
  const validateValue = async (
    value: Cardano.Value,
    protocolParameters?: ProtocolParametersRequiredByOutputValidator
  ): Promise<OutputValidation> => {
    const { coinsPerUtxoWord, maxValueSize } = protocolParameters || (await firstValueFrom(protocolParameters$));
    const minimumCoin = BigInt(computeMinimumCoinQuantity(coinsPerUtxoWord)(value.assets));
    return {
      coinMissing: BigIntMath.max([minimumCoin - value.coins, 0n])!,
      minimumCoin,
      tokenBundleSizeExceedsLimit: tokenBundleSizeExceedsLimit(maxValueSize)(value.assets)
    };
  };
  const validateValues = async (values: Iterable<Cardano.Value>) => {
    const protocolParameters = await firstValueFrom(protocolParameters$);
    const validations = new Map<Cardano.Value, OutputValidation>();
    for (const value of values) {
      validations.set(value, await validateValue(value, protocolParameters));
    }
    return validations;
  };
  const validateOutput = (output: Cardano.TxOut, protocolParameters?: ProtocolParametersRequiredByOutputValidator) =>
    validateValue(output.value, protocolParameters);

  return {
    validateOutput,
    async validateOutputs(outputs: Iterable<Cardano.TxOut>): Promise<Map<Cardano.TxOut, OutputValidation>> {
      const protocolParameters = await firstValueFrom(protocolParameters$);
      const validations = new Map<Cardano.TxOut, OutputValidation>();
      for (const output of outputs) {
        validations.set(output, await validateOutput(output, protocolParameters));
      }
      return validations;
    },
    validateValue,
    validateValues
  };
};

export const createInputResolver = ({ utxo }: InputResolverContext): InputResolver => ({
  async resolveInputAddress(input: Cardano.NewTxIn) {
    const utxoAvailable = await firstValueFrom(utxo.available$);
    return utxoAvailable?.find(([txIn]) => txInEquals(txIn, input))?.[1].address || null;
  }
});

/**
 * @returns common wallet utility functions that are aware of wallet state and computes useful things
 */
export const createWalletUtil = (context: WalletUtilContext) => ({
  ...createOutputValidator(context),
  ...createInputResolver(context)
});

export type WalletUtil = ReturnType<typeof createWalletUtil>;

// TODO: add unit tests
