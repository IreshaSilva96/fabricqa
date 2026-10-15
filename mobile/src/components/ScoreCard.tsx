// Custom component: the roll's live 4-point score against the fail limit.
// Props: points (total), score (points per 100 sq yd), limit (fail threshold), ended (final result or live).
import { StyleSheet, Text, View } from 'react-native';
import StatusChip from './StatusChip';
import { colors, radius } from '../constants/theme';

type Props = { points: number; score: number; limit: number; ended?: boolean };

export default function ScoreCard({ points, score, limit, ended = false }: Props) {
  const failing = score > limit;
  const pct = Math.min(100, (score / limit) * 100);
  const label = ended ? (failing ? 'FAIL' : 'PASS') : failing ? 'OVER THE LIMIT' : 'PASSING SO FAR';
  return (
    <View style={styles.card} accessibilityLabel={`Score ${score} points per 100 square yards, limit ${limit}`}>
      <View style={styles.row}>
        <Text style={styles.muted}>{ended ? 'Final score' : 'Score so far'}</Text>
        <StatusChip label={label} tone={failing ? 'fail' : 'pass'} />
      </View>
      <View style={styles.scoreRow}>
        <Text style={styles.score}>{score.toFixed(1)}</Text>
        <Text style={styles.muted}>points per 100 sq yd · limit {limit}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: failing ? colors.major : colors.primary }]} />
      </View>
      <Text style={styles.muted}>{points} point{points === 1 ? '' : 's'} · major 4, minor 1, false alarm 0</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, padding: 14, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  score: { fontSize: 30, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.border, overflow: 'hidden' },
  fill: { height: 8 },
});
