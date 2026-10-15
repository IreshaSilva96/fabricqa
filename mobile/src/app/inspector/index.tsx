// Inspector home: two tabs (Assigned to you / Batches) and one search box for the open tab.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { Batch, fetchBatches, findRoll } from '../../lib/data';
import { fetchAssignedPlans, Plan } from '../../lib/inspection';
import { useOnline } from '../../hooks/useOnline';
import { wakeInference } from '../../lib/inference';
import { batchStatus, dateOf } from '../../lib/status';
import { fetchAllPlans } from '../../lib/supervisor';
import SearchBar from '../../components/SearchBar';
import StatusChip from '../../components/StatusChip';
import TabTiles from '../../components/TabTiles';
import SyncBanner from '../../components/SyncBanner';
import { colors, radius } from '../../constants/theme';

type Tab = 'assigned' | 'batches';
type Row = { kind: 'plan'; plan: Plan } | { kind: 'batch'; batch: Batch };

export default function InspectorHome() {
  const { user, profile } = useAuth();
  const online = useOnline();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [assigned, setAssigned] = useState<Plan[]>([]);
  const [allPlans, setAllPlans] = useState<Plan[]>([]);
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  // Open on "Assigned to you" when there is work there, unless the inspector picked a tab
  const tab: Tab = chosenTab ?? (assigned.length > 0 ? 'assigned' : 'batches');
  const term = search.trim().toUpperCase();

  const assignedRows = assigned.filter(
    (p) => !term || [p.batchNumber, p.itemId, p.poNumber, p.fabricType, p.color, ...p.currentRolls].some((v) => v.toUpperCase().includes(term))
  );
  const batchRows = batches.filter((b) => !term || [b.batchNumber, ...b.poNumbers].some((v) => v.toUpperCase().includes(term)));
  const rows: Row[] =
    tab === 'assigned'
      ? assignedRows.map((plan) => ({ kind: 'plan', plan }))
      : batchRows.map((batch) => ({ kind: 'batch', batch }));

  // Start waking the AI server now, so it's ready by the first photo
  useEffect(() => {
    wakeInference();
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setError(null);
      const [b, a, all] = await Promise.all([
        fetchBatches(), fetchAssignedPlans(user.uid), fetchAllPlans().catch(() => ({ data: [] as Plan[] })),
      ]);
      setBatches(b.data);
      setAssigned(a.data);
      setAllPlans(all.data);
      setFromCache(b.fromCache || a.fromCache);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your work.');
    }
  }, [user]);

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

  const switchTab = (t: Tab) => {
    setChosenTab(t);
    setSearch('');
  };

  // Jump straight to a roll's item by its internal or supplier roll number
  const lookUpRoll = async () => {
    if (!term) return;
    setLookingUp(true);
    try {
      const roll = await findRoll(term);
      if (roll) router.push({ pathname: '/inspector/item/[itemId]', params: { itemId: roll.itemId } });
      else Alert.alert('No roll found', `No roll matches "${search.trim()}". Check the number on the roll label.`);
    } finally {
      setLookingUp(false);
    }
  };

  const openItem = (itemId: string) => router.push({ pathname: '/inspector/item/[itemId]', params: { itemId } });

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={rows}
      keyboardShouldPersistTaps="handled"
      keyExtractor={(r) => (r.kind === 'plan' ? `p-${r.plan.itemId}` : `b-${r.batch.batchNumber}`)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.greeting}>Hello, {profile?.name}</Text>
          <SyncBanner />
          {online && fromCache && <Text style={styles.note}>Showing saved data. Pull down to refresh.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <TabTiles
            tabs={[
              { key: 'assigned', label: 'Assigned to you', count: assigned.length },
              { key: 'batches', label: 'Batches', count: batches.length },
            ]}
            value={tab}
            onChange={switchTab}
          />

          <SearchBar
            value={search}
            onChangeText={setSearch}
            onSubmit={tab === 'batches' ? lookUpRoll : () => {}}
            placeholder={tab === 'assigned' ? 'Search assigned work…' : 'Batch, PO or roll number'}
          />
          {tab === 'batches' && term.length > 0 && (
            <Pressable style={styles.lookup} onPress={lookUpRoll} disabled={lookingUp}>
              {lookingUp ? <ActivityIndicator /> : <Text style={styles.lookupText}>Go to roll "{search.trim()}"</Text>}
            </Pressable>
          )}
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>
          {term
            ? `Nothing matches "${search.trim()}".`
            : tab === 'assigned'
              ? 'Nothing assigned to you right now. Open Batches to start an item.'
              : 'No batches yet.'}
        </Text>
      }
      renderItem={({ item: r }) => {
        if (r.kind === 'plan') {
          const p = r.plan;
          const returned = p.currentRound > 1;
          return (
            <Pressable style={({ pressed }) => [styles.card, styles.assignedCard, pressed && { opacity: 0.7 }]} onPress={() => openItem(p.itemId)}>
              <View style={styles.row}>
                <Text style={styles.cardTitle}>Batch {p.batchNumber}</Text>
                <StatusChip label={`${returned ? 'RETURNED · ' : ''}ROUND ${p.currentRound}`} tone={returned ? 'warning' : 'progress'} />
              </View>
              <Text style={styles.body}>{p.fabricType} · {p.color}</Text>
              <Text style={styles.muted}>
                Item {p.itemId} · {p.poNumber} · {p.currentRolls.length} roll{p.currentRolls.length === 1 ? '' : 's'} to inspect
              </Text>
            </Pressable>
          );
        }
        const b = r.batch;
        const bs = batchStatus(allPlans.filter((p) => p.batchNumber === b.batchNumber), b.itemCount);
        return (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/inspector/batch/[batchNumber]', params: { batchNumber: b.batchNumber } })}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>Batch {b.batchNumber}</Text>
              <Text style={styles.muted}>Received {dateOf(b.receivedDate)}</Text>
            </View>
            <Text style={styles.muted}>{b.poNumbers.join(', ')}</Text>
            <Text style={styles.body}>
              {b.itemCount} item{b.itemCount === 1 ? '' : 's'} · {b.rollCount} rolls
            </Text>
            <StatusChip label={bs.label} tone={bs.tone} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  header: { gap: 12, marginBottom: 2 },
  greeting: { fontSize: 22, fontWeight: '700', color: colors.text },
  banner: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: 10, padding: 10 },
  bannerText: { color: colors.warningText, fontWeight: '600' },
  note: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.error },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  assignedCard: { borderColor: colors.primary, borderWidth: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  body: { fontSize: 14, color: colors.text },
  empty: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  lookup: {
    backgroundColor: colors.primaryTint, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: colors.primary,
  },
  lookupText: { color: colors.primary, fontWeight: '600', fontSize: 15 },
});
