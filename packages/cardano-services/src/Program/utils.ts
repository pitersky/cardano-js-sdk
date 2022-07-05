/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { ClientConfig, Pool, QueryConfig } from 'pg';
import { HttpServerOptions } from './loadHttpServer';
import { InMemoryCache, UNLIMITED_CACHE_TTL } from '../InMemoryCache';
import { InvalidArgsCombination, MissingProgramOption } from './errors';
import { ProgramOptionDescriptions } from './ProgramOptionDescriptions';
import { RabbitMqTxSubmitProvider } from '@cardano-sdk/rabbitmq';
import { ServiceNames } from './ServiceNames';
import { TxSubmitProvider } from '@cardano-sdk/core';
import { ogmiosTxSubmitProvider, urlToConnectionConfig } from '@cardano-sdk/ogmios';
import Logger from 'bunyan';
import dns, { SrvRecord } from 'dns';
import pRetry, { FailedAttemptError } from 'p-retry';

export const SERVICE_DISCOVERY_BACKOFF_FACTOR_DEFAULT = 1.1;
export const SERVICE_DISCOVERY_BACKOFF_MAX_TIMEOUT_DEFAULT = 60 * 1000;
export const DNS_SRV_ADDRESS_CACHE_KEY = 'dns_srv_address_resolution';

export type RetryBackoffConfig = {
  factor?: number;
  maxRetryTime?: number;
};

export const onFailedAttemptFor =
  (operation: string, logger: Logger) =>
  async ({ attemptNumber, message, retriesLeft }: FailedAttemptError) => {
    const nextAction = retriesLeft > 0 ? 'retrying...' : 'exiting';
    logger.trace(message);
    logger.debug(`${operation}: Attempt ${attemptNumber} of ${attemptNumber + retriesLeft}, ${nextAction}`);
    if (retriesLeft === 0) {
      logger.error(message);
      // Invokes onDeath() callback within cardano-services entrypoints, following by server.shutdown() and process.exit(1)
      process.kill(process.pid, 'SIGTERM');
    }
  };

export const getRandomAddressWithDnsSrv = async (serviceName: string) => {
  const [address] = await dns.promises.resolveSrv(serviceName);
  return address;
};

// Get a random selection of dns resolved service address and make it sticky for reconnects by storing a reference in memory
export const getDnsSrvResolveWithExponentialBackoff =
  (config: RetryBackoffConfig, cache: InMemoryCache, logger: Logger) => async (serviceName: string) =>
    await pRetry(
      async () =>
        await cache.get(
          `${DNS_SRV_ADDRESS_CACHE_KEY}/${serviceName}`,
          () => getRandomAddressWithDnsSrv(serviceName),
          UNLIMITED_CACHE_TTL
        ),
      {
        factor: config.factor,
        maxRetryTime: config.maxRetryTime,
        onFailedAttempt: onFailedAttemptFor(`Establishing connection to ${serviceName}`, logger)
      }
    );

export type DnsSrvResolve = ReturnType<typeof getDnsSrvResolveWithExponentialBackoff>;

/**
 * Creates a extended Pool client :
 * - use passed srv service name in order to resolve the port
 * - make dealing with failovers (re-resolving the port) opaque
 * - use exponential backoff retry internally with default timeout and factor
 * - intercept 'query' operation and handle connection errors runtime
 * - all other operations are bind to pool object withoud modifications
 *
 * @returns pg.Pool instance
 */
