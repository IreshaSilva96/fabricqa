// Custom component: model confidence as a bar, with a marker at the threshold.
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

type Props = {
  value: number;      // 0-1
  threshold?: number; // 0-1, drawn as a thin marker
};

export default function ConfidenceBar({ value, threshold }: Props) {
  const pct = Math.round(value * 100);
  const below = threshold !== undefined && value < threshold;
  return (
    <View style={styles.wrap} accessibilityLabel={`Model confidence ${pct} percent`}>
      <View style={styles.row}>
        <Text style={styles.label}>Model confidence</Text>
        <Text style={styles.value}>{pct}%</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: below ? colors.minor : colors.primary }]} />
        {threshold !== undefined && <View style={[styles.marker, { left: `${threshold * 100}%` }]} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, color: colors.textMuted },
  value: { fontSize: 14, fontWeight: '600', color: colors.text },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8 },
  marker: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.text },
});
