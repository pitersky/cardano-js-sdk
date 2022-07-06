import { AsyncKeyAgent, util as keyManagementUtil } from './KeyManagement';
import { CSL, Cardano, util } from '@cardano-sdk/core';

export type BuildDelegationProps = {
  votingPublicKey: Cardano.Bip32PublicKey;
  nonce: number;
  rewardAccount: Cardano.RewardAccount;
};

export interface SignDelegationProps {
  votingPublicKey: string;
  publicStakeKey: string;
  rewardAccountKey: string;
  nonce: number;
}

export interface VotingKeyPair {
  prvKey: Cardano.Bip32PrivateKey;
  pubKey: Cardano.Bip32PublicKey;
}

export enum VotingLabels {
  DATA = 61_284,
  SIG = 61_285
}

/**
 * TODO: Maybe it would be good to treat this as a BASE and create additional, key agent dependent, GOV API's
 */
export class GovernanceApi {
  readonly #keyAgent: AsyncKeyAgent;

  constructor(keyAgent: AsyncKeyAgent) {
    this.#keyAgent = keyAgent;
  }

  getVotingKey(): VotingKeyPair {
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
  }

  async buildDelegation({
    votingPublicKey,
    nonce,
    rewardAccount
  }: BuildDelegationProps): Promise<Cardano.AuxiliaryData> {
    const publicStakeKey = await this.#keyAgent.derivePublicKey(keyManagementUtil.STAKE_KEY_DERIVATION_PATH);
    const cslRewardAccount = CSL.Address.from_bech32(rewardAccount.toString());
    const rewardAccountBytes = Buffer.from(cslRewardAccount.to_bytes());
    const votingData = new Map<bigint, Cardano.Metadatum>([
      [1n, Buffer.from(votingPublicKey, 'hex')],
      [2n, Buffer.from(publicStakeKey, 'hex')],
      [3n, rewardAccountBytes],
      [4n, BigInt(nonce)]
    ]);
    const signature = await this.signDelegation({
      nonce,
      publicStakeKey: `0x${publicStakeKey}`,
      rewardAccountKey: `0x${rewardAccountBytes.toString('hex')}`,
      votingPublicKey: `0x${votingPublicKey}`
    });

    // blake2b-256 hash of the metadata signed using stakekey
    const votingSignature = new Map([[1n, Buffer.from(signature, 'hex')]]);

    const votingAuxData = new Map<bigint, Cardano.MetadatumMap>([
      [BigInt(VotingLabels.DATA), votingData],
      [BigInt(VotingLabels.SIG), votingSignature]
    ]);

    return {
      body: {
        blob: votingAuxData
      }
    };
  }

  async signDelegation({
    votingPublicKey,
    publicStakeKey,
    rewardAccountKey,
    nonce
  }: SignDelegationProps): Promise<Cardano.Ed25519Signature> {
    const blake2b = require('blake2b');
    const { index, role } = keyManagementUtil.STAKE_KEY_DERIVATION_PATH;
    const generalMetadata = CSL.GeneralTransactionMetadata.new();
    const registrationData = CSL.encode_json_str_to_metadatum(
      JSON.stringify({
        '1': votingPublicKey,
        '2': publicStakeKey,
        '3': rewardAccountKey,
        '4': nonce
      }),
      CSL.MetadataJsonSchema.BasicConversions
    );
    generalMetadata.insert(CSL.BigNum.from_str(VotingLabels.DATA.toString()), registrationData);
    const hashedMetadata = blake2b(256 / 8)
      .update(generalMetadata.to_bytes())
      .digest('binary');

    const { signature } = await this.#keyAgent.signBlob({ index, role }, util.bytesToHex(hashedMetadata));
    return signature;
  }
}
