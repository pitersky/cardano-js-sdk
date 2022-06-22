import { TimeSettings } from '../../util';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { Provider, ProviderError } from '../..';

export interface TimeSettingsProvider extends Provider {
  /**
   * Get blockchain time settings
   *
   * @returns {TimeSettings} time settings
   * @throws {ProviderError}
   */
  timeSettings: () => Promise<TimeSettings[]>;
}
