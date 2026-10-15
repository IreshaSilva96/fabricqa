// Roll inspection: start the roll, capture defects along its length, watch the live score, end the roll.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { fetchRolls, Roll } from '../../../lib/data';
import {
  Defect, endRollInspection, fetchDefects, fetchPlan, fetchRollInspection, Plan, RollInspection,
  rollInspectionId, startRollInspection,
} from '../../../lib/inspection';
import { rollScore } from '../../../lib/scoring';
import { ROLL_FAIL_SCORE } from '../../../lib/config';
import { DISPLAY_NAME } from '../../../lib/defects';
import KeyValueList from '../../../components/KeyValueList';
import { dateTimeOf } from '../../../lib/status';
import FactGrid from '../../../components/FactGrid';
import ScoreCard from '../../../components/ScoreCard';
import SeverityBadge from '../../../components/SeverityBadge';
import SyncBanner from '../../../components/SyncBanner';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import { colors, radius } from '../../../constants/theme';

function defectNote(d: Defect): string {
  if (d.aiPending) return 'AI checks it when online';
  if (d.aiLabel === null) return 'classified without AI';
  if (d.falseAlarm) return `false alarm · AI said ${DISPLAY_NAME[d.aiLabel]}`;
  if (d.overridden) return `changed from ${DISPLAY_NAME[d.aiLabel]}`;
  return `AI agreed (${Math.round((d.aiConfidence ?? 0) * 100)}%)`;
}

