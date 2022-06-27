import { KeyManagement } from '@cardano-sdk/wallet';
import { RemoteApiProperties, RemoteApiPropertyType } from '../messaging';

export const keyAgentChannel = (walletName: string) => `${walletName}$-keyAgent`;

export const keyAgentProperties: RemoteApiProperties<KeyManagement.AsyncKeyAgent> = {
  deriveAddress: RemoteApiPropertyType.MethodReturningPromise,
  knownAddresses$: RemoteApiPropertyType.HotObservable,
  signBlob: RemoteApiPropertyType.MethodReturningPromise,
  signTransaction: RemoteApiPropertyType.MethodReturningPromise,
  derivePublicKey: RemoteApiPropertyType.MethodReturningPromise,
  signVotingMetadata: RemoteApiPropertyType.MethodReturningPromise
};
