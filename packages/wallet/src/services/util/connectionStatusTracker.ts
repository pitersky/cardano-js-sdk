import {
  BehaviorSubject,
  Observable,
  distinctUntilChanged,
  fromEvent,
  map,
  merge,
  of,
  shareReplay,
  startWith
} from 'rxjs';

export enum ConnectionStatus {
  down = 0,
  up
}

export type ConnectionStatusTracker = Observable<ConnectionStatus>;

export interface ConnectionStatusTrackerInternals {
  isNodeEnv?: boolean;
  online$?: Observable<unknown>;
  offline$?: Observable<unknown>;
  initialStatus?: boolean;
}

/**
 * Returns an observable that emits the online status of the browser.
 * When running in Node, it always emits 'up'
 *
 * @returns {ConnectionStatusTracker} ConnectionStatusTracker
 */
export const createSimpleConnectionStatusTracker = ({
  isNodeEnv = typeof window === 'undefined',
  online$ = isNodeEnv ? of(true) : fromEvent(window, 'online'),
  offline$ = isNodeEnv ? of(false) : fromEvent(window, 'offline'),
  initialStatus = isNodeEnv ? true : navigator.onLine
}: ConnectionStatusTrackerInternals = {}): ConnectionStatusTracker => {
  if (isNodeEnv) {
    return new BehaviorSubject(ConnectionStatus.up).asObservable();
  }

  return merge(online$.pipe(map(() => true)), offline$.pipe(map(() => false))).pipe(
    startWith(initialStatus),
    map((onLine) => (onLine ? ConnectionStatus.up : ConnectionStatus.down)),
    distinctUntilChanged(),
    shareReplay(1)
  );
};
