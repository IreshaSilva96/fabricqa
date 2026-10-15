// Custom component: severity shown as colour AND text, never colour alone.
import { StyleSheet, Text, View } from 'react-native';
import { Severity } from '../lib/defects';
import { colors, radius } from '../constants/theme';

type Props = { severity: Severity };

const STYLE: Record<Severity, { bg: string; fg: string; text: string }> = {
  major: { bg: colors.major, fg: '#FFFFFF', text: 'MAJOR' },
  minor: { bg: colors.minor, fg: colors.text, text: 'MINOR' },
  none: { bg: colors.clean, fg: '#FFFFFF', text: 'NO DEFECT' },
};

export default function SeverityBadge({ severity }: Props) {
  const s = STYLE[severity];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]} accessibilityLabel={`Severity ${s.text}`}>
      <Text style={[styles.text, { color: s.fg }]}>{s.text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: radius.chip, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start' },
  text: { fontSize: 13, fontWeight: '700' },
});
