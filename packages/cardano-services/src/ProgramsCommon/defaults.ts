import { Ogmios } from '@cardano-sdk/ogmios';

export const OGMIOS_URL_DEFAULT = (() => {
  const connection = Ogmios.createConnectionObject();
  return connection.address.webSocket;
})();

export const RABBITMQ_URL_DEFAULT = 'amqp://localhost:5672';
