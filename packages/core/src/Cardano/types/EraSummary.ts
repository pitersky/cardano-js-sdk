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
