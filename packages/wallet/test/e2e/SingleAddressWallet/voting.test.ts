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
    expect(loadedTx.auxiliaryData).toEqual(auxiliaryData);
  });
});
