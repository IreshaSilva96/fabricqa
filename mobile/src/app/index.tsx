// Start screen: decides where each user goes.
// Not logged in -> login. Inspector -> inspector home. Supervisor -> supervisor dashboard.
import { Redirect } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';

export default function Index() {
  const { user, profile, loading, signOut } = useAuth();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  if (profile?.role === 'inspector') return <Redirect href="/inspector" />;
  if (profile?.role === 'supervisor') return <Redirect href="/supervisor" />;

  // Logged in, but no valid role document in Firestore
  return (
    <View style={styles.center}>
      <Text style={styles.title}>No FabricQA role</Text>
      <Text style={styles.message}>
        This account isn't set up as a inspector or supervisor. Ask an administrator to assign a role.
      </Text>
      <Pressable style={styles.button} onPress={signOut}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 8 },
  message: { fontSize: 15, color: '#555', textAlign: 'center', marginBottom: 24 },
  button: { backgroundColor: '#1F4E79', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: 'white', fontWeight: '600' },
});
