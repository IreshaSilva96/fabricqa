// Item review: the app's recommendation, every round and roll (with inspectors), and the four decisions.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { fetchItem, Item } from '../../../lib/data';
import { Defect, fetchPlan, Person, Plan, RollInspection } from '../../../lib/inspection';
import {
  Action, decide, fetchInspectors, fetchItemDefects, fetchItemRollInspections, latestRound, planRisk, planStats,
} from '../../../lib/supervisor';
import { ESCALATION_FAIL_RATE, RISK_URGENCY, RISK_WEIGHTS, ROLL_FAIL_SCORE } from '../../../lib/config';
import { sampleSize } from '../../../lib/scoring';
import { dateOf, dateTimeOf, itemStatus, rollStatus } from '../../../lib/status';
import { useOnline } from '../../../hooks/useOnline';
import { InfoRow, NavRow, Section } from '../../../components/Grouped';
import RiskBar from '../../../components/RiskBar';
import FactGrid from '../../../components/FactGrid';
import StatusChip from '../../../components/StatusChip';
import DecisionSheet from '../../../components/DecisionSheet';
import { colors, radius } from '../../../constants/theme';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function ItemReview() {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { user, profile } = useAuth();
  const online = useOnline();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [ris, setRis] = useState<RollInspection[]>([]);
  const [defects, setDefects] = useState<Defect[]>([]);
  const [inspectors, setInspectors] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, i, r, d, people] = await Promise.all([
        fetchPlan(itemId), fetchItem(itemId), fetchItemRollInspections(itemId), fetchItemDefects(itemId), fetchInspectors(),
      ]);
      setPlan(p.data);
      setItem(i.data);
      setRis(r.data);
      setDefects(d.data);
      setInspectors(people.data);
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) return <View style={[styles.screen, styles.center]}><ActivityIndicator /></View>;
  if (!plan || !item) return <View style={[styles.screen, styles.center]}><Text style={styles.muted}>Not inspected yet.</Text></View>;

  const latest = latestRound(plan);
  const ev = latest?.evaluation;
  const rec = latest?.recommendation ?? null;
  const waiting = plan.status === 'waiting';
  const ended = ris.filter((r) => r.status === 'ended');
  const realDefects = defects.filter((d) => !d.falseAlarm);
  const remaining = item.rollCount - plan.inspectedRolls.length;
  const risk = planRisk(plan, item.deadline);
  const stats = planStats(plan, item.deadline);
  const failedRolls = ended.filter((r) => r.result === 'fail').length;
  const dueText = item.deadline
    ? `${item.poNumber} is due ${dateOf(item.deadline)} (${
        (stats.daysToDeadline ?? 0) <= 0 ? 'today or overdue' : `in ${stats.daysToDeadline} day${stats.daysToDeadline === 1 ? '' : 's'}`
      })`
    : `${item.poNumber} has no due date`;
  const status = itemStatus(plan);

  const recommendationText = () => {
    if (!ev || !rec) return null;
    const why = `${ev.failed} of ${ev.inspected} rolls failed in round ${latest!.round} (${pct(ev.failRate)}). The limit is ${pct(ESCALATION_FAIL_RATE)}.`;
    switch (rec) {
      case 'escalate': return { title: `Escalate to round ${plan.currentRound + 1}`, why };
      case 'accept': return { title: 'Accept the item', why };
      case 'reject': return { title: 'Reject the item', why };
      case 'decide': return { title: 'Round limit reached: your decision', why: `${why} Choose accept, reject or a 100% check.` };
    }
  };
  const recText = recommendationText();
  const recommendedAction: Action | null = rec === 'escalate' ? 'escalate' : rec === 'accept' ? 'accept' : rec === 'reject' ? 'reject' : null;

  const confirm = async ({ assignee, note }: { assignee?: Person; note: string }) => {
    if (!action || !user || !profile) return;
    setBusy(true);
    try {
      await decide(plan, action, { uid: user.uid, name: profile.name }, { assignee, note, rollCount: item.rollCount });
      setAction(null);
      await load();
    } catch (e: any) {
      Alert.alert('Could not save the decision', e?.message ?? 'Please try again.');
      setAction(null);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const decisionButton = (a: Action, label: string) => {
    const recommended = a === recommendedAction;
    const disabled = !online || ((a === 'escalate' || a === 'full') && remaining <= 0);
    return (
      <Pressable
        key={a}
        style={[recommended ? styles.primary : styles.secondary, a === 'reject' && !recommended && styles.rejectBorder, disabled && styles.disabled]}
        onPress={() => setAction(a)}
        disabled={disabled}
      >
        <Text style={[recommended ? styles.primaryText : styles.secondaryText, a === 'reject' && !recommended && { color: colors.major }]}>
          {label}
        </Text>
      </Pressable>
    );
  };

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={{ gap: 4 }}>
          <Text style={styles.title}>{item.fabricType} · {item.color}</Text>
          <Text style={styles.muted}>Batch {item.batchNumber} · Item {item.itemId} · {item.poNumber}</Text>
          <StatusChip label={status.label} tone={status.tone} />
        </View>

        {waiting && recText && (
          <View style={styles.strip}>
            <Text style={styles.stripTitle}>RECOMMENDED · {recText.title}</Text>
            <Text style={styles.stripText}>{recText.why}</Text>
          </View>
        )}

        {plan.decision && (
          <Section title="DECISION">
            <InfoRow
              label="Outcome"
              value={<StatusChip label={plan.decision.outcome.toUpperCase()} tone={plan.decision.outcome === 'accepted' ? 'pass' : 'fail'} />}
            />
            <InfoRow label="Decided by" value={plan.decision.decidedBy} />
            <InfoRow label="Decided at" value={dateTimeOf(plan.decision.decidedAt)} />
            {!!plan.decision.note && <InfoRow label="Note" value={plan.decision.note} />}
          </Section>
        )}

        <FactGrid
          columns={3}
          facts={[
            {
              label: 'Rolls inspected', value: `${ended.length} of ${item.rollCount}`,
            },
            {
              label: 'Failed', value: String(failedRolls),
              help: `A roll fails when its score is above ${ROLL_FAIL_SCORE} points per 100 sq yd (4-point system: major 4, minor 1, false alarm 0).`,
            },
            {
              label: 'Defects', value: String(realDefects.length),
            },
            {
              label: 'AI suggestion changed', value: String(defects.filter((d) => d.overridden).length),
            },
            {
              label: 'Width', value: `${item.widthCm} cm`,
            },
            {
              label: 'PO due', value: item.deadline ? dateOf(item.deadline) : '—',
            },
          ]}
        />

        <View style={styles.riskCard}>
          <View style={styles.riskHeader}>
            <Text style={styles.section}>RISK</Text>
            <Text style={styles.riskTotal}>{risk.total} / 100</Text>
          </View>
          <View style={styles.hairline} />
          <View style={styles.barWrap}>
            <RiskBar risk={risk} />
          </View>
          <FactGrid
            bare
            valueFirst
            columns={4}
            facts={[
              {
                label: 'Risk score', value: `${risk.total}/100`,
                help: `Ranks items for your attention on the dashboard. It adds three parts: fabric quality (up to ${RISK_WEIGHTS.quality}), failed rolls (up to ${RISK_WEIGHTS.spread}) and deadline urgency (up to ${RISK_URGENCY[0].points}). Higher means act first.`,
              },
              {
                label: 'Fabric quality', value: `+${risk.quality}`,
                help: `${RISK_WEIGHTS.quality} × average roll score ÷ ${ROLL_FAIL_SCORE}-point limit, capped at ${RISK_WEIGHTS.quality}. This item's inspected rolls average ${stats.avgScore} points per 100 sq yd, so +${risk.quality}.`,
              },
              {
                label: 'Failed rolls', value: `+${risk.spread}`,
                help: `${RISK_WEIGHTS.spread} × share of inspected rolls that failed. ${stats.failed} of ${stats.inspected} evaluated rolls failed, so +${risk.spread}.`,
              },
              {
                label: 'Deadline urgency', value: `+${risk.urgency}`,
                help: `Based on the PO due date: ${RISK_URGENCY.map((u) => `+${u.points} if due within ${u.withinDays} day${u.withinDays === 1 ? '' : 's'}`).join(', ')}, otherwise 0. ${dueText}, so +${risk.urgency}.`,
              },
            ]}
          />
        </View>

        {[...plan.rounds].reverse().map((round) => (
          <Section
            key={round.round}
            title={`ROUND ${round.round} · ${round.kind === 'full' ? '100% CHECK' : 'RANDOM SAMPLE'} · ${round.rolls.length} ROLLS`}
          >
            <View style={styles.roundInfo}>
              <View style={styles.roundRow}>
                <View style={styles.roundCell}>
                  <Text style={styles.roundLabel}>Inspector</Text>
                  <Text style={styles.roundValue}>{round.assigneeName}</Text>
                </View>
                <View style={styles.roundCell}>
                  <Text style={styles.roundLabel}>Started</Text>
                  <Text style={styles.roundValue}>{dateTimeOf(round.startedAt)}</Text>
                </View>
              </View>
              <View style={styles.roundRow}>
                <View style={styles.roundCell}>
                  <Text style={styles.roundLabel}>Result</Text>
                  <Text style={styles.roundValue}>
                    {round.evaluation
                      ? `${round.evaluation.failed} of ${round.evaluation.inspected} failed · ${round.evaluation.avgScore ?? '—'} avg`
                      : 'In progress'}
                  </Text>
                </View>
                <View style={styles.roundCell}>
                  <Text style={styles.roundLabel}>Ended</Text>
                  <Text style={styles.roundValue}>{round.endedAt ? dateTimeOf(round.endedAt) : 'In progress'}</Text>
                </View>
              </View>
              {round.assignedBy && (
                <View style={styles.roundRow}>
                  <View style={styles.roundCell}>
                    <Text style={styles.roundLabel}>Assigned by</Text>
                    <Text style={styles.roundValue}>{round.assignedBy}</Text>
                  </View>
                </View>
              )}
            </View>
            {round.rolls.map((rollNumber) => {
              const ri = ris.find((r) => r.round === round.round && r.rollNumber === rollNumber);
              const st = rollStatus(ri);
              return (
                <NavRow
                  key={rollNumber}
                  title={rollNumber}
                  subtitle={ri ? `${ri.defectCount} defect${ri.defectCount === 1 ? '' : 's'}` : 'Not started'}
                  right={<StatusChip label={st.label} tone={st.tone} />}
                  onPress={ri ? () => router.push({ pathname: '/supervisor/roll/[id]', params: { id: ri.id } }) : undefined}
                />
              );
            })}
          </Section>
        ))}
      </ScrollView>

      {waiting && (
        <View style={styles.footer}>
          {!online && <Text style={styles.footerNote}>Go online to make a decision</Text>}
          {recommendedAction && decisionButton(recommendedAction, {
            escalate: `Approve escalation · ${Math.min(sampleSize(item.rollCount), remaining)} more rolls`,
            full: '100% check', accept: 'Accept item', reject: 'Reject item',
          }[recommendedAction])}
          <View style={styles.row}>
            {(['escalate', 'accept', 'reject', 'full'] as Action[])
              .filter((a) => a !== recommendedAction)
              .map((a) => (
                <View key={a} style={{ flex: 1 }}>
                  {decisionButton(a, { escalate: 'Escalate', full: '100% check', accept: 'Accept', reject: 'Reject' }[a])}
                </View>
              ))}
          </View>
        </View>
      )}

      <DecisionSheet
        visible={action !== null}
        action={action}
        sampleCount={action === 'full' ? remaining : Math.min(sampleSize(item.rollCount), remaining)}
        inspectors={inspectors}
        defaultAssigneeId={latest?.assigneeId ?? ''}
        busy={busy}
        onConfirm={confirm}
        onCancel={() => setAction(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 18 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  body: { fontSize: 14, color: colors.text },
  section: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, marginTop: 6 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  sectionValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  strip: {
    borderLeftWidth: 4, borderLeftColor: '#E07B26', backgroundColor: colors.warningBg,
    borderRadius: 6, paddingVertical: 10, paddingHorizontal: 12, gap: 2,
  },
  stripTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  stripText: { fontSize: 13, color: '#4A3200' },
  barWrap: { paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  riskCard: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border },
  riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 14, paddingVertical: 10 },
  riskTotal: { fontSize: 17, fontWeight: '700', color: colors.text },
  hairline: { height: StyleSheet.hairlineWidth, backgroundColor: colors.inputBorder },
  roundInfo: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  roundRow: { flexDirection: 'row', gap: 12 },
  roundCell: { flex: 1, flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  roundLabel: { width: 62, fontSize: 13, color: colors.textMuted },
  roundValue: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.text, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 14, gap: 4, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { width: 90, fontSize: 13, color: colors.textMuted },
  infoValue: { flex: 1, fontSize: 13, color: colors.text, fontWeight: '600' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rollRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.card,
    padding: 12, borderWidth: 1, borderColor: colors.border, minHeight: 56,
  },
  rollTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  footer: { padding: 16, paddingBottom: 28, gap: 8, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  footerNote: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
  row: { flexDirection: 'row', gap: 8 },
  primary: { height: 54, borderRadius: radius.button, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  primaryText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  secondary: {
    height: 48, borderRadius: radius.button, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  secondaryText: { color: colors.primary, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  rejectBorder: { borderColor: colors.major },
  disabled: { opacity: 0.4 },
});
