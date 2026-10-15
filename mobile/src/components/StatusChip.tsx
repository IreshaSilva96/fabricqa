import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';

export type Tone = 'neutral' | 'progress' | 'pass' | 'fail' | 'warning';

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  neutral: { bg: colors.surface, fg: colors.textMuted, border: colors.inputBorder },
  progress: { bg: colors.primaryTint, fg: colors.primary, border: '#A9BED6' },
  pass: { bg: '#E3F1EA', fg: '#1E5E43', border: '#9CCDB4' },
  fail: { bg: colors.major, fg: '#FFFFFF', border: colors.major },
  warning: { bg: colors.warningBg, fg: colors.warningText, border: colors.warningBorder },
};

export default function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.chip, { backgroundColor: t.bg, borderColor: t.border }]}>
      <Text style={[styles.text, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: radius.chip, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' },
  text: { fontSize: 12, fontWeight: '700' },
});
