/* eslint-disable max-statements */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as mocks from '../mocks';
import { AssetId, createStubStakePoolSearchProvider, createStubTimeSettingsProvider } from '@cardano-sdk/util-dev';
import { Cardano, WalletProvider, testnetTimeSettings } from '@cardano-sdk/core';
import { KeyManagement, SingleAddressWallet, SyncStatus, Wallet } from '../../src';
import { WalletStores, createInMemoryWalletStores } from '../../src/persistence';
import { filter, firstValueFrom } from 'rxjs';
import { flatten } from 'lodash-es';
import { queryTransactionsResult2 } from '../mocks';

const name = 'Test Wallet';
const address = mocks.utxo[0][0].address;
const rewardAccount = mocks.rewardAccount;

const createWallet = async (stores: WalletStores, walletProvider: WalletProvider) => {
  const keyAgent = await mocks.testKeyAgent();
  const txSubmitProvider = mocks.mockTxSubmitProvider();
  const assetProvider = mocks.mockAssetProvider();
  const stakePoolSearchProvider = createStubStakePoolSearchProvider();
  const timeSettingsProvider = createStubTimeSettingsProvider(testnetTimeSettings);
  const groupedAddress: KeyManagement.GroupedAddress = {
    accountIndex: 0,
    address,
    index: 0,
    networkId: Cardano.NetworkId.testnet,
    rewardAccount,
    type: KeyManagement.AddressType.External
  };
  keyAgent.deriveAddress = jest.fn().mockResolvedValue(groupedAddress);
  keyAgent.knownAddresses.push(groupedAddress);
  return new SingleAddressWallet(
    { name },
    { assetProvider, keyAgent, stakePoolSearchProvider, stores, timeSettingsProvider, txSubmitProvider, walletProvider }
  );
};

const assertWalletProperties = async (wallet: Wallet, expectedSyncStatusAfterLoad: SyncStatus) => {
  // name
  expect(wallet.name).toBe(name);
  // utxo
  await firstValueFrom(wallet.utxo.available$);
  await firstValueFrom(wallet.utxo.total$);
  expect(wallet.utxo.available$.value).toEqual(mocks.utxo);
  expect(wallet.utxo.total$.value).toEqual(mocks.utxo);
  // balance
  await firstValueFrom(wallet.balance.available$);
  await firstValueFrom(wallet.balance.total$);
  expect(wallet.balance.available$.value?.coins).toEqual(
    Cardano.util.coalesceValueQuantities(mocks.utxo.map((utxo) => utxo[1].value)).coins
  );
  expect(wallet.balance.total$.value?.rewards).toBe(mocks.rewards);
  // transactions
  await firstValueFrom(wallet.transactions.history.all$);
  expect(wallet.transactions.history.all$.value?.length).toBeGreaterThan(0);
  // tip$
  await firstValueFrom(wallet.tip$);
  expect(wallet.tip$.value).toEqual(mocks.ledgerTip);
  // networkInfo$
  await firstValueFrom(wallet.networkInfo$);
  expect(wallet.networkInfo$.value?.currentEpoch).toEqual(mocks.currentEpoch);
  // protocolParameters$
  await firstValueFrom(wallet.protocolParameters$);
  expect(wallet.protocolParameters$.value).toEqual(mocks.protocolParameters);
  // genesisParameters$
  await firstValueFrom(wallet.genesisParameters$);
  expect(wallet.genesisParameters$.value).toEqual(mocks.genesisParameters);
  // delegation
  const rewardsHistory = await firstValueFrom(wallet.delegation.rewardsHistory$);
  const expectedRewards = flatten([...mocks.rewardsHistory.values()]);
  expect(rewardsHistory.all).toEqual(expectedRewards);
  const rewardAccounts = await firstValueFrom(wallet.delegation.rewardAccounts$);
  expect(rewardAccounts).toHaveLength(1);
  expect(rewardAccounts[0].address).toBe(rewardAccount);
  expect(rewardAccounts[0].delegatee).not.toBeUndefined();
  expect(rewardAccounts[0].rewardBalance.total).toBe(mocks.rewards);
  // addresses$
  const addresses = await firstValueFrom(wallet.addresses$);
  expect(addresses[0].address).toEqual(address);
  expect(addresses[0].rewardAccount).toEqual(rewardAccount);
  // assets$
  expect(await firstValueFrom(wallet.assets$)).toEqual(new Map([[AssetId.TSLA, mocks.asset]]));
  // timeSettings$
  expect(await firstValueFrom(wallet.timeSettings$)).toEqual(testnetTimeSettings);
  // syncStatus$
  expect(await firstValueFrom(wallet.syncStatus$)).toBe(expectedSyncStatusAfterLoad);
};

const assertWalletProperties2 = async (wallet: Wallet) => {
  expect(wallet.utxo.available$.value).toEqual(mocks.utxo2);
  expect(wallet.utxo.total$.value).toEqual(mocks.utxo2);
  expect(wallet.balance.available$.value?.coins).toEqual(
    Cardano.util.coalesceValueQuantities(mocks.utxo2.map((utxo) => utxo[1].value)).coins
  );
  expect(wallet.balance.total$.value?.rewards).toBe(mocks.rewards2);
  expect(wallet.transactions.history.all$.value?.length).toEqual(queryTransactionsResult2.length);
  expect(wallet.tip$.value).toEqual(mocks.ledgerTip2);
  expect(wallet.networkInfo$.value?.currentEpoch.number).toEqual(mocks.currentEpochNo2);
  expect(wallet.protocolParameters$.value).toEqual(mocks.protocolParameters2);
  expect(wallet.genesisParameters$.value).toEqual(mocks.genesisParameters2);
  // delegation
  const rewardsHistory = wallet.delegation.rewardsHistory$.value!;
  const expectedRewards = flatten([...mocks.rewardsHistory2.values()]);
  expect(rewardsHistory.all).toEqual(expectedRewards);
  const rewardAccounts = await firstValueFrom(wallet.delegation.rewardAccounts$);
  expect(rewardAccounts).toHaveLength(1);
  expect(rewardAccounts[0].rewardBalance.total).toBe(mocks.rewards2);
};

describe('SingleAddressWallet load', () => {
  it('loads all properties from provider, stores them and restores on subsequent load, fetches new data', async () => {
    const stores = createInMemoryWalletStores();
    const wallet1 = await createWallet(stores, mocks.mockWalletProvider());
    await assertWalletProperties(wallet1, SyncStatus.UpToDate);
    wallet1.shutdown();
    const wallet2 = await createWallet(stores, mocks.mockWalletProvider2(100));
    await assertWalletProperties(wallet2, SyncStatus.Syncing);
    await firstValueFrom(wallet2.syncStatus$.pipe(filter((syncStatus) => syncStatus === SyncStatus.UpToDate)));
    await assertWalletProperties2(wallet2);
    wallet2.shutdown();
  });
});