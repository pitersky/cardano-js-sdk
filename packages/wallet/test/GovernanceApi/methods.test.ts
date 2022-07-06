import * as mocks from '../mocks';
import { Cardano } from '@cardano-sdk/core';
import { GovernanceApi, VotingLabels } from '../../src/GovernanceApi';
import { KeyManagement } from '../../src';

describe('GovernanceApi methods', () => {
  let asyncKeyAgent: KeyManagement.AsyncKeyAgent;
  let governanceApi: GovernanceApi;

  beforeEach(async () => {
    const keyAgentReady = mocks.testKeyAgent();
    const keyAgent = await keyAgentReady;
    asyncKeyAgent = KeyManagement.util.createAsyncKeyAgent(keyAgent);
    governanceApi = new GovernanceApi(asyncKeyAgent);
  });

  it('getVotingKey', async () => {
    const votingKey = governanceApi.getVotingKey();
    expect(typeof votingKey.prvKey).toBe('string');
    expect(typeof votingKey.pubKey).toBe('string');
  });

  it('buildDelegation', async () => {
    const votingKeyPair = governanceApi.getVotingKey();
    const publicStakeKey = await asyncKeyAgent.derivePublicKey(KeyManagement.util.STAKE_KEY_DERIVATION_PATH);
    // rewardAccount (hex-encoded): e0ae3a0a7aeda4aea522e74e4fe36759fca80789a613a58a4364f6ecef
    const rewardAccount = Cardano.RewardAccount('stake_test1uzhr5zn6akj2affzua8ylcm8t872spuf5cf6tzjrvnmwemcehgcjm');
    const nonce = 1234;
    const votingAuxData = await governanceApi.buildDelegation({
      nonce,
      rewardAccount,
      votingPublicKey: votingKeyPair.pubKey
    });
    const auxBlobData = votingAuxData.body.blob?.get(BigInt(VotingLabels.DATA)) as Cardano.MetadatumMap;
    const auxBlobData1n = auxBlobData.get(1n) as Buffer;
    const auxBlobData2n = auxBlobData.get(2n) as Buffer;
    const auxBlobData3n = auxBlobData.get(3n) as Buffer;
    const auxBlobData4n = auxBlobData.get(4n) as Buffer;
    expect(auxBlobData1n?.toString('hex')).toEqual(votingKeyPair.pubKey);
    expect(auxBlobData2n?.toString('hex')).toEqual(publicStakeKey);
    expect(auxBlobData3n?.toString('hex')).toEqual('e0ae3a0a7aeda4aea522e74e4fe36759fca80789a613a58a4364f6ecef');
    expect(auxBlobData4n).toEqual(BigInt(nonce));
  });

  it('signDelegation', async () => {
    const signature = await governanceApi.signDelegation({
      nonce: 1234,
      publicStakeKey: '0x076773f044bc7d9af799c2a9392cad40df68b4f8d36b691dfd37950bc50cedae',
      rewardAccountKey: '0xe0ae3a0a7aeda4aea522e74e4fe36759fca80789a613a58a4364f6ecef',
      votingPublicKey: '0x0036ef3e1f0d3f5989e2d155ea54bdb2a72c4c456ccb959af4c94868f473f5a0'
    });
    expect(typeof signature).toBe('string');
  });
});
