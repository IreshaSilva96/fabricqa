// Custom component: a compact grid of label/value facts.
// Props: facts ([{ label, value, help? }]), columns (default 3), bare (no panel, for use inside another card),
//        valueFirst (show the value above its label).
// Events: tapping a fact that has `help` shows its explanation (labels with help end in ⓘ).
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';

export type Fact = { label: string; value: string; help?: string };
type Props = { facts: Fact[]; columns?: number; bare?: boolean; valueFirst?: boolean };

export default function FactGrid({ facts, columns = 3, bare = false, valueFirst = false }: Props) {
  return (
    <View style={bare ? styles.bare : styles.card}>
      {facts.map((f) => (
        <Pressable
          key={f.label}
          style={({ pressed }) => [styles.cell, { width: `${100 / columns}%` }, pressed && f.help && { opacity: 0.5 }]}
          onPress={f.help ? () => Alert.alert(f.label, f.help) : undefined}
          disabled={!f.help}
          accessibilityRole={f.help ? 'button' : undefined}
          accessibilityHint={f.help ? 'Shows how this is calculated' : undefined}
        >
          {valueFirst && <Text style={styles.value}>{f.value}</Text>}
          <Text style={[styles.label, f.help && styles.helpLabel]}>
            {f.label}
            {f.help ? ' ⓘ' : ''}
          </Text>
          {!valueFirst && <Text style={styles.value}>{f.value}</Text>}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', flexWrap: 'wrap', backgroundColor: colors.surface, borderRadius: radius.card,
    borderWidth: 1, borderColor: colors.border, paddingVertical: 6, paddingHorizontal: 8,
  },
  bare: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 6 },
  cell: { paddingVertical: 6, paddingHorizontal: 6, gap: 2 },
  label: { fontSize: 12, color: colors.textMuted },
  helpLabel: { color: colors.primary },
  value: { fontSize: 15, fontWeight: '600', color: colors.text },
});
