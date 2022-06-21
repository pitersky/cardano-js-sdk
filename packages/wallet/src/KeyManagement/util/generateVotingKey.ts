import { CSL, Cardano } from '@cardano-sdk/core';
import { VotingKeyPair } from '../types';
import { util as keyManagementUtil } from '../../KeyManagement';

export const generateVotingKeyPair = (): VotingKeyPair => {
  const mnemonic = keyManagementUtil.generateMnemonicWords(160);
  const bip39entropy = keyManagementUtil.mnemonicWordsToEntropy(mnemonic);
  const EMPTY_PASSWORD = Buffer.from('');
  const cslPrvKey = CSL.Bip32PrivateKey.from_bip39_entropy(Buffer.from(bip39entropy, 'hex'), EMPTY_PASSWORD);
  const cslPrvKeyBytes = Buffer.from(cslPrvKey.as_bytes()).toString('hex');
  const cslPubKeyBytes = Buffer.from(cslPrvKey.to_public().as_bytes()).toString('hex');

  return {
    prvKey: Cardano.Bip32PrivateKey(cslPrvKeyBytes),
    pubKey: Cardano.Bip32PublicKey(cslPubKeyBytes)
  };
};