export const getSrvPool = async (
  dnsSrvResolve: DnsSrvResolve,
  { host, database, password, user }: ClientConfig
): Promise<Pool> => {
  const resolvedAddress = await dnsSrvResolve(host!);
  let pool = new Pool({ database, host, password, port: resolvedAddress.port, user });

  return new Proxy<Pool>({} as Pool, {
    get(_, prop) {
      if (prop === 'then') return;
      if (prop === 'query') {
        return (args: string | QueryConfig, values?: any) =>
          pool.query(args, values).catch(async (error) => {
            if (error.code && ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
              const address = await dnsSrvResolve(host!);
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

export const getPool = async (dnsSrvResolve: DnsSrvResolve, options?: HttpServerOptions): Promise<Pool | undefined> => {
  if (options?.dbConnectionString && options.postgresSrvServiceName)
    throw new InvalidArgsCombination(
      ProgramOptionDescriptions.DbConnection,
      ProgramOptionDescriptions.PostgresSrvServiceName
    );
  if (options?.dbConnectionString) return new Pool({ connectionString: options.dbConnectionString });
  if (options?.postgresSrvServiceName && options?.postgresUser && options.postgresName && options.postgresPassword) {
    return getSrvPool(dnsSrvResolve, {
      database: options.postgresName,
      host: options.postgresSrvServiceName,
      password: options.postgresPassword,
      user: options.postgresUser
    });
  }
  // If db connection string is not passed nor postgres srv service name
  return undefined;
};

export const srvAddressToOgmiosConnectionConfig = ({ name, port }: SrvRecord) => ({ host: name, port });
export const srvAddressToRabbitmqURL = (srvRecord: SrvRecord) => new URL(`amqp://${srvRecord.name}:${srvRecord.port}`);

/**
 * Creates a extended TxSubmitProvider instance :
 * - use passed srv service name in order to resolve the port
 * - make dealing with failovers (re-resolving the port) opaque
 * - use exponential backoff retry internally with default timeout and factor
 * - intercept 'submitTx' operation and handle connection errors runtime
 * - all other operations are bind to pool object withoud modifications
 *
 * @returns TxSubmitProvider instance
 */
export const getSrvOgmiosTxSubmitProvider = async (
  dnsSrvResolve: DnsSrvResolve,
  serviceName: string
): Promise<TxSubmitProvider> => {
  const resolvedAddress = await dnsSrvResolve(serviceName!);
  let ogmiosProvider = ogmiosTxSubmitProvider(srvAddressToOgmiosConnectionConfig(resolvedAddress));

  return new Proxy<TxSubmitProvider>({} as TxSubmitProvider, {
    get(_, prop) {
      if (prop === 'then') return;
      if (prop === 'submitTx') {
        return (args: Uint8Array) =>
          ogmiosProvider.submitTx(args).catch(async (error) => {
            if (error.code && ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
              const address = await dnsSrvResolve(serviceName!);
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
  dnsSrvResolve: DnsSrvResolve,
  options?: HttpServerOptions
): Promise<TxSubmitProvider> => {
  if (options?.ogmiosUrl && options.ogmiosSrvServiceName)
    throw new InvalidArgsCombination(
      ProgramOptionDescriptions.OgmiosUrl,
      ProgramOptionDescriptions.OgmiosSrvServiceName
    );
  if (options?.ogmiosUrl) return ogmiosTxSubmitProvider(urlToConnectionConfig(options?.ogmiosUrl));
  if (options?.ogmiosSrvServiceName) {
    return getSrvOgmiosTxSubmitProvider(dnsSrvResolve, options.ogmiosSrvServiceName);
  }
  throw new MissingProgramOption(ServiceNames.TxSubmit, [
    ProgramOptionDescriptions.OgmiosUrl,
    ProgramOptionDescriptions.OgmiosSrvServiceName
  ]);
};

/**
 * Creates a extended RabbitMqTxSubmitProvider instance :
 * - use passed srv service name in order to resolve the port
 * - make dealing with failovers (re-resolving the port) opaque
 * - use exponential backoff retry internally with default timeout and factor
 * - intercept 'submitTx' operation and handle connection errors runtime
 * - all other operations are bind to pool object withoud modifications
 *
 * @returns RabbitMqTxSubmitProvider instance
 */
export const getSrvRabbitMqTxSubmitProvider = async (
  dnsSrvResolve: DnsSrvResolve,
  serviceName: string
): Promise<RabbitMqTxSubmitProvider> => {
  const resolvedAddress = await dnsSrvResolve(serviceName!);
  let rabbitmqProvider = new RabbitMqTxSubmitProvider({
    rabbitmqUrl: srvAddressToRabbitmqURL(resolvedAddress)
  });

  return new Proxy<RabbitMqTxSubmitProvider>({} as RabbitMqTxSubmitProvider, {
    get(_, prop) {
      if (prop === 'then') return;
      if (prop === 'submitTx') {
        return (args: Uint8Array) =>
          rabbitmqProvider.submitTx(args).catch(async (error) => {
            if (error.code && ['ENOTFOUND', 'ECONNREFUSED'].includes(error.code)) {
              const address = await dnsSrvResolve(serviceName!);
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
  dnsSrvResolve: DnsSrvResolve,
  options?: HttpServerOptions
): Promise<RabbitMqTxSubmitProvider> => {
  if (options?.rabbitmqUrl && options.rabbitmqSrvServiceName)
    throw new InvalidArgsCombination(
      ProgramOptionDescriptions.RabbitMQUrl,
      ProgramOptionDescriptions.RabbitMQSrvServiceName
    );
  if (options?.rabbitmqUrl) return new RabbitMqTxSubmitProvider({ rabbitmqUrl: options.rabbitmqUrl });
  if (options?.rabbitmqSrvServiceName) {
    return getSrvRabbitMqTxSubmitProvider(dnsSrvResolve, options.rabbitmqSrvServiceName);
  }
  throw new MissingProgramOption(ServiceNames.TxSubmit, [
    ProgramOptionDescriptions.RabbitMQUrl,
    ProgramOptionDescriptions.RabbitMQSrvServiceName
  ]);
};
