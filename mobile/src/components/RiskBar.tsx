// Custom component: the risk score split into its three parts as one segmented bar.
// Props: risk ({ total, quality, spread, urgency }).
import { StyleSheet, View } from 'react-native';
import type { Risk } from '../lib/scoring';
import { colors } from '../constants/theme';

export const RISK_PARTS = [
  { key: 'quality', label: 'Fabric quality', color: colors.major },
  { key: 'spread', label: 'Failed rolls', color: colors.minor },
  { key: 'urgency', label: 'Deadline urgency', color: colors.primary },
] as const;

export default function RiskBar({ risk }: { risk: Risk }) {
  return (
    <View style={styles.track} accessibilityLabel={`Risk ${risk.total} of 100`}>
      {RISK_PARTS.map((p) => (
        <View key={p.key} style={{ width: `${risk[p.key]}%`, backgroundColor: p.color }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.border },
});
