import { Asset, Cardano } from '@cardano-sdk/core';

/**
 * Cardano.AssetId as an object with `policyId` and `name`
 */
export type AssetPolicyIdAndName = Pick<Asset.AssetInfo, 'name' | 'policyId'>;

/**
 * Service to get CIP-25 NFT metadata for a given asset
 */
export interface NftMetadataService {
  /**
   * Get CIP-25 NFT metadata for a given asset
   *
   * @returns CIP-25 NFT metadata for NFTs, `undefined` for assets that are not NFTs
   */
  getNftMetadata(asset: AssetPolicyIdAndName): Promise<Asset.NftMetadata | undefined>;
}

/**
 * Service to get CIP-35 token metadata for a given subject
 */
export interface TokenMetadataService {
  /**
   * Get CIP-35 token metadata for a given subject
   *
   * @returns CIP-35 token metadata, `null` if not found
   */
  getTokenMetadata(assetIds: Cardano.AssetId[]): Promise<(Asset.TokenMetadata | null)[]>;
}
