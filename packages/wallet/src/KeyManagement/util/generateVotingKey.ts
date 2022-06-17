import { Cardano, CSL } from '@cardano-sdk/core';
import { util as keyManagementUtil } from '../../KeyManagement';
import { VotingKeyPair } from '../types';

// TODO - change / improve this
export const generateVotingKeyPair = (): VotingKeyPair => {
  const mnemonic = keyManagementUtil.generateMnemonicWords(160);
  const bip39entropy = keyManagementUtil.mnemonicWordsToEntropy(mnemonic);
  const EMPTY_PASSWORD = Buffer.from('');
  const prvKey = CSL.Bip32PrivateKey.from_bip39_entropy(
    Buffer.from(bip39entropy, 'hex'),
    EMPTY_PASSWORD
  );
  const pubKey = Buffer.from(prvKey.to_public().as_bytes()).toString(
    "hex"
  );
  return {
    prvKey,
    pubKey: Cardano.Bip32PublicKey(pubKey),
  };
}