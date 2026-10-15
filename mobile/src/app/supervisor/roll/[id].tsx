// Supervisor's roll history: who inspected it and when, the roll snapshot, its score and every defect.
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Defect, fetchDefects, fetchRollInspection, RollInspection } from '../../../lib/inspection';
import { ROLL_FAIL_SCORE } from '../../../lib/config';
import { DISPLAY_NAME } from '../../../lib/defects';
import { dateTimeOf, rollStatus } from '../../../lib/status';
import { InfoRow, NavRow, Section } from '../../../components/Grouped';
import SeverityBadge from '../../../components/SeverityBadge';
import StatusChip from '../../../components/StatusChip';
import { colors } from '../../../constants/theme';

export default function SupervisorRoll() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [ri, setRi] = useState<RollInspection | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const [r, d] = await Promise.all([fetchRollInspection(id), fetchDefects(id)]);
          setRi(r.data);
          setDefects(d.data);
        } finally {
          setLoading(false);
        }
      })();
    }, [id])
  );

  if (loading) return <View style={[styles.screen, styles.center]}><ActivityIndicator /></View>;
  if (!ri) return <View style={[styles.screen, styles.center]}><Text style={styles.muted}>Roll inspection not found.</Text></View>;

  const status = rollStatus(ri);
  const realDefects = defects.filter((d) => !d.falseAlarm).length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={{ gap: 4 }}>
        <Text style={styles.title}>Roll {ri.rollNumber}</Text>
        <Text style={styles.muted}>Batch {ri.batchNumber} · Item {ri.itemId} · Round {ri.round}</Text>
        <StatusChip label={status.label} tone={status.tone} />
      </View>

      <Section title="INSPECTION">
        <InfoRow label="Inspected by" value={ri.inspectorName} />
        <InfoRow label="Started" value={dateTimeOf(ri.startedAt)} />
        <InfoRow label="Ended" value={ri.endedAt ? dateTimeOf(ri.endedAt) : 'In progress'} />
      </Section>

      <Section title="ROLL">
        <InfoRow label="Material" value={ri.fabricType} />
        <InfoRow label="Colour" value={ri.color} />
        <InfoRow label="Width" value={`${ri.widthCm} cm`} />
        <InfoRow label="Length" value={`${ri.lengthMeters} m`} />
      </Section>

      {ri.status === 'ended' && (
        <Section title="RESULT">
          <InfoRow label="Points" value={String(ri.points)} />
          <InfoRow label="Score per 100 sq yd" value={ri.score.toFixed(1)} />
          <InfoRow label="Fail limit" value={String(ROLL_FAIL_SCORE)} />
        </Section>
      )}

      <Section title={`DEFECTS (${realDefects})`}>
        {defects.length === 0 && (
          <View style={styles.empty}><Text style={styles.muted}>No defects were recorded on this roll.</Text></View>
        )}
        {defects.map((d) => (
          <NavRow
            key={d.id}
            title={`${DISPLAY_NAME[d.finalLabel]} · ${d.points} pt${d.points === 1 ? '' : 's'}`}
            subtitle={
              (d.positionMeters !== null ? `at ${d.positionMeters} m · ` : '') +
              (d.aiLabel === null ? 'no AI' : d.overridden ? `AI said ${DISPLAY_NAME[d.aiLabel]}` : 'AI agreed')
            }
            right={<SeverityBadge severity={d.severity} />}
            onPress={() => router.push({ pathname: '/supervisor/defect/[defectId]', params: { defectId: d.id } })}
          />
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 18 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  empty: { paddingHorizontal: 16, paddingVertical: 14 },
});
