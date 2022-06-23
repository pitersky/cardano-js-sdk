import { AsyncKeyAgent, util as keyManagementUtil } from '../KeyManagement';
import { CSL, Cardano } from '@cardano-sdk/core';

export type CreateVotingAuxDataProps = {
  keyAgent: AsyncKeyAgent;
  votingPublicKey: Cardano.Bip32PublicKey;
  nonce: number;
  rewardAccount: Cardano.RewardAccount;
};

export const createVotingAuxData = async ({
  keyAgent,
  votingPublicKey,
  nonce,
  rewardAccount
}: CreateVotingAuxDataProps): Promise<Cardano.AuxiliaryData> => {
  const publicStakeKey = await keyAgent.derivePublicKey(keyManagementUtil.STAKE_KEY_DERIVATION_PATH);
  const cslRewardAccount = CSL.Address.from_bech32(rewardAccount.toString());
  const rewardAccountBytes = Buffer.from(cslRewardAccount.to_bytes());
  const votingData = new Map<bigint, Cardano.Metadatum>([
    [1n, Buffer.from(votingPublicKey, 'hex')],
    [2n, Buffer.from(publicStakeKey, 'hex')],
    [3n, rewardAccountBytes],
    [4n, BigInt(nonce)]
  ]);
  const signature = await keyAgent.signVotingMetadata({
    nonce,
    publicStakeKey: `0x${publicStakeKey}`,
    rewardAccountKey: `0x${rewardAccountBytes.toString('hex')}`,
    votingPublicKey: `0x${votingPublicKey}`
  });

  // blake2b-256 hash of the metadata signed using stakekey
  const votingSignature = new Map([[1n, Buffer.from(signature, 'hex')]]);

  const votingAuxData = new Map<bigint, Cardano.MetadatumMap>([
    [BigInt(keyManagementUtil.VotingLabels.DATA), votingData],
    [BigInt(keyManagementUtil.VotingLabels.SIG), votingSignature]
  ]);

  return {
    body: {
      blob: votingAuxData
    }
  };
};
