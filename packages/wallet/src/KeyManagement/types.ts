import { CSL, Cardano } from '@cardano-sdk/core';
import { CardanoKeyConst } from './util';
import { Observable } from 'rxjs';
import { Shutdown } from '@cardano-sdk/util';
import { TxInternals } from '../Transaction';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid-noevents';
import TransportWebHID from '@ledgerhq/hw-transport-webhid';

export interface SignBlobResult {
  publicKey: Cardano.Ed25519PublicKey;
  signature: Cardano.Ed25519Signature;
}

export enum KeyAgentType {
  InMemory = 'InMemory',
  Ledger = 'Ledger',
  Trezor = 'Trezor'
}

export enum KeyRole {
  External = 0,
  Internal = 1,
  Stake = 2
}

/** Internal = change address & External = receipt address */
export enum AddressType {
  /**
   * Change address
   */
  Internal = 1,
  /**
   * Receipt address
   */
  External = 0
}

export enum DeviceType {
  Ledger = 'Ledger'
}

export enum CommunicationType {
  Web = 'web',
  Node = 'node'
}

export type BIP32Path = Array<number>;

export enum AccountDerivationPathDefaults {
  /**
   * Default: 1852
   */
  Purpose = CardanoKeyConst.PURPOSE,
  /**
   * Default: 1815
   */
  CoinType = CardanoKeyConst.COIN_TYPE,
  AccountIndex = 0
}

export interface AccountDerivationPath {
  accountIndex: number;
  purpose: number;
  coinType: number;
}

export type AccountKeyDerivationPath = {
  role: KeyRole;
  index: number;
};

export type AccountAddressDerivationPath = {
  type: AddressType;
  index: number;
};

export interface GroupedAddress {
  networkId: Cardano.NetworkId;
  derivationPath: AccountDerivationPath & {
    type: AddressType;
    index: number;
  };
  address: Cardano.Address;
  rewardAccount: Cardano.RewardAccount;
}

export interface TrezorConfig {
  communicationType: CommunicationType;
  silentMode?: boolean;
  lazyLoad?: boolean;
  manifest: {
    email: string;
    appUrl: string;
  };
}

/**
 * number[] is used by InMemoryKeyAgent
 */
export type AgentSpecificData = number[] | null;

export interface SerializableKeyAgentDataBase {
  networkId: Cardano.NetworkId;
  accountIndex: number;
  purpose: number;
  coinType: number;
  knownAddresses: GroupedAddress[];
  extendedAccountPublicKey: Cardano.Bip32PublicKey;
}

export interface SerializableInMemoryKeyAgentData extends SerializableKeyAgentDataBase {
  __typename: KeyAgentType.InMemory;
  encryptedRootPrivateKeyBytes: number[];
}

export interface SerializableLedgerKeyAgentData extends SerializableKeyAgentDataBase {
  __typename: KeyAgentType.Ledger;
  communicationType: CommunicationType;
  protocolMagic: Cardano.NetworkMagic;
}

export interface SerializableTrezorKeyAgentData extends SerializableKeyAgentDataBase {
  __typename: KeyAgentType.Trezor;
  trezorConfig: TrezorConfig;
  protocolMagic: Cardano.NetworkMagic;
}

export type SerializableKeyAgentData =
  | SerializableInMemoryKeyAgentData
  | SerializableLedgerKeyAgentData
  | SerializableTrezorKeyAgentData;

export type LedgerTransportType = TransportWebHID | TransportNodeHid;

/**
 * @returns password used to decrypt root private key
 */
export type GetPassword = (noCache?: true) => Promise<Uint8Array>;

/**
 * @param txIn transaction input to resolve address from
 * @returns input owner address
 */
export type ResolveInputAddress = (txIn: Cardano.NewTxIn) => Promise<Cardano.Address | null>;

export interface SignTransactionOptions {
  inputAddressResolver: ResolveInputAddress;
  additionalKeyPaths?: AccountKeyDerivationPath[];
}

export interface SignVotingMetadataProps {
  votingPublicKey: string;
  publicStakeKey: string;
  rewardAccountKey: string;
  nonce: number;
}

export interface DeriveAccountPrivateKeyProps {
  rootPrivateKey: CSL.Bip32PrivateKey;
  accountIndex: number;
  purpose?: number;
  coinType?: number;
}

export interface KeyAgent {
  get networkId(): Cardano.NetworkId;
  get accountIndex(): number;
  get purpose(): number;
  get coinType(): number;
  get serializableData(): SerializableKeyAgentData;
  get knownAddresses(): GroupedAddress[];
  get extendedAccountPublicKey(): Cardano.Bip32PublicKey;
  /**
   * @throws AuthenticationError
   */
  squashAccount(derivationPath: AccountDerivationPath): Promise<KeyAgent>;
  /**
   * @throws AuthenticationError
   */
  signBlob(derivationPath: AccountKeyDerivationPath, blob: Cardano.util.HexBlob): Promise<SignBlobResult>;
  /**
   * @throws AuthenticationError
   */
  signTransaction(txInternals: TxInternals, options: SignTransactionOptions): Promise<Cardano.Signatures>;
  /**
   * @throws AuthenticationError
   */
  derivePublicKey(derivationPath: AccountKeyDerivationPath): Promise<Cardano.Ed25519PublicKey>;
  /**
   * @throws AuthenticationError
   */
  deriveAddress(derivationPath: AccountAddressDerivationPath): Promise<GroupedAddress>;
  /**
   * @throws AuthenticationError
   */
  exportRootPrivateKey(): Promise<Cardano.Bip32PrivateKey>;
  /**
   * @throws AuthenticationError
   */
  signVotingMetadata(props: SignVotingMetadataProps): Promise<Cardano.Ed25519Signature>;
}

export type AsyncKeyAgent = Pick<
  KeyAgent,
  'deriveAddress' | 'derivePublicKey' | 'signBlob' | 'signTransaction' | 'signVotingMetadata'
> & {
  knownAddresses$: Observable<GroupedAddress[]>;
} & Shutdown;

export interface VotingKeyPair {
  prvKey: Cardano.Bip32PrivateKey;
  pubKey: Cardano.Bip32PublicKey;
}