export default function RollScreen() {
  const { rollNumber, itemId } = useLocalSearchParams<{ rollNumber: string; itemId: string }>();
  const { user, profile } = useAuth();
  const [roll, setRoll] = useState<Roll | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ri, setRi] = useState<RollInspection | null>(null);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending: queued } = useSyncStatus(); // reload when queued changes upload

  const load = useCallback(async () => {
    try {
      setError(null);
      const [r, p] = await Promise.all([fetchRolls(itemId), fetchPlan(itemId)]);
      setRoll(r.data.find((x) => x.rollNumber === rollNumber) ?? null);
      setPlan(p.data);
      if (p.data) {
        const id = rollInspectionId(itemId, p.data.currentRound, rollNumber);
        const found = await fetchRollInspection(id);
        setRi(found.data);
        setDefects(found.data ? (await fetchDefects(id)).data : []);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the roll.');
    } finally {
      setLoading(false);
    }
  }, [rollNumber, itemId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, queued])
  );

  if (loading) return <View style={[styles.screen, styles.center]}><ActivityIndicator /></View>;
  if (!roll || !plan) return <View style={[styles.screen, styles.center]}><Text style={styles.muted}>{error ?? 'Roll not found.'}</Text></View>;

  const isOwner = plan.assigneeId === user?.uid && plan.status === 'in_progress';
  const sampled = plan.currentRolls.includes(rollNumber);
  const inProgress = ri?.status === 'in_progress';
  const ended = ri?.status === 'ended';
  const points = defects.reduce((sum, d) => sum + d.points, 0);
  const liveScore = rollScore(points, ri?.lengthMeters ?? roll.lengthMeters, ri?.widthCm ?? roll.widthCm);

  const start = async () => {
    if (!user || !profile) return;
    setBusy(true);
    try {
      await startRollInspection(plan, roll, { uid: user.uid, name: profile.name });
      await load();
    } catch (e: any) {
      Alert.alert('Could not start the roll', e?.message ?? 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const capture = () => {
    if (!ri) return;
    router.push({
      pathname: '/inspector/capture',
      params: {
        rollInspectionId: ri.id,
        rollNumber: ri.rollNumber,
        fabric: `${ri.fabricType} · ${ri.color}`,
        lengthMeters: String(ri.lengthMeters),
      },
    });
  };

  const end = () => {
    if (!ri) return;
    const real = defects.filter((d) => !d.falseAlarm).length;
    Alert.alert(
      'End roll inspection?',
      `${real} defect${real === 1 ? '' : 's'} · ${points} points · ${liveScore.toFixed(1)} per 100 sq yd → ` +
        `${liveScore > ROLL_FAIL_SCORE ? 'FAIL' : 'PASS'}.\nThe roll is locked after this.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End roll',
          onPress: async () => {
            setBusy(true);
            try {
              await endRollInspection(ri, defects);
              router.back();
            } catch (e: any) {
              Alert.alert('Could not end the roll', e?.message ?? 'Please try again.');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 4 }}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Roll {rollNumber}</Text>
            <View style={styles.roundChip}>
              <Text style={styles.roundText}>Round {plan.currentRound}</Text>
            </View>
          </View>
          <KeyValueList
            rows={[
              { label: 'Item', value: itemId },
              ...(ri
                ? [
                    { label: 'Inspected by', value: ri.inspectorName },
                    { label: 'Started', value: dateTimeOf(ri.startedAt) },
                    { label: 'Ended', value: ri.endedAt ? dateTimeOf(ri.endedAt) : 'In progress' },
                  ]
                : []),
            ]}
          />
        </View>

        <SyncBanner />

        <FactGrid
          columns={4}
          facts={[
            { label: 'Material', value: ri?.fabricType ?? roll.fabricType },
            { label: 'Colour', value: ri?.color ?? roll.color },
            { label: 'Width', value: `${ri?.widthCm ?? roll.widthCm} cm` },
            { label: 'Length', value: `${ri?.lengthMeters ?? roll.lengthMeters} m` },
          ]}
        />

        {!sampled && <Text style={styles.warning}>This roll isn't in the current sample, so it isn't inspected this round.</Text>}
        {sampled && !ri && !isOwner && <Text style={styles.warning}>Only {plan.assigneeName} can start this roll.</Text>}
        {error && <Text style={styles.error}>{error}</Text>}

        {ri && <ScoreCard points={ended ? ri.points : points} score={ended ? ri.score : liveScore} limit={ROLL_FAIL_SCORE} ended={ended} />}

        {ri && (
          <>
            <Text style={styles.section}>DEFECTS FOUND ({defects.filter((d) => !d.falseAlarm).length})</Text>
            {defects.length === 0 && <Text style={styles.muted}>None yet. Capture each defect as you find it along the roll.</Text>}
            {defects.map((d) => (
              <Pressable
                key={d.id}
                style={({ pressed }) => [styles.defectRow, pressed && { opacity: 0.7 }]}
                onPress={() => router.push({ pathname: '/inspector/defect/[defectId]', params: { defectId: d.id } })}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={styles.inline}>
                    <Text style={styles.defectName}>{DISPLAY_NAME[d.finalLabel]}</Text>
                    <SeverityBadge severity={d.severity} />
                  </View>
                  <Text style={styles.muted}>
                    {d.positionMeters !== null ? `at ${d.positionMeters} m · ` : ''}
                    {defectNote(d)}
                    {d.pending ? ' · not uploaded yet' : ''}
                  </Text>
                </View>
                <Text style={styles.points}>{d.points} pt{d.points === 1 ? '' : 's'}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>

      {sampled && !ri && isOwner && (
        <View style={styles.footer}>
          <Pressable style={[styles.primary, busy && styles.disabled]} onPress={start} disabled={busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Start roll inspection</Text>}
          </Pressable>
        </View>
      )}

      {inProgress && isOwner && (
        <View style={styles.footer}>
          <Pressable style={styles.primary} onPress={capture}>
            <Text style={styles.primaryText}>Capture defect</Text>
          </Pressable>
          <Pressable style={[styles.secondary, busy && styles.disabled]} onPress={end} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.secondaryText}>End roll inspection</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, flexShrink: 1 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 },
  roundChip: { backgroundColor: colors.primaryTint, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 12 },
  roundText: { fontSize: 14, fontWeight: '700', color: colors.primary },
  muted: { fontSize: 13, color: colors.textMuted },
  warning: { fontSize: 13, color: colors.warningText },
  error: { color: colors.error },
  section: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, marginTop: 4 },
  defectRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.card,
    padding: 12, borderWidth: 1, borderColor: colors.border, minHeight: 60,
  },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  defectName: { fontSize: 16, fontWeight: '700', color: colors.text },
  points: { fontSize: 14, fontWeight: '700', color: colors.text },
  footer: { padding: 16, paddingBottom: 28, gap: 10, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  primary: { height: 54, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  secondary: {
    height: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  secondaryText: { color: colors.primary, fontSize: 16, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
