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
  const publicStakeKey = await keyAgent.derivePublicKey(keyManagementUtil.STAKE_KEY_DERIVATION_PATH);
  const rewardAccountKeyHash = Cardano.Ed25519KeyHash.fromRewardAccount(rewardAccount);

  const votingData = new Map<bigint, Cardano.Metadatum>([
    [1n, Buffer.from(votingPublicKey, 'hex')],
    [2n, Buffer.from(publicStakeKey, 'hex')],
    [3n, Buffer.from(rewardAccountKeyHash, 'hex')],
    [4n, BigInt(nonce)]
  ]);

  const signature = await keyAgent.signVotingMetadata({
    nonce,
    publicStakeKey: `0x${publicStakeKey}`,
    rewardAccountKeyHash: `0x${rewardAccountKeyHash}`,
    votingPublicKey: `0x${votingPublicKey}`
  });

  // blake2b-256 hash of the metadata signed using stakekey
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
