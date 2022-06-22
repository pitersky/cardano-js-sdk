import { Schema } from '@cardano-ogmios/client';
import { TimeSettings } from '@cardano-sdk/core';

export const mapTimeSettings = (eraSummary: Schema.EraSummary, systemStart: Date): TimeSettings => ({
  epochLength: eraSummary.parameters.epochLength,
  fromSlotDate: new Date(systemStart.getTime() + eraSummary.start.time * 1000),
  fromSlotNo: eraSummary.start.slot,
  slotLength: eraSummary.parameters.slotLength
});
