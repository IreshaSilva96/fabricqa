// Custom component: shows the connection and upload state of the offline queue.
// No props: it listens to the queue and the network itself. Tapping a failure explains it.
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useOnline } from '../hooks/useOnline';
import { useSyncStatus } from '../hooks/useSyncStatus';
import { discardFailed, failedOps, retryFailed } from '../lib/outbox';
import { colors } from '../constants/theme';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default function SyncBanner() {
  const online = useOnline();
  const { pending, failed, syncing } = useSyncStatus();

  if (failed > 0) {
    const explain = () =>
      Alert.alert(
        `${plural(failed, 'change')} couldn't upload`,
        `The server refused ${failed === 1 ? 'it' : 'them'}, usually because the item was reassigned or already ended on another phone.\n\n` +
          failedOps().map((f) => `• ${f.op.kind} (${f.op.itemId}): ${f.error}`).join('\n'),
        [
          { text: 'Discard', style: 'destructive', onPress: () => discardFailed() },
          { text: 'Try again', onPress: () => retryFailed() },
        ]
      );
    return (
      <Pressable style={[styles.banner, styles.error]} onPress={explain} accessibilityRole="button">
        <Text style={[styles.text, { color: colors.error }]}>{plural(failed, 'change')} couldn't upload · tap for details</Text>
      </Pressable>
    );
  }

  if (!online) {
    return (
      <View style={[styles.banner, styles.warning]}>
        <Text style={[styles.text, { color: colors.warningText }]}>
          Offline · {pending > 0 ? `${plural(pending, 'change')} saved on this phone` : 'showing saved data'}
        </Text>
      </View>
    );
  }

  if (pending > 0) {
    return (
      <View style={[styles.banner, styles.info]}>
        <Text style={[styles.text, { color: colors.primary }]}>
          {syncing ? 'Uploading' : 'Waiting to upload'} {plural(pending, 'change')}…
        </Text>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12 },
  warning: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  info: { backgroundColor: colors.primaryTint, borderColor: '#A9BED6' },
  error: { backgroundColor: '#FDECEA', borderColor: colors.error },
  text: { fontWeight: '600', fontSize: 14 },
});
