// Header button showing the user's initials; opens their profile.
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors } from '../constants/theme';

export const initialsOf = (name?: string) =>
  (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export default function ProfileButton({ name, onPress }: { name?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.circle} hitSlop={8} accessibilityLabel="Open profile">
      <Text style={styles.text}>{initialsOf(name)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { color: colors.primary, fontWeight: '700', fontSize: 14 },
});
