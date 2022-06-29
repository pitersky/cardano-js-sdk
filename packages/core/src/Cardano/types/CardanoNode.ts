// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { CardanoNodeError } from '../../errors';

export interface EraSummary {
  parameters: {
    epochLength: number;
    slotLength: number;
  };
  start: {
    slot: number;
    time: Date;
  };
}

export interface CardanoNode {
  StateQuery: {
    /**
     * Get summaries of all Cardano eras
     *
     * @returns {EraSummary[]} era summaries
     * @throws {CardanoNodeError}
     */
    eraSummaries: () => Promise<EraSummary[]>;
  };
}
