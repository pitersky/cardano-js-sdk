/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClientConfig, Pool, QueryConfig } from 'pg';
import { HttpServerOptions } from './loadHttpServer';
import { InvalidArgsCombination, MissingProgramOption } from './errors';
import { ProgramOptionDescriptions } from './ProgramOptionDescriptions';
import { RabbitMqTxSubmitProvider } from '@cardano-sdk/rabbitmq';
import { ServiceNames } from './ServiceNames';
import { TxSubmitProvider } from '@cardano-sdk/core';
import { ogmiosTxSubmitProvider, urlToConnectionConfig } from '@cardano-sdk/ogmios';
import Logger from 'bunyan';
import dns, { SrvRecord } from 'dns';
import pRetry, { FailedAttemptError } from 'p-retry';

export const RETRY_BACKOFF_FACTOR_DEFAULT = 1.1;
export const RETRY_BACKOFF_MAX_TIMEOUT_DEFAULT = 60 * 1000;

type RetryBackoffConfig = {
  factor: number;
  maxRetryTime: number;
};

export const onFailedAttemptFor =
  (operation: string, logger: Logger) =>
  async ({ attemptNumber, message, retriesLeft }: FailedAttemptError) => {
    const nextAction = retriesLeft > 0 ? 'retrying...' : 'exiting';
    logger.trace(message);
    logger.debug(`${operation}: Attempt ${attemptNumber} of ${attemptNumber + retriesLeft}, ${nextAction}`);
    if (retriesLeft === 0) {
      logger.error(message);
      // await server.shutdown(); ?
      // eslint-disable-next-line unicorn/no-process-exit
      process.exit(1);
    }
  };

export const resolveDnsSrvWithExponentialBackoff = async (
  serviceName: string,
  { factor, maxRetryTime }: RetryBackoffConfig,
  logger: Logger
) =>
  await pRetry(
    async () => {
      // Shall we grab the first one always?
      const [record] = await dns.promises.resolveSrv(serviceName);
      return record;
    },
    {
      factor,
      maxRetryTime,
      onFailedAttempt: onFailedAttemptFor(`Establishing connection to ${serviceName}`, logger)
    }
  );

export const getSrvPool = async (
  { host, database, password, user }: ClientConfig,
  retryConfig: RetryBackoffConfig,
  logger: Logger
): Promise<Pool> => {
  const srvRecord = await resolveDnsSrvWithExponentialBackoff(host!, retryConfig, logger);
  let pool: Pool = new Pool({ database, host, password, port: srvRecord.port, user });

  return new Proxy<Pool>({} as Pool, {
    get(_, prop) {
      if (prop === 'then') return;
      if (prop === 'query') {
        return (args: string | QueryConfig, values?: any) =>
          pool.query(args, values).catch(async (error) => {
            if (error.code && ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
              const address = await resolveDnsSrvWithExponentialBackoff(host!, retryConfig, logger);
              pool = new Pool({ database, host, password, port: address.port, user });
              return await pool.query(args, values);
            }
          });
      }
      // Bind if it is a function, no intercept operations
      if (typeof pool[prop as keyof Pool] === 'function') {
        const method = pool[prop as keyof Pool] as any;
        return method.bind(pool);
      }
    }
  });
};

export const getPool = async (logger: Logger, options?: HttpServerOptions): Promise<Pool | undefined> => {
  if (options?.dbConnectionString && options.postgresSrvServiceName)
    throw new InvalidArgsCombination(
      ProgramOptionDescriptions.DbConnection,
      ProgramOptionDescriptions.PostgresSrvServiceName
    );
  if (options?.dbConnectionString) return new Pool({ connectionString: options.dbConnectionString });
  // TODO: optimize passed options -> 'options' is required by default, no need to check it .? everywhere
  if (options?.postgresSrvServiceName && options?.postgresUser && options.postgresName && options.postgresPassword) {
    return getSrvPool(
      {
        database: options.postgresName,
        host: options.postgresSrvServiceName,
        password: options.postgresPassword,
        user: options.postgresUser
      },
      { factor: options.serviceDiscoveryBackoffFactor, maxRetryTime: options.serviceDiscoveryTimeout },
      logger
    );
  }
  // If db connection string nor srv db credentials are being passed
  return undefined;
};

