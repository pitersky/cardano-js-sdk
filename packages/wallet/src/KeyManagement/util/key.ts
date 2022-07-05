import {
  AccountDerivationPathDefaults,
  AccountKeyDerivationPath,
  DeriveAccountPrivateKeyProps,
  KeyRole
} from '../types';
import { CSL } from '@cardano-sdk/core';

export const harden = (num: number): number => 0x80_00_00_00 + num;

export const STAKE_KEY_DERIVATION_PATH: AccountKeyDerivationPath = {
  index: 0,
  role: KeyRole.Stake
};

export const deriveAccountPrivateKey = ({
  rootPrivateKey,
  accountIndex,
  purpose,
  coinType
}: DeriveAccountPrivateKeyProps): CSL.Bip32PrivateKey =>
  rootPrivateKey
    .derive(harden(purpose || AccountDerivationPathDefaults.Purpose))
    .derive(harden(coinType || AccountDerivationPathDefaults.CoinType))
    .derive(harden(accountIndex));
