// Custom component: a simple dropdown. Shows the selected option; tapping opens the list below it.
// Props: options ([{ value, label, note? }]), value (selected value), placeholder.
// Events: onChange(value).
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../constants/theme';

type Option = { value: string; label: string; note?: string };
type Props = { options: Option[]; value: string; onChange: (value: string) => void; placeholder?: string };

export default function Dropdown({ options, value, onChange, placeholder = 'Select…' }: Props) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View>
      <Pressable
        style={[styles.field, open && styles.fieldOpen]}
        onPress={() => setOpen(!open)}
        accessibilityRole="combobox"
        accessibilityState={{ expanded: open }}
      >
        <Text style={[styles.fieldText, !selected && { color: colors.textMuted }]}>
          {selected ? selected.label : placeholder}
          {selected?.note ? <Text style={styles.note}>  {selected.note}</Text> : null}
        </Text>
        <Text style={styles.chevron}>{open ? '▲' : '▼'}</Text>
      </Pressable>

      {open && (
        <ScrollView style={styles.list} nestedScrollEnabled>
          {options.map((o) => {
            const active = o.value === value;
            return (
              <Pressable
                key={o.value}
                style={[styles.option, active && styles.optionActive]}
                onPress={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.optionText, active && { fontWeight: '700' }]}>{o.label}</Text>
                {o.note && <Text style={styles.note}>{o.note}</Text>}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 50,
    borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, paddingHorizontal: 14, backgroundColor: colors.surface,
  },
  fieldOpen: { borderColor: colors.primary, borderWidth: 2 },
  fieldText: { fontSize: 16, color: colors.text, fontWeight: '600', flexShrink: 1 },
  chevron: { fontSize: 12, color: colors.textMuted, marginLeft: 8 },
  list: {
    maxHeight: 200, marginTop: 4, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: 10, backgroundColor: colors.surface,
  },
  option: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.inputBorder,
  },
  optionActive: { backgroundColor: colors.primaryTint },
  optionText: { fontSize: 16, color: colors.text },
  note: { fontSize: 12, color: colors.primary, fontWeight: '700' },
});
