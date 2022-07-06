import { Asset, Cardano } from '@cardano-sdk/core';
import { Logger } from 'ts-log';
import { TokenMetadataService } from './types';
import axios, { AxiosInstance } from 'axios';

const DEFAULT_METADATA_SERVER_URI = 'https://tokens.cardano.org';

/**
 * Configuration options for CardanoTokenRegistry
 */
export interface CardanoTokenRegistryConfiguration {
  metadataServerUri?: string;
}

interface CardanoTokenRegistryConfigurationWithRequired extends CardanoTokenRegistryConfiguration {
  metadataServerUri: string;
}

/**
 * Dependencies that are need to create CardanoTokenRegistry
 */
export interface CardanoTokenRegistryDependencies {
  logger: Logger;
}

/**
 * TokenMetadataService implementation using Cardano Token Registry public API
 */
export class CardanoTokenRegistry implements TokenMetadataService {
  #axiosClient: AxiosInstance;
  #cache: Record<string, Asset.TokenMetadata | null> = {};
  #logger: Logger;

  constructor({ logger }: CardanoTokenRegistryDependencies, config: CardanoTokenRegistryConfiguration = {}) {
    const defaultConfig: CardanoTokenRegistryConfigurationWithRequired = {
      metadataServerUri: DEFAULT_METADATA_SERVER_URI,
      ...config
    };

    this.#axiosClient = axios.create({ baseURL: defaultConfig.metadataServerUri });
    this.#logger = logger;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #checkNumberValue(data: any, attribute: string) {
    if (attribute in data && typeof data[attribute].value === 'number') return data[attribute].value as number;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  #checkStringValue(data: any, attribute: string) {
    if (attribute in data && typeof data[attribute].value === 'string') return data[attribute].value as string;
  }

  async getTokenMetadata(assetIds: Cardano.AssetId[]): Promise<(Asset.TokenMetadata | null)[]> {
    const assetIdsToRequest: Cardano.AssetId[] = [];
    // eslint-disable-next-line unicorn/no-new-array
    const ret: (Asset.TokenMetadata | null)[] = new Array(assetIds.length).fill(null);

    this.#logger.info(`Requested asset metatada for "${assetIds}"`);

    for (const [i, assetId] of assetIds.entries()) {
      const stringAssetId = assetId.toString();

      if (this.#cache[stringAssetId] !== undefined) {
        this.#logger.debug(`Using chached asset metatada value for "${stringAssetId}"`);
        ret[i] = this.#cache[stringAssetId];
      } else assetIdsToRequest.push(assetId);
    }

    // All metadatas was taken from cache
    if (assetIdsToRequest.length === 0) return ret;

    this.#logger.debug(`Fetching asset metatada for "${assetIdsToRequest}"`);

    try {
      const response = await this.#axiosClient.post('metadata/query', {
        properties: ['decimals', 'description', 'logo', 'name', 'ticker', 'url'],
        subjects: assetIdsToRequest
      });

      for (const data of response.data.subjects) {
        try {
          const assetId = Cardano.AssetId(data.subject);
          const metadata: Asset.TokenMetadata = {};

          metadata.decimals = this.#checkNumberValue(data, 'decimals');
          metadata.desc = this.#checkStringValue(data, 'description');
          metadata.icon = this.#checkStringValue(data, 'logo');
          metadata.name = this.#checkStringValue(data, 'name');
          metadata.ticker = this.#checkStringValue(data, 'ticker');
          metadata.url = this.#checkStringValue(data, 'url');

          this.#cache[assetId.toString()] = ret[assetIds.indexOf(assetId)] = metadata;
        } catch (error) {
          this.#logger.error('While evaluating metatada', data, error);
        }
      }
    } catch (error) {
      this.#logger.error(`While fetching metatada for "${assetIdsToRequest}"`, error);
    }

    return ret;
  }
}
