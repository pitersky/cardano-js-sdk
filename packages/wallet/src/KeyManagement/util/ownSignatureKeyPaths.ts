import { Cardano } from '@cardano-sdk/core';
import { GroupedAddress, KeyDerivationPath, KeyRole, ResolveInputAddress } from '../types';
import { isNotNil } from '@cardano-sdk/util';
import uniq from 'lodash/uniq';

/**
 * Assumes that a single staking key is used for all addresses (index=0)
 *
 * @returns {KeyDerivationPath[]} derivation paths for keys to sign transaction with
 */
export const ownSignatureKeyPaths = async (
  txBody: Cardano.NewTxBodyAlonzo,
  knownAddresses: GroupedAddress[],
  resolveInputAddress: ResolveInputAddress
): Promise<KeyDerivationPath[]> => {
  const paymentKeyPaths = uniq(
    (
      await Promise.all(
        txBody.inputs.map(async (input) => {
          const ownAddress = await resolveInputAddress(input);
          if (!ownAddress) return null;
          return knownAddresses.find(({ address }) => address === ownAddress);
        })
      )
    ).filter(isNotNil)
  ).map(({ derivationPath }) => ({ index: derivationPath.index, role: Number(derivationPath.type) }));

  const isStakingKeySignatureRequired = txBody.certificates?.length;
  if (isStakingKeySignatureRequired) {
    return [...paymentKeyPaths, { index: 0, role: KeyRole.Stake }];
  }
  return paymentKeyPaths;
};
