import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';
import type { Risk } from '../lib/scoring';
import RiskBar, { RISK_PARTS } from './RiskBar';
import StatusChip, { Tone } from './StatusChip';

type Props = {
  rank?: number;
  title: string;
  subtitle: string;
  risk: Risk;
  status?: { label: string; tone: Tone };
  flag?: string;
  onPress: () => void;
};

function circleTone(total: number) {
  if (total >= 70) return { bg: colors.major, fg: '#FFFFFF' };
  if (total >= 40) return { bg: colors.minor, fg: colors.text };
  return { bg: colors.border, fg: colors.text };
}

export default function RiskCard({ rank, title, subtitle, risk, status, flag, onPress }: Props) {
  const tone = circleTone(risk.total);
  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, risk ${risk.total} of 100`}
    >
      <View style={styles.left}>
        {rank !== undefined && <Text style={styles.rank}>#{rank}</Text>}
        <View style={[styles.circle, { backgroundColor: tone.bg }]}>
          <Text style={[styles.circleText, { color: tone.fg }]}>{risk.total}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>{subtitle}</Text>
        <RiskBar risk={risk} />
        <Text style={styles.legend}>
          {RISK_PARTS.map((p) => `${p.label} +${risk[p.key]}`).join(' · ')}
        </Text>
        {(status || flag) && (
          <View style={styles.chips}>
            {status && <StatusChip label={status.label} tone={status.tone} />}
            {flag && <StatusChip label={flag} tone="warning" />}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderRadius: radius.card,
    padding: 14, borderWidth: 1, borderColor: colors.border,
  },
  left: { width: 46, alignItems: 'center', gap: 2 },
  rank: { fontSize: 12, color: colors.textMuted },
  circle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  circleText: { fontSize: 16, fontWeight: '700' },
  body: { flex: 1, gap: 6 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  legend: { fontSize: 12, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
});
