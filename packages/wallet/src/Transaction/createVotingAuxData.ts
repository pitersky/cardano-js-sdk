import { AsyncKeyAgent, util as keyManagementUtil } from '../KeyManagement';
import { CSL, Cardano } from '@cardano-sdk/core';

export type CreateVotingAuxDataProps = {
  keyAgent: AsyncKeyAgent;
  votingPublicKey: Cardano.Bip32PublicKey;
  nonce: number;
  networkId: Cardano.NetworkId;
};

export const createVotingAuxData = async ({
  keyAgent,
  votingPublicKey,
  nonce,
  networkId
}: CreateVotingAuxDataProps): Promise<Cardano.AuxiliaryData> => {
  const publicStakeKey = await keyAgent.derivePublicKey(keyManagementUtil.STAKE_KEY_DERIVATION_PATH);
  const cslPublicStakeKey = CSL.PublicKey.from_bytes(Buffer.from(publicStakeKey, 'hex'));
  const rewardAddress = CSL.RewardAddress.new(networkId, CSL.StakeCredential.from_keyhash(cslPublicStakeKey.hash()));
  const rewardAddressBytes = Buffer.from(rewardAddress.to_address().to_bytes());
  const votingData = new Map<bigint, Cardano.Metadatum>([
    [1n, Buffer.from(votingPublicKey, 'hex')],
    [2n, Buffer.from(publicStakeKey, 'hex')],
    [3n, rewardAddressBytes],
    [4n, BigInt(nonce)]
  ]);

  const signature = await keyAgent.signVotingMetadata({
    nonce,
    publicStakeKey: `0x${publicStakeKey}`,
    rewardAccountKey: `0x${rewardAddressBytes.toString('hex')}`,
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
