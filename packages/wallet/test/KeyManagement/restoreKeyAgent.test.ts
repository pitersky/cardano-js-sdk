import { Cardano } from '@cardano-sdk/core';
import { InvalidSerializableDataError } from '../../src/KeyManagement/errors';
import { KeyManagement } from '../../src';

describe('KeyManagement/restoreKeyAgent', () => {
  describe('InMemoryKeyAgent', () => {
    const inMemoryKeyAgentData: KeyManagement.SerializableInMemoryKeyAgentData = {
      __typename: KeyManagement.KeyAgentType.InMemory,
      accountIndex: 0,
      coinType: KeyManagement.AccountDerivationPathDefaults.CoinType,
      encryptedRootPrivateKeyBytes: [
        9, 10, 153, 62, 225, 131, 81, 153, 234, 186, 63, 211, 14, 172, 194, 82, 184, 119, 228, 49, 2, 133, 239, 127,
        196, 140, 219, 8, 136, 248, 186, 84, 165, 123, 197, 105, 73, 181, 144, 27, 137, 206, 159, 63, 37, 138, 150, 49,
        194, 164, 58, 66, 200, 97, 242, 184, 110, 11, 39, 106, 131, 156, 196, 138, 219, 29, 7, 71, 117, 172, 111, 88,
        44, 103, 205, 168, 94, 156, 89, 252, 92, 55, 218, 216, 40, 59, 88, 227, 170, 118, 161, 116, 84, 39, 92, 33, 66,
        157, 42, 14, 225, 45, 175, 93, 214, 141, 163, 136, 13, 46, 152, 33, 166, 202, 127, 122, 146, 239, 38, 125, 114,
        66, 141, 241, 161, 163, 19, 81, 122, 125, 149, 49, 175, 149, 111, 48, 138, 254, 189, 69, 35, 135, 62, 177, 43,
        152, 95, 7, 87, 78, 204, 222, 109, 3, 239, 117
      ],
      extendedAccountPublicKey: Cardano.Bip32PublicKey(
        // eslint-disable-next-line max-len
        '6199186adb51974690d7247d2646097d2c62763b767b528816fb7ed3f9f55d396199186adb51974690d7247d2646097d2c62763b767b528816fb7ed3f9f55d39'
      ),
      knownAddresses: [
        {
          address: Cardano.Address(
            'addr1qx52knza2h5x090n4a5r7yraz3pwcamk9ppvuh7e26nfks7pnmhxqavtqy02zezklh27jt9r6z62sav3mugappdc7xnskxy2pn'
          ),
          derivationPath: {
            accountIndex: 0,
            coinType: KeyManagement.AccountDerivationPathDefaults.CoinType,
            index: 0,
            purpose: KeyManagement.AccountDerivationPathDefaults.Purpose,
            type: KeyManagement.AddressType.External
          },
          networkId: Cardano.NetworkId.mainnet,
          rewardAccount: Cardano.RewardAccount('stake1u89sasnfyjtmgk8ydqfv3fdl52f36x3djedfnzfc9rkgzrcss5vgr')
        }
      ],
      networkId: 0,
      purpose: KeyManagement.AccountDerivationPathDefaults.Purpose
    };
    // eslint-disable-next-line unicorn/consistent-function-scoping
    const getPassword: KeyManagement.GetPassword = async () => Buffer.from('password');

    it('can restore key manager from valid data and password', async () => {
      const keyAgent = await KeyManagement.restoreKeyAgent(inMemoryKeyAgentData, getPassword);
      expect(keyAgent.knownAddresses).toBe(inMemoryKeyAgentData.knownAddresses);
    });

    it('throws when attempting to restore key manager from valid data and no password', async () => {
      await expect(() => KeyManagement.restoreKeyAgent(inMemoryKeyAgentData)).rejects.toThrowError(
        new InvalidSerializableDataError('Expected "getPassword" in RestoreKeyAgentProps for InMemoryKeyAgent"')
      );
    });

    it('does not attempt to decrypt private key on restoration', async () => {
      // invalid password, would throw if it attempts to decrypt
      await expect(
        KeyManagement.restoreKeyAgent(inMemoryKeyAgentData, async () => Buffer.from('123'))
      ).resolves.not.toThrow();
    });
  });

  describe('LedgerKeyAgent', () => {
    const ledgerKeyAgentData: KeyManagement.SerializableLedgerKeyAgentData = {
      __typename: KeyManagement.KeyAgentType.Ledger,
      accountIndex: 0,
      coinType: KeyManagement.AccountDerivationPathDefaults.CoinType,
      communicationType: KeyManagement.CommunicationType.Node,
      extendedAccountPublicKey: Cardano.Bip32PublicKey(
        // eslint-disable-next-line max-len
        'fc5ab25e830b67c47d0a17411bf7fdabf711a597fb6cf04102734b0a2934ceaaa65ff5e7c52498d52c07b8ddfcd436fc2b4d2775e2984a49d0c79f65ceee4779'
      ),
      knownAddresses: [
        {
          address: Cardano.Address(
            'addr1qx52knza2h5x090n4a5r7yraz3pwcamk9ppvuh7e26nfks7pnmhxqavtqy02zezklh27jt9r6z62sav3mugappdc7xnskxy2pn'
          ),
          derivationPath: {
            accountIndex: 0,
            coinType: KeyManagement.AccountDerivationPathDefaults.CoinType,
            index: 0,
            purpose: KeyManagement.AccountDerivationPathDefaults.Purpose,
            type: KeyManagement.AddressType.External
          },
          networkId: Cardano.NetworkId.mainnet,
          rewardAccount: Cardano.RewardAccount('stake1u89sasnfyjtmgk8ydqfv3fdl52f36x3djedfnzfc9rkgzrcss5vgr')
        }
      ],
      networkId: 0,
      protocolMagic: 1_097_911_063,
      purpose: KeyManagement.AccountDerivationPathDefaults.Purpose
    };

    it('can restore key manager from valid data', async () => {
      const keyAgent = await KeyManagement.restoreKeyAgent(ledgerKeyAgentData);
      expect(keyAgent.knownAddresses).toBe(ledgerKeyAgentData.knownAddresses);
    });
  });

  describe('TrezorKeyAgent', () => {
    const trezorKeyAgentData: KeyManagement.SerializableTrezorKeyAgentData = {
      __typename: KeyManagement.KeyAgentType.Trezor,
      accountIndex: 0,
      coinType: KeyManagement.AccountDerivationPathDefaults.CoinType,
      extendedAccountPublicKey: Cardano.Bip32PublicKey(
        // eslint-disable-next-line max-len
        'fc5ab25e830b67c47d0a17411bf7fdabf711a597fb6cf04102734b0a2934ceaaa65ff5e7c52498d52c07b8ddfcd436fc2b4d2775e2984a49d0c79f65ceee4779'
      ),
      knownAddresses: [
        {
          address: Cardano.Address(
            'addr1qx52knza2h5x090n4a5r7yraz3pwcamk9ppvuh7e26nfks7pnmhxqavtqy02zezklh27jt9r6z62sav3mugappdc7xnskxy2pn'
          ),
          derivationPath: {
            accountIndex: 0,
            coinType: KeyManagement.AccountDerivationPathDefaults.CoinType,
            index: 0,
            purpose: KeyManagement.AccountDerivationPathDefaults.Purpose,
            type: KeyManagement.AddressType.External
          },
          networkId: Cardano.NetworkId.mainnet,
          rewardAccount: Cardano.RewardAccount('stake1u89sasnfyjtmgk8ydqfv3fdl52f36x3djedfnzfc9rkgzrcss5vgr')
        }
      ],
      networkId: 0,
      protocolMagic: 1_097_911_063,
      purpose: KeyManagement.AccountDerivationPathDefaults.Purpose,
      trezorConfig: {
        communicationType: KeyManagement.CommunicationType.Node,
        manifest: {
          appUrl: 'https://your.application.com',
          email: 'email@developer.com'
        }
      }
    };

    it('can restore key manager from valid data', async () => {
      const keyAgent = await KeyManagement.restoreKeyAgent(trezorKeyAgentData);
      expect(keyAgent.knownAddresses).toBe(trezorKeyAgentData.knownAddresses);
    });
  });

  it('throws when attempting to restore key manager of unsupported __typename', async () => {
    await expect(() =>
      KeyManagement.restoreKeyAgent({
        __typename: 'OTHER'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any)
    ).rejects.toThrowError(
      new InvalidSerializableDataError("Restoring key agent of __typename 'OTHER' is not implemented")
    );
  });
});
