// Profile screen content, shared by inspectors and supervisors.
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { initialsOf } from './ProfileButton';
import { colors, radius } from '../constants/theme';

const ROLE_NAME = { inspector: 'QA Inspector', supervisor: 'QA Supervisor' } as const;

export default function ProfileView() {
  const { profile, signOut } = useAuth();
  const { pending } = useSyncStatus();

  const confirmSignOut = () =>
    Alert.alert('Sign out?', pending > 0
      ? `${pending} change${pending === 1 ? '' : 's'} haven't uploaded yet. They stay on this phone and upload when you sign back in.`
      : 'You can sign back in at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: signOut },
    ]);

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(profile?.name)}</Text>
        </View>
        <Text style={styles.name}>{profile?.name}</Text>
        <Text style={styles.role}>{profile ? ROLE_NAME[profile.role] : ''}</Text>
      </View>

      <View style={styles.card}>
        <Row label="Email" value={profile?.email ?? ''} />
        <Row label="Waiting to upload" value={String(pending)} />
        <Row label="App" value="FabricQA 1.0" />
      </View>

      <Pressable style={styles.signOut} onPress={confirmSignOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background, padding: 16, gap: 14 },
  card: {
    backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 6,
    borderWidth: 1, borderColor: colors.border, alignItems: 'stretch',
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 6,
  },
  avatarText: { color: colors.primary, fontSize: 26, fontWeight: '700' },
  name: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  role: { fontSize: 15, color: colors.primary, textAlign: 'center' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  rowLabel: { fontSize: 15, color: colors.textMuted },
  rowValue: { fontSize: 15, color: colors.text, flexShrink: 1, textAlign: 'right' },
  signOut: {
    height: 52, borderRadius: radius.button, borderWidth: 1, borderColor: colors.error,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  signOutText: { color: colors.error, fontSize: 16, fontWeight: '600' },
});
