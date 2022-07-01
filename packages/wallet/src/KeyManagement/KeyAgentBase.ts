import {
  AccountDerivationPathDefaults,
  AddressDerivationPath,
  GroupedAddress,
  KeyAgent,
  KeyDerivationPath,
  KeyRole,
  SerializableKeyAgentData,
  SignBlobResult,
  SignTransactionOptions,
  SignVotingMetadataProps
} from './types';
import { CSL, Cardano, util } from '@cardano-sdk/core';
import { STAKE_KEY_DERIVATION_PATH } from './util';
import { TxInternals } from '../Transaction';

export abstract class KeyAgentBase implements KeyAgent {
  readonly #serializableData: SerializableKeyAgentData;

  get knownAddresses(): GroupedAddress[] {
    return this.#serializableData.knownAddresses;
  }
  set knownAddresses(addresses: GroupedAddress[]) {
    this.#serializableData.knownAddresses = addresses;
  }
  get serializableData(): SerializableKeyAgentData {
    return this.#serializableData;
  }
  get extendedAccountPublicKey(): Cardano.Bip32PublicKey {
    return this.serializableData.extendedAccountPublicKey;
  }
  get networkId(): Cardano.NetworkId {
    return this.serializableData.networkId;
  }
  get accountIndex(): number {
    return this.serializableData.accountIndex;
  }
  abstract signBlob(derivationPath: KeyDerivationPath, blob: Cardano.util.HexBlob): Promise<SignBlobResult>;
  abstract exportRootPrivateKey(): Promise<Cardano.Bip32PrivateKey>;
  abstract signTransaction(
    txInternals: TxInternals,
    signTransactionOptions: SignTransactionOptions
  ): Promise<Cardano.Signatures>;
  abstract signVotingMetadata(props: SignVotingMetadataProps): Promise<Cardano.Ed25519Signature>;

  constructor(serializableData: SerializableKeyAgentData) {
    this.#serializableData = serializableData;
  }

  /**
   * See https://github.com/cardano-foundation/CIPs/tree/master/CIP-1852#specification
   */
  async deriveAddress({ index, type }: AddressDerivationPath): Promise<GroupedAddress> {
    const knownAddress = this.knownAddresses.find(
      (addr) => addr.derivationPath.type === type && addr.derivationPath.index === index
    );
    if (knownAddress) return knownAddress;
    const derivedPublicPaymentKey = await this.deriveCslPublicKey({
      index,
      role: type as unknown as KeyRole
    });

    // Possible optimization: memoize/cache stakeKeyCredential, because it's always the same
    const publicStakeKey = await this.deriveCslPublicKey(STAKE_KEY_DERIVATION_PATH);
    const stakeKeyCredential = CSL.StakeCredential.from_keyhash(publicStakeKey.hash());

    const address = CSL.BaseAddress.new(
      this.networkId,
      CSL.StakeCredential.from_keyhash(derivedPublicPaymentKey.hash()),
      stakeKeyCredential
    ).to_address();

    const rewardAccount = CSL.RewardAddress.new(this.networkId, stakeKeyCredential).to_address();
    const groupedAddress = {
      address: Cardano.Address(address.to_bech32()),
      derivationPath: {
        accountIndex: this.accountIndex,

        coinType: AccountDerivationPathDefaults.CoinType,

        index,
        /**
         * TODO - CHECK - purpose / coinType / accountIndex are defaulted.
         * To use passed params we need to start deriveCslPublicKey from root prv key but,
         * root private key is not accessible for HW key agents.
         */
        purpose: AccountDerivationPathDefaults.Purpose,
        type
      },
      networkId: this.networkId,
      rewardAccount: Cardano.RewardAccount(rewardAccount.to_bech32())
    };
    this.knownAddresses = [...this.knownAddresses, groupedAddress];
    return groupedAddress;
  }

  async derivePublicKey(derivationPath: KeyDerivationPath): Promise<Cardano.Ed25519PublicKey> {
    const cslPublicKey = await this.deriveCslPublicKey(derivationPath);
    return Cardano.Ed25519PublicKey.fromHexBlob(util.bytesToHex(cslPublicKey.as_bytes()));
  }

  protected async deriveCslPublicKey({ index, role: type }: KeyDerivationPath): Promise<CSL.PublicKey> {
    const accountPublicKeyBytes = Buffer.from(this.extendedAccountPublicKey, 'hex');
    const accountPublicKey = CSL.Bip32PublicKey.from_bytes(accountPublicKeyBytes);
    return accountPublicKey.derive(type).derive(index).to_raw_key();
  }
}
