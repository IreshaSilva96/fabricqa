// Item screen: start the item (random sample), see the sampled rolls, end the round.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { fetchItem, fetchRolls, Item } from '../../../lib/data';
import {
  endItemInspection, fetchPlan, fetchRollInspections, Plan, RollInspection, startItemInspection,
} from '../../../lib/inspection';
import { evaluateRound, sampleSize } from '../../../lib/scoring';
import { ROLL_FAIL_SCORE } from '../../../lib/config';
import { itemStatus, rollStatus } from '../../../lib/status';
import TimeRange from '../../../components/TimeRange';
import { useOnline } from '../../../hooks/useOnline';
import FactGrid from '../../../components/FactGrid';
import StatusChip from '../../../components/StatusChip';
import SyncBanner from '../../../components/SyncBanner';
import { useSyncStatus } from '../../../hooks/useSyncStatus';
import { pendingForItem } from '../../../lib/outbox';
import { colors, radius } from '../../../constants/theme';

const RECOMMENDATION_TEXT = {
  accept: 'accept the item',
  escalate: 'escalate to another round',
  reject: 'reject the item',
  decide: 'supervisor decides (round limit reached)',
} as const;

export default function ItemScreen() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { user, profile } = useAuth();
  const online = useOnline();
  const [item, setItem] = useState<Item | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ris, setRis] = useState<Record<string, RollInspection>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { pending: queued } = useSyncStatus(); // reload when queued changes upload

  const load = useCallback(async () => {
    try {
      setError(null);
      const [i, p] = await Promise.all([fetchItem(itemId), fetchPlan(itemId)]);
      setItem(i.data);
      setPlan(p.data);
      if (p.data && p.data.status === 'in_progress') {
        fetchRolls(itemId).catch(() => {}); // keeps the roll details available offline
        const r = await fetchRollInspections(itemId, p.data.currentRound);
        setRis(r.data);
      } else {
        setRis({});
      }
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the item.');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, queued])
  );

  if (loading) return <View style={[styles.screen, styles.center]}><ActivityIndicator /></View>;
  if (!item) return <View style={[styles.screen, styles.center]}><Text style={styles.muted}>{error ?? 'Item not found.'}</Text></View>;

  const isOwner = !!plan && plan.assigneeId === user?.uid;
  const inProgress = plan?.status === 'in_progress';
  const roundRis = plan ? plan.currentRolls.map((r) => ris[r]).filter((r): r is RollInspection => !!r) : [];
  const allEnded = !!plan && roundRis.length === plan.currentRolls.length && roundRis.every((r) => r.status === 'ended');
  const remaining = plan ? plan.currentRolls.length - roundRis.filter((r) => r.status === 'ended').length : 0;
  const currentRound = plan?.rounds.find((r) => r.round === plan.currentRound);
  const status = itemStatus(plan, user?.uid);
  const unsynced = pendingForItem(itemId); // ending the item needs every roll result on the server
  const canEnd = allEnded && online && unsynced === 0 && !busy;

  const start = async () => {
    if (!user || !profile) return;
    setBusy(true);
    try {
      await startItemInspection(item, { uid: user.uid, name: profile.name });
      await load();
    } catch (e: any) {
      Alert.alert('Could not start', e?.message ?? 'Please try again.');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const end = () => {
    if (!plan || !currentRound) return;
    const preview = evaluateRound(
      roundRis.map((r) => ({ passed: r.result === 'pass', score: r.score })),
      plan.currentRound,
      currentRound.kind
    );
    Alert.alert(
      'End item inspection?',
      `${preview.failed} of ${preview.inspected} rolls failed (${Math.round(preview.failRate * 100)}%).\n` +
        `Recommendation for the supervisor: ${RECOMMENDATION_TEXT[preview.recommendation]}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End inspection',
          onPress: async () => {
            setBusy(true);
            try {
              await endItemInspection(plan, roundRis);
              await load();
            } catch (e: any) {
              Alert.alert('Could not end the inspection', e?.message ?? 'Please try again.');
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
          <Text style={styles.title}>{item.fabricType} · {item.color}</Text>
          <Text style={styles.muted}>Item {item.itemId} · Batch {item.batchNumber} · {item.poNumber}</Text>
        </View>

        <FactGrid
          facts={[
            { label: 'Material', value: item.fabricType },
            { label: 'Colour', value: item.color },
            { label: 'Width', value: `${item.widthCm} cm` },
            { label: 'Rolls', value: String(item.rollCount) },
            { label: 'Sample (10%)', value: `${sampleSize(item.rollCount)} rolls` },
            { label: 'Fail limit', value: `${ROLL_FAIL_SCORE} pts` },
          ]}
        />

        <StatusChip label={status.label} tone={status.tone} />
        <SyncBanner />
        {error && <Text style={styles.error}>{error}</Text>}

        {!plan && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Not started</Text>
            <Text style={styles.muted}>
              Starting picks {sampleSize(item.rollCount)} rolls at random for round 1 and makes you this item's inspector.
            </Text>
            {!online && <Text style={styles.warning}>You need to be online to start, so the sample is saved for everyone.</Text>}
          </View>
        )}

        {inProgress && plan && (
          <>
            <Text style={styles.section}>
              ROUND {plan.currentRound} · {currentRound?.kind === 'full' ? '100% CHECK' : 'RANDOM SAMPLE'}
            </Text>
            <TimeRange start={currentRound?.startedAt ?? null} end={null} />
            {!isOwner && (
              <Text style={styles.warning}>{plan.assigneeName} is inspecting this item. You can view it but not change it.</Text>
            )}
            {plan.currentRolls.map((rollNumber) => {
              const ri = ris[rollNumber];
              const s = rollStatus(ri);
              return (
                <Pressable
                  key={rollNumber}
                  style={({ pressed }) => [styles.rollCard, pressed && { opacity: 0.7 }]}
                  onPress={() =>
                    router.push({ pathname: '/inspector/roll/[rollNumber]', params: { rollNumber, itemId: plan.itemId } })
                  }
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={styles.rowBetween}>
                      <Text style={styles.rollTitle}>{rollNumber}</Text>
                      <StatusChip label={s.label} tone={s.tone} />
                    </View>
                    {ri ? (
                      <>
                        <TimeRange start={ri.startedAt} end={ri.endedAt} compact />
                        <Text style={styles.muted}>
                          {ri.defectCount} defect{ri.defectCount === 1 ? '' : 's'}
                          {ri.pending ? ' · not uploaded yet' : ''}
                        </Text>
                      </>
                    ) : (
                      <Text style={styles.muted}>Tap to start</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </>
        )}

        {plan?.status === 'waiting' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Waiting for the supervisor</Text>
            <Text style={styles.muted}>
              Round {plan.currentRound} ended. The supervisor will decide what happens next. If more rolls are needed,
              this item will appear under "Assigned to you".
            </Text>
          </View>
        )}

        {(plan?.status === 'accepted' || plan?.status === 'rejected') && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{plan.status === 'accepted' ? 'Accepted' : 'Rejected'}</Text>
            <Text style={styles.muted}>Decided by {plan.decision?.decidedBy}. No further inspection needed.</Text>
          </View>
        )}
      </ScrollView>

      {!plan && (
        <View style={styles.footer}>
          <Pressable style={[styles.primary, (!online || busy) && styles.disabled]} onPress={start} disabled={!online || busy}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Start item inspection</Text>}
          </Pressable>
        </View>
      )}

      {inProgress && isOwner && (
        <View style={styles.footer}>
          {!allEnded && <Text style={styles.footerNote}>{remaining} sampled roll{remaining === 1 ? '' : 's'} still to inspect</Text>}
          {allEnded && !online && <Text style={styles.footerNote}>Go online to end the item inspection</Text>}
          {allEnded && online && unsynced > 0 && (
            <Text style={styles.footerNote}>Uploading {unsynced} change{unsynced === 1 ? '' : 's'} first…</Text>
          )}
          <Pressable style={[styles.primary, !canEnd && styles.disabled]} onPress={end} disabled={!canEnd}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>End item inspection</Text>}
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
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  warning: { fontSize: 13, color: colors.warningText },
  error: { color: colors.error },
  section: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  rollCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.card,
    padding: 14, borderWidth: 1, borderColor: colors.border, minHeight: 60,
  },
  rollTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  footer: { padding: 16, paddingBottom: 28, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  footerNote: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  primary: { height: 54, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 17, fontWeight: '600' },
  disabled: { opacity: 0.45 },
});
