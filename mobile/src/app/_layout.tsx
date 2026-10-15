// Root navigation. Stack.Protected hides whole sections of the app unless the
// condition (guard) is true, so an inspector can never open supervisor screens and vice versa.
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { AuthProvider, useAuth } from '../lib/auth';
import { startOutbox } from '../lib/outbox';

function RootNavigator() {
  const { user, profile } = useAuth();
  const role = profile?.role;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />

      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>

      <Stack.Protected guard={!!user && role === 'inspector'}>
        <Stack.Screen name="inspector" />
      </Stack.Protected>

      <Stack.Protected guard={!!user && role === 'supervisor'}>
        <Stack.Screen name="supervisor" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  // Load the offline queue and start uploading whenever there is a connection
  useEffect(() => {
    startOutbox();
  }, []);

  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
