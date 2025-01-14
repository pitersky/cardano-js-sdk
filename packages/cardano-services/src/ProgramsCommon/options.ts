import { LogLevel } from 'bunyan';

/**
 * Common options for programs:
 * - HTTP server
 * - RabbitMQ worker
 */
export interface CommonProgramOptions {
  loggerMinSeverity?: LogLevel;
  ogmiosUrl?: URL;
  rabbitmqUrl?: URL;
}
