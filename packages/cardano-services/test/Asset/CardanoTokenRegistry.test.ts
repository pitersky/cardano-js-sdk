import { Asset, Cardano } from '@cardano-sdk/core';
import { CardanoTokenRegistry } from '../../src/Asset';
import { dummyLogger } from 'ts-log';

describe('CardanoTokenRegistry', () => {
  const tokenRegistry = new CardanoTokenRegistry({ logger: dummyLogger });
  const nonvalidAssetId = Cardano.AssetId('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  const validAssetId = Cardano.AssetId('f43a62fdc3965df486de8a0d32fe800963589c41b38946602a0dc53541474958');

  it('returns null for nonexisting AssetId', async () => {
    expect(await tokenRegistry.getTokenMetadata([nonvalidAssetId])).toEqual([null]);
  });

  it('returns metadata when subject exists', async () => {
    const [metadata] = await tokenRegistry.getTokenMetadata([validAssetId]);

    expect(metadata).not.toBeNull();
    if (!metadata) return;

    // Skip icon from test as it is a long long string
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { icon, ...rest } = metadata;
    const result: Asset.TokenMetadata = {
      decimals: 8,
      // eslint-disable-next-line max-len
      desc: "SingularityNET lets anyone - create, share, and monetize AI services at scale. SingularityNET is the world's first decentralized AI network",
      name: 'SingularityNet AGIX Token',
      ticker: 'AGIX',
      url: 'https://singularitynet.io/'
    };

    expect(rest).toEqual(result);
  });

  it('returns cached metadata for already requested subject', async () => {
    // We need to get metadata at the beginning of the test, to make work
    // yarn test -t "returns cached metadata for already requested subject"
    const firstResult = await tokenRegistry.getTokenMetadata([nonvalidAssetId, validAssetId]);
    const startTime = Date.now();
    const secondResult = await tokenRegistry.getTokenMetadata([validAssetId]);
    expect(Date.now() - startTime).toBeLessThan(5);
    expect(firstResult[0]).toBeNull();
    expect(firstResult[1]).not.toBeNull();
    expect(secondResult[0]).not.toBeNull();
  });
});
