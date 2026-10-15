// Custom component: big tappable tabs that show a count (used on both home screens).
// Props: tabs ([{ key, label, count }]), value (selected key). Events: onChange(key).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';

type Tab<K extends string> = { key: K; label: string; count: number };
type Props<K extends string> = { tabs: Tab<K>[]; value: K; onChange: (key: K) => void };

export default function TabTiles<K extends string>({ tabs, value, onChange }: Props<K>) {
  return (
    <View style={styles.row}>
      {tabs.map((t) => {
        const active = t.key === value;
        return (
          <Pressable
            key={t.key}
            style={[styles.tab, active && styles.tabActive]}
            onPress={() => onChange(t.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.count, active && styles.activeText]}>{t.count}</Text>
            <Text style={[styles.label, active && styles.activeText]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1, backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border,
    paddingVertical: 10, paddingHorizontal: 12, gap: 2, minHeight: 64,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  count: { fontSize: 22, fontWeight: '700', color: colors.text },
  label: { fontSize: 12, color: colors.textMuted },
  activeText: { color: '#FFFFFF' },
});
