import { Cardano } from '@cardano-sdk/core';
import { GovernanceApi, KeyManagement, SingleAddressWallet } from '../../../src';
import { VotingLabels } from '../../../src/GovernanceApi';
import {
  assetProvider,
  chainHistoryProvider,
  keyAgentReady,
  networkInfoProvider,
  rewardsProvider,
  stakePoolProvider,
  txSubmitProvider,
  utxoProvider
} from '../config';
import { filter, firstValueFrom, map } from 'rxjs';
import { isNotNil } from '@cardano-sdk/util';

describe('SingleAddressWallet/voting_metadata', () => {
  let wallet: SingleAddressWallet;
  let keyAgent: KeyManagement.AsyncKeyAgent;

  beforeAll(async () => {
    keyAgent = await keyAgentReady;
    wallet = new SingleAddressWallet(
      { name: 'Test Wallet' },
      {
        assetProvider: await assetProvider,
        chainHistoryProvider: await chainHistoryProvider,
        keyAgent,
        networkInfoProvider: await networkInfoProvider,
        rewardsProvider: await rewardsProvider,
        stakePoolProvider,
        txSubmitProvider: await txSubmitProvider,
        utxoProvider: await utxoProvider
      }
    );
  });

  afterAll(() => wallet.shutdown());

  test('can submit tx with voting metadata and then query it', async () => {
    const governanceApi = new GovernanceApi(keyAgent);
    const rewardAccount = (await firstValueFrom(wallet.addresses$))[0].rewardAccount;
    const ownAddress = (await firstValueFrom(wallet.addresses$))[0].address;
    const votingKeyPair = governanceApi.getVotingKey();
    const auxiliaryData = await governanceApi.buildDelegation({
      nonce: 1_234_567,
      rewardAccount,
      votingPublicKey: votingKeyPair.pubKey
    });
    const txInternals = await wallet.initializeTx({
      auxiliaryData,
      outputs: new Set([{ address: ownAddress, value: { coins: 1_000_000n } }])
    });
    const outgoingTx = await wallet.finalizeTx(txInternals, auxiliaryData);
    await wallet.submitTx(outgoingTx);
    const loadedTx = await firstValueFrom(
      wallet.transactions.history$.pipe(
        map((txs) => txs.find((tx) => tx.id === outgoingTx.id)),
        filter(isNotNil)
      )
    );
    const auxBlobData = auxiliaryData.body.blob?.get(BigInt(VotingLabels.DATA)) as Cardano.MetadatumMap;
    const loadedTxAuxBlobData = loadedTx.auxiliaryData?.body.blob?.get(
      BigInt(VotingLabels.DATA)
    ) as Cardano.MetadatumMap;
    const auxBlobSignature = auxiliaryData.body.blob?.get(BigInt(VotingLabels.SIG)) as Cardano.MetadatumMap;
    const loadedTxAuxBlobSignature = loadedTx.auxiliaryData?.body.blob?.get(
      BigInt(VotingLabels.SIG)
    ) as Cardano.MetadatumMap;
    const votingSignature = auxBlobData.get(1n) as Buffer;
    const publicStakeKey = auxBlobData.get(2n) as Buffer;
    const rewardAccountKeyHash = auxBlobData.get(3n) as Buffer;
    const nonce = auxBlobData.get(4n);
    const signature = auxBlobSignature.get(1n) as Buffer;
    expect(loadedTxAuxBlobData.size).toEqual(4);
    expect(loadedTxAuxBlobSignature.size).toEqual(1);
    expect(loadedTxAuxBlobData?.get(1n)).toEqual(`0x${votingSignature.toString('hex')}`);
    expect(loadedTxAuxBlobData?.get(2n)).toEqual(`0x${publicStakeKey.toString('hex')}`);
    expect(loadedTxAuxBlobData?.get(3n)).toEqual(`0x${rewardAccountKeyHash.toString('hex')}`);
    expect(loadedTxAuxBlobData?.get(4n)).toEqual(nonce);
    expect(loadedTxAuxBlobSignature?.get(1n)).toEqual(`0x${signature.toString('hex')}`);
  });
});
