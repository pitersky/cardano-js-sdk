import { Cardano } from '@cardano-sdk/core';
import { SingleAddressWallet, KeyManagement } from '../../../src';
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
  let ownAddress: Cardano.Address;

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
    ownAddress = (await firstValueFrom(wallet.addresses$))[0].address;
  });

  afterAll(() => wallet.shutdown());

  test('can submit tx with voting metadata and then query it', async () => {
    const { pubKey } = KeyManagement.util.generateVotingKeyPair();
    const { txInternals, votingAuxData } = await wallet.initializeVotingRegistrationTx({
      networkId: Cardano.NetworkId.testnet,
      votingPublicKey: pubKey,
      nonce: 1234567
    });
    const outgoingTx = await wallet.finalizeTx(txInternals, votingAuxData);
    await wallet.submitTx(outgoingTx);
    const loadedTx = await firstValueFrom(
      wallet.transactions.history$.pipe(
        map((txs) => txs.find((tx) => tx.id === outgoingTx.id)),
        filter(isNotNil)
      )
    );
    expect(loadedTx.auxiliaryData).toEqual(votingAuxData);
  });
});
