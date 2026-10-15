// Re-renders whenever the offline queue changes (pending count, failures, syncing).
import { useSyncExternalStore } from 'react';
import { getSnapshot, subscribe } from '../lib/outbox';

export function useSyncStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
