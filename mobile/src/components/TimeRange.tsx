// Custom component: start and end date-time on separate, labelled lines.
// Props: start (ms), end (ms or null = still in progress), compact (smaller text for list rows).
import { StyleSheet, Text, View } from 'react-native';
import { dateTimeOf } from '../lib/status';
import { colors } from '../constants/theme';

type Props = { start: number | null; end: number | null; compact?: boolean };

export default function TimeRange({ start, end, compact = false }: Props) {
  const size = compact ? 12 : 13;
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <Text style={[styles.label, { fontSize: size }]}>Started</Text>
        <Text style={[styles.value, { fontSize: size }]}>{dateTimeOf(start)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.label, { fontSize: size }]}>Ended</Text>
        <Text style={[styles.value, { fontSize: size }]}>
          {end ? dateTimeOf(end) : 'In progress'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 2 },
  row: { flexDirection: 'row', gap: 8 },
  label: { width: 56, color: colors.textMuted },
  value: { color: colors.text, fontVariant: ['tabular-nums'] },
});
