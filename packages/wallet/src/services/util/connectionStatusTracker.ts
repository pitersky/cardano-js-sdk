import { BehaviorSubject, Observable, distinctUntilChanged, fromEvent, map, merge, shareReplay, startWith } from 'rxjs';

export enum ConnectionStatus {
  down = 0,
  up
}

export type ConnectionStatusTracker = Observable<ConnectionStatus>;

export interface ConnectionStatusTrackerInternals {
  isNodeEnv?: () => boolean;
  online$?: () => Observable<unknown>;
  offline$?: () => Observable<unknown>;
  isOnline?: () => boolean;
}

/**
 * Returns an observable that emits the online status of the browser.
 * When running in Node, it always emits 'up'
 *
 * @returns {ConnectionStatusTracker} ConnectionStatusTracker
 */
export const createSimpleConnectionStatusTracker = ({
  isNodeEnv = () => typeof window === 'undefined',
  online$ = () => fromEvent(window, 'online'),
  offline$ = () => fromEvent(window, 'offline'),
  isOnline = () => navigator.onLine
}: ConnectionStatusTrackerInternals = {}): ConnectionStatusTracker => {
  if (isNodeEnv()) {
    return new BehaviorSubject(ConnectionStatus.up).asObservable();
  }

  return merge(online$(), offline$()).pipe(
    map(() => isOnline()),
    startWith(isOnline()),
    map((onLine) => (onLine ? ConnectionStatus.up : ConnectionStatus.down)),
    distinctUntilChanged(),
    shareReplay(1)
  );
};
