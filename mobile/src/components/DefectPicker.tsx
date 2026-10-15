// Custom component: lets the inspector choose the defect type.
// Props: selected (current choice), suggested (AI's label, tagged "AI"), onSelect (event).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { DEFECT_LABELS, DefectLabel, DISPLAY_NAME } from '../lib/defects';
import { colors } from '../constants/theme';

type Props = {
  selected: DefectLabel | null;
  suggested?: DefectLabel | null;
  onSelect: (label: DefectLabel) => void;
};

export default function DefectPicker({ selected, suggested, onSelect }: Props) {
  return (
    <View style={styles.grid}>
      {DEFECT_LABELS.map((label) => {
        const isSelected = selected === label;
        return (
          <Pressable
            key={label}
            onPress={() => onSelect(label)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            style={[styles.option, isSelected && styles.optionSelected]}
          >
            <Text style={styles.optionText}>{DISPLAY_NAME[label]}</Text>
            {suggested === label && <Text style={styles.aiTag}>AI</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    width: '48.5%', minHeight: 48, borderRadius: 10, borderWidth: 1, borderColor: colors.inputBorder,
    backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.primary, backgroundColor: colors.primaryTint },
  optionText: { fontSize: 15, fontWeight: '600', color: colors.text },
  aiTag: {
    fontSize: 11, fontWeight: '700', color: colors.primary, borderWidth: 1, borderColor: colors.primary,
    borderRadius: 4, paddingHorizontal: 4,
  },
});
