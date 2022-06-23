import { Cardano } from '@cardano-sdk/core';
import { KeyManagement, SingleAddressWallet } from '../../../src';
import {
  assetProvider,
  chainHistoryProvider,
  keyAgentReady,
  networkInfoProvider,
  rewardsProvider,
  stakePoolProvider,
  txSubmitProvider,
  utxoProvider,
  walletProvider
} from '../config';
import { filter, firstValueFrom, map } from 'rxjs';
import { isNotNil } from '@cardano-sdk/util';

describe('SingleAddressWallet/voting_metadata', () => {
  let wallet: SingleAddressWallet;

  beforeAll(async () => {
    wallet = new SingleAddressWallet(
      { name: 'Test Wallet' },
      {
        assetProvider: await assetProvider,
        chainHistoryProvider: await chainHistoryProvider,
        keyAgent: await keyAgentReady,
        networkInfoProvider: await networkInfoProvider,
        rewardsProvider: await rewardsProvider,
        stakePoolProvider,
        txSubmitProvider: await txSubmitProvider,
        utxoProvider: await utxoProvider,
        walletProvider: await walletProvider
      }
    );
  });

  afterAll(() => wallet.shutdown());

  test('can submit tx with voting metadata and then query it', async () => {
    const votingKeyPair = KeyManagement.util.generateVotingKeyPair();
    const votingTxData = await wallet.initializeVotingRegistrationTx({
      nonce: 1_234_567,
      votingPublicKey: votingKeyPair.pubKey
    });
    const { txInternals, auxiliaryData } = votingTxData;
    const outgoingTx = await wallet.finalizeTx(txInternals, auxiliaryData);
    await wallet.submitTx(outgoingTx);
    const loadedTx = await firstValueFrom(
      wallet.transactions.history$.pipe(
        map((txs) => txs.find((tx) => tx.id === outgoingTx.id)),
        filter(isNotNil)
      )
    );
    const auxBlobData = auxiliaryData.body.blob?.get(
      BigInt(KeyManagement.util.VotingLabels.DATA)
    ) as Cardano.MetadatumMap;
    const loadedTxAuxBlobData = loadedTx.auxiliaryData?.body.blob?.get(
      BigInt(KeyManagement.util.VotingLabels.DATA)
    ) as Cardano.MetadatumMap;
    const auxBlobSignature = auxiliaryData.body.blob?.get(
      BigInt(KeyManagement.util.VotingLabels.SIG)
    ) as Cardano.MetadatumMap;
    const loadedTxAuxBlobSignature = loadedTx.auxiliaryData?.body.blob?.get(
      BigInt(KeyManagement.util.VotingLabels.SIG)
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
