// Tracks whether the phone currently has a working internet connection.
import { useEffect, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    return unsubscribe;
  }, []);

  return online;
}
