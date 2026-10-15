// Supervisor dashboard: items ranked by risk, in three tabs, with search across all of them.
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { fetchDeadlines } from '../../lib/data';
import { Plan } from '../../lib/inspection';
import { fetchAllPlans, latestRound, planRisk } from '../../lib/supervisor';
import { Risk } from '../../lib/scoring';
import { itemStatus, dateTimeOf } from '../../lib/status';
import { useOnline } from '../../hooks/useOnline';
import RiskCard from '../../components/RiskCard';
import SearchBar from '../../components/SearchBar';
import TabTiles from '../../components/TabTiles';
import { colors, radius } from '../../constants/theme';

type Tab = 'decide' | 'progress' | 'done';
type Row = { plan: Plan; risk: Risk; deadline: number | null };

const FLAG = {
  escalate: 'RECOMMENDS ESCALATION',
  accept: 'RECOMMENDS ACCEPT',
  reject: 'RECOMMENDS REJECT',
  decide: 'ROUND LIMIT REACHED',
} as const;

const dueText = (deadline: number | null) => {
  if (deadline === null) return '';
  const days = Math.ceil((deadline - Date.now()) / 86400000);
  return days <= 0 ? 'due today' : `due in ${days}d`;
};

export default function SupervisorDashboard() {
  const { profile } = useAuth();
  const online = useOnline();
  const [rows, setRows] = useState<Row[]>([]);
  const [tab, setTab] = useState<Tab>('decide');
  const [search, setSearch] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [plans, deadlines] = await Promise.all([fetchAllPlans(), fetchDeadlines()]);
      setRows(
        plans.data.map((plan) => {
          const deadline = deadlines.data[plan.poNumber] ?? null;
          return { plan, deadline, risk: planRisk(plan, deadline) };
        })
      );
      setFromCache(plans.fromCache || deadlines.fromCache);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load the dashboard.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const inTab = (r: Row, t: Tab) =>
    t === 'decide' ? r.plan.status === 'waiting' : t === 'progress' ? r.plan.status === 'in_progress' : r.plan.decision !== null;

  const term = search.trim().toUpperCase();
  const matches = (r: Row) =>
    !term ||
    [r.plan.batchNumber, r.plan.itemId, r.plan.poNumber, r.plan.fabricType, r.plan.color].some((v) => v.toUpperCase().includes(term));

  const visible = rows
    .filter((r) => inTab(r, tab) && matches(r))
    .sort((a, b) =>
      tab === 'done' ? (b.plan.decision?.decidedAt ?? 0) - (a.plan.decision?.decidedAt ?? 0) : b.risk.total - a.risk.total
    );

  const counts = {
    decide: rows.filter((r) => inTab(r, 'decide')).length,
    progress: rows.filter((r) => inTab(r, 'progress')).length,
    done: rows.filter((r) => inTab(r, 'done')).length,
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: 'decide', label: 'Needs decision' },
    { key: 'progress', label: 'In progress' },
    { key: 'done', label: 'Completed' },
  ];

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(r) => r.plan.itemId}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {profile?.name}</Text>
          {!online && (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>Offline · decisions need a connection</Text>
            </View>
          )}
          {online && fromCache && <Text style={styles.note}>Showing saved data. Pull down to refresh.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <TabTiles
            tabs={TABS.map((t) => ({ ...t, count: counts[t.key] }))}
            value={tab}
            onChange={setTab}
          />

          <SearchBar value={search} onChangeText={setSearch} onSubmit={() => {}} placeholder="Batch, item, PO or fabric" />
          <Text style={styles.section}>{tab === 'done' ? 'MOST RECENT FIRST' : 'HIGHEST RISK FIRST'}</Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {term ? `Nothing matches "${search.trim()}".` : tab === 'decide' ? 'No items are waiting for a decision.' : 'Nothing here yet.'}
        </Text>
      }
      renderItem={({ item: r, index }) => {
        const status = itemStatus(r.plan);
        const rec = latestRound(r.plan)?.recommendation;
        const sub =
          `Item ${r.plan.itemId} · ${r.plan.poNumber}` +
          (tab === 'done' && r.plan.decision
            ? ` · ${r.plan.decision.decidedBy}, ${dateTimeOf(r.plan.decision.decidedAt)}`
            : ` · ${dueText(r.deadline)}`);
        return (
          <RiskCard
            rank={tab === 'done' ? undefined : index + 1}
            title={`Batch ${r.plan.batchNumber} · ${r.plan.fabricType} · ${r.plan.color}`}
            subtitle={sub}
            risk={r.risk}
            status={tab === 'decide' ? undefined : status} // every item here is waiting; only the recommendation matters
            flag={r.plan.status === 'waiting' && rec ? FLAG[rec] : undefined}
            onPress={() => router.push({ pathname: '/supervisor/item/[itemId]', params: { itemId: r.plan.itemId } })}
          />
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  header: { gap: 10, marginBottom: 2 },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  banner: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: 10, padding: 10 },
  bannerText: { color: colors.warningText, fontWeight: '600' },
  note: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.error },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 10, paddingHorizontal: 8, gap: 2, minHeight: 64,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabCount: { fontSize: 22, fontWeight: '700', color: colors.text },
  tabLabel: { fontSize: 12, color: colors.textMuted },
  tabTextActive: { color: '#FFFFFF' },
  section: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5, marginTop: 4 },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 24 },
});
