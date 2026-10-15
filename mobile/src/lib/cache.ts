// Read-through cache for master data (constraint design: intermittent connectivity).
// Online: fetch from Firestore and save a copy on the phone.
// Offline, or if the fetch fails or is too slow: return the saved copy instead.
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

const TIMEOUT_MS = 8000;

export type Cached<T> = { data: T; fromCache: boolean; savedAt: number | null };

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), TIMEOUT_MS)),
  ]);
}

export async function cached<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
  const net = await NetInfo.fetch();
  const online = !!net.isConnected && net.isInternetReachable !== false;

  if (online) {
    try {
      const data = await withTimeout(fetcher());
      const savedAt = Date.now();
      await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({ data, savedAt }));
      return { data, fromCache: false, savedAt };
    } catch {
      // fall through to the saved copy
    }
  }

  const raw = await AsyncStorage.getItem(`cache:${key}`);
  if (!raw) throw new Error('No connection and no saved data yet.');
  const saved = JSON.parse(raw) as { data: T; savedAt: number };
  return { data: saved.data, fromCache: true, savedAt: saved.savedAt };
}

// Keep the saved copy in step with changes that were just uploaded, so the
// app still shows them correctly if the connection drops before the next refresh.
export async function setCached<T>(key: string, data: T): Promise<void> {
  await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({ data, savedAt: Date.now() }));
}

export async function updateCached<T>(key: string, update: (current: T) => T): Promise<void> {
  const raw = await AsyncStorage.getItem(`cache:${key}`);
  if (!raw) return;
  const saved = JSON.parse(raw) as { data: T; savedAt: number };
  await AsyncStorage.setItem(`cache:${key}`, JSON.stringify({ data: update(saved.data), savedAt: saved.savedAt }));
}
