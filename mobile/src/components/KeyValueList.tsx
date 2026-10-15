// Custom component: aligned "Label : value" rows, with bold labels of a fixed width.
// Props: rows ([{ label, value }]), labelWidth (default 104).
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

type Props = { rows: { label: string; value: string }[]; labelWidth?: number };

export default function KeyValueList({ rows, labelWidth = 104 }: Props) {
  return (
    <View style={styles.wrap}>
      {rows.map((r) => (
        <View key={r.label} style={styles.row}>
          <Text style={[styles.label, { width: labelWidth }]}>{r.label}</Text>
          <Text style={styles.colon}>:</Text>
          <Text style={styles.value}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 3 },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  label: { fontSize: 14, fontWeight: '700', color: colors.textMuted },
  colon: { fontSize: 14, fontWeight: '700', color: colors.textMuted, width: 14 },
  value: { flex: 1, fontSize: 14, color: colors.text, fontVariant: ['tabular-nums'] },
});
