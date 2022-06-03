import { RunnableModule } from '..';
import { TxSubmitConfirmer } from '@cardano-sdk/core';

export class OgmiosTxSubmitConfirmer extends RunnableModule implements TxSubmitConfirmer {
  somthing: unknown;

  protected async initializeImpl(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('ok');
  }

  protected async startImpl(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('ok');
  }

  protected async shutdownImpl(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('ok');
  }
}