export const getSrvOgmiosTxSubmitProvider = async (
  serviceName: string,
  retryConfig: RetryBackoffConfig,
  logger: Logger
): Promise<TxSubmitProvider> => {
  const srvRecord = await resolveDnsSrvWithExponentialBackoff(serviceName!, retryConfig, logger);
  let ogmiosProvider: TxSubmitProvider = ogmiosTxSubmitProvider(srvRecord);

  return new Proxy<TxSubmitProvider>({} as TxSubmitProvider, {
    get(_, prop) {
      if (prop === 'then') return;
      if (prop === 'submitTx') {
        return (args: Uint8Array) =>
          ogmiosProvider.submitTx(args).catch(async (error) => {
            if (error.code && ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
              const address = await resolveDnsSrvWithExponentialBackoff(serviceName!, retryConfig, logger);
              ogmiosProvider = ogmiosTxSubmitProvider(address);
              return await ogmiosProvider.submitTx(args);
            }
          });
      }
      // Bind if it is a function, no intercept operations
      if (typeof ogmiosProvider[prop as keyof TxSubmitProvider] === 'function') {
        const method = ogmiosProvider[prop as keyof TxSubmitProvider] as any;
        return method.bind(ogmiosProvider);
      }
    }
  });
};

export const getCardanoNodeProvider = async (
  logger: Logger,
  options?: HttpServerOptions
): Promise<TxSubmitProvider> => {
  if (options?.ogmiosUrl && options.ogmiosSrvServiceName)
    throw new InvalidArgsCombination(
      ProgramOptionDescriptions.OgmiosUrl,
      ProgramOptionDescriptions.OgmiosSrvServiceName
    );
  if (options?.ogmiosUrl) return ogmiosTxSubmitProvider(urlToConnectionConfig(options?.ogmiosUrl));
  if (options?.ogmiosSrvServiceName) {
    return getSrvOgmiosTxSubmitProvider(
      options.ogmiosSrvServiceName,
      { factor: options.serviceDiscoveryBackoffFactor, maxRetryTime: options.serviceDiscoveryTimeout },
      logger
    );
  }
  throw new MissingProgramOption(ServiceNames.TxSubmit, [
    ProgramOptionDescriptions.OgmiosUrl,
    ProgramOptionDescriptions.OgmiosSrvServiceName
  ]);
};

export const srvAddressToRabbitmqURL = (srvRecord: SrvRecord) => new URL(`amqp://${srvRecord.name}:${srvRecord.port}`);

export const getSrvRabbitMqTxSubmitProvider = async (
  serviceName: string,
  retryConfig: RetryBackoffConfig,
  logger: Logger
): Promise<RabbitMqTxSubmitProvider> => {
  const srvRecord = await resolveDnsSrvWithExponentialBackoff(serviceName!, retryConfig, logger);
  let rabbitmqProvider: RabbitMqTxSubmitProvider = new RabbitMqTxSubmitProvider({
    rabbitmqUrl: srvAddressToRabbitmqURL(srvRecord)
  });

  return new Proxy<RabbitMqTxSubmitProvider>({} as RabbitMqTxSubmitProvider, {
    get(_, prop) {
      if (prop === 'then') return;
      if (prop === 'submitTx') {
        return (args: Uint8Array) =>
          rabbitmqProvider.submitTx(args).catch(async (error) => {
            if (error.code && ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
              const address = await resolveDnsSrvWithExponentialBackoff(serviceName!, retryConfig, logger);
              rabbitmqProvider = new RabbitMqTxSubmitProvider({ rabbitmqUrl: srvAddressToRabbitmqURL(address) });
              return await rabbitmqProvider.submitTx(args);
            }
          });
      }
      // Bind if it is a function, no intercept operations
      if (typeof rabbitmqProvider[prop as keyof RabbitMqTxSubmitProvider] === 'function') {
        const method = rabbitmqProvider[prop as keyof RabbitMqTxSubmitProvider] as any;
        return method.bind(rabbitmqProvider);
      }
    }
  });
};

export const getRabbitMqTxSubmitProvider = async (
  logger: Logger,
  options?: HttpServerOptions
): Promise<RabbitMqTxSubmitProvider> => {
  if (options?.rabbitmqUrl && options.rabbitmqSrvServiceName)
    throw new InvalidArgsCombination(
      ProgramOptionDescriptions.RabbitMQUrl,
      ProgramOptionDescriptions.RabbitMQSrvServiceName
    );
  if (options?.rabbitmqUrl) return new RabbitMqTxSubmitProvider({ rabbitmqUrl: options.rabbitmqUrl });
  if (options?.rabbitmqSrvServiceName) {
    return getSrvRabbitMqTxSubmitProvider(
      options.rabbitmqSrvServiceName,
      { factor: options.serviceDiscoveryBackoffFactor, maxRetryTime: options.serviceDiscoveryTimeout },
      logger
    );
  }
  throw new MissingProgramOption(ServiceNames.TxSubmit, [
    ProgramOptionDescriptions.RabbitMQUrl,
    ProgramOptionDescriptions.RabbitMQSrvServiceName
  ]);
};
