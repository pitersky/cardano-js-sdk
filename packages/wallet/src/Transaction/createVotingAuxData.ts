import { AsyncKeyAgent, util as keyManagementUtil } from '../KeyManagement';
import { Cardano } from '@cardano-sdk/core';

export type CreateVotingAuxDataProps = {
  keyAgent: AsyncKeyAgent;
  votingPublicKey: Cardano.Bip32PublicKey;
  rewardAccount: Cardano.RewardAccount;
  nonce: number;
};

export const createVotingAuxData = async ({
  keyAgent,
  votingPublicKey,
  rewardAccount,
  nonce
}: CreateVotingAuxDataProps): Promise<Cardano.AuxiliaryData> => {
  const votingPublicKeyBytes = Buffer.from(votingPublicKey, 'hex');
  const publicStakeKey = await keyAgent.derivePublicKey(keyManagementUtil.STAKE_KEY_DERIVATION_PATH);
  const publicStakeKeyBytes = Buffer.from(publicStakeKey, 'hex');
  const rewardAccountKeyHash = Cardano.Ed25519KeyHash.fromRewardAccount(rewardAccount);
  const rewardAccountKeyHashBytes = Buffer.from(rewardAccountKeyHash, 'hex');

  const votingData = new Map<bigint, Cardano.Metadatum>([
    [1n, votingPublicKeyBytes],
    [2n, publicStakeKeyBytes],
    [3n, rewardAccountKeyHashBytes],
    [4n, BigInt(nonce)]
  ]);

  // "pubkey (generated for voting app) signed using stakekey"
  const signature = await keyAgent.signVotingMetadata(votingPublicKeyBytes);
  const votingSignature = new Map([[1n, Buffer.from(signature, 'hex')]]);

  const votingAuxData = new Map([
    [BigInt(keyManagementUtil.VotingLabels.DATA), votingData],
    [BigInt(keyManagementUtil.VotingLabels.SIG), votingSignature]
  ]);
  return {
    body: {
      blob: votingAuxData
    }
  };
};
