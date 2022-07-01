import {
  AcquirePointNotOnChainError,
  AcquirePointTooOldError,
  EraMismatchError,
  IntersectionNotFoundError,
  QueryUnavailableInCurrentEraError,
  ServerNotReady,
  TipIsOriginError,
  UnknownResultError,
  WebSocketClosed
} from '@cardano-ogmios/client';
import { CustomError } from 'ts-custom-error';

export class UnknownCardanoNodeError extends CustomError {
  constructor(public innerError: unknown) {
    super('Unknown CardanoNode error. See "innerError".');
  }
}

export class CardanoNodeNotInitializedError extends CustomError {
  constructor(methodName: string) {
    super(`${methodName} cannot be called until CardanoNode is initialized`);
  }
}

export const CardanoNodeErrors = {
  AcquirePointNotOnChainError,
  AcquirePointTooOldError,
  EraMismatchError,
  IntersectionNotFoundError,
  QueryUnavailableInCurrentEraError,
  ServerNotReady,
  TipIsOriginError,
  UnknownResultError,
  WebSocketClosed
};

type CardanoNodeErrorName = keyof typeof CardanoNodeErrors;
type CardanoNodeErrorClass = typeof CardanoNodeErrors[CardanoNodeErrorName];
export type CardanoNodeError = InstanceType<CardanoNodeErrorClass> | UnknownCardanoNodeError;
