// Custom components for the minimal "grouped list" layout (like iOS Settings):
//   <Section title right>  a white panel with a heading; rows inside are separated by hairlines
//   <InfoRow label value>  label on the left, value on the right
//   <NavRow title subtitle right onPress>  a tappable row with a chevron
import { Children, Fragment, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../constants/theme';

export function Section({ title, right, children }: { title?: string; right?: string; children: ReactNode }) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {(title || right) && (
        <View style={styles.headingRow}>
          <Text style={styles.heading}>{title}</Text>
          {right && <Text style={styles.headingRight}>{right}</Text>}
        </View>
      )}
      <View style={styles.panel}>
        {rows.map((row, i) => (
          <Fragment key={i}>
            {i > 0 && <View style={styles.divider} />}
            {row}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      {typeof value === 'string' ? <Text style={styles.value}>{value}</Text> : value}
    </View>
  );
}

export function NavRow({
  title, subtitle, right, onPress,
}: { title: string; subtitle?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.navRow, pressed && onPress && { opacity: 0.6 }]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.navTitle}>{title}</Text>
        {subtitle && <Text style={styles.navSubtitle}>{subtitle}</Text>}
      </View>
      {right}
      {onPress && <Text style={styles.chevron}>›</Text>}
    </Pressable>
  );
}

export function Block({ children }: { children: ReactNode }) {
  return <View style={styles.block}>{children}</View>;
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  headingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4 },
  heading: { fontSize: 13, fontWeight: '600', color: colors.textMuted, letterSpacing: 0.5 },
  headingRight: { fontSize: 15, fontWeight: '700', color: colors.text },
  panel: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.inputBorder, marginLeft: 16 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10 },
  label: { fontSize: 15, color: colors.textMuted },
  value: { fontSize: 15, fontWeight: '600', color: colors.text, textAlign: 'right', flexShrink: 1 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 16, paddingVertical: 10 },
  navTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
  navSubtitle: { fontSize: 13, color: colors.textMuted },
  chevron: { fontSize: 22, color: colors.textMuted, marginLeft: 2 },
  block: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
});
