// Batch screen: the batch's items (fabric + colour), each with its inspection status.
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../../lib/auth';
import { fetchItems, Item } from '../../../lib/data';
import { fetchPlansByBatch, Plan } from '../../../lib/inspection';
import { itemStatus } from '../../../lib/status';
import StatusChip from '../../../components/StatusChip';
import { colors, radius } from '../../../constants/theme';

const daysUntil = (ms: number | null) => (ms === null ? null : Math.ceil((ms - Date.now()) / 86400000));

export default function BatchScreen() {
  const { batchNumber } = useLocalSearchParams<{ batchNumber: string }>();
  const { user } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          setError(null);
          const [i, p] = await Promise.all([fetchItems(batchNumber), fetchPlansByBatch(batchNumber)]);
          setItems(i.data);
          setPlans(p.data);
        } catch (e: any) {
          setError(e?.message ?? 'Could not load items.');
        }
      })();
    }, [batchNumber])
  );

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={styles.content}
      data={items}
      keyExtractor={(i) => i.itemId}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>Batch {batchNumber}</Text>
          <Text style={styles.muted}>Each item (fabric + colour) is sampled and judged on its own.</Text>
          {error && <Text style={styles.error}>{error}</Text>}
        </View>
      }
      renderItem={({ item }) => {
        const status = itemStatus(plans[item.itemId], user?.uid);
        const days = daysUntil(item.deadline);
        return (
          <Pressable
            style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}
            onPress={() => router.push({ pathname: '/inspector/item/[itemId]', params: { itemId: item.itemId } })}
          >
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.fabricType} · {item.color}</Text>
            </View>
            <Text style={styles.muted}>
              Item {item.itemId} · {item.poNumber}
              {days !== null ? ` · ${days <= 0 ? 'due today' : `due in ${days}d`}` : ''}
            </Text>
            <Text style={styles.body}>{item.rollCount} rolls · {item.widthCm} cm wide</Text>
            <StatusChip label={status.label} tone={status.tone} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 10 },
  header: { gap: 4, marginBottom: 6 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  body: { fontSize: 14, color: colors.text },
  error: { color: colors.error },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
});
