// Header button (house icon) that jumps straight back to the role's home screen,
// closing every screen opened on top of it instead of going back one by one.
// Props: href (the home route, e.g. '/inspector').
import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/theme';

export default function HomeButton({ href }: { href: '/inspector' | '/supervisor' }) {
  return (
    <Pressable
      onPress={() => router.dismissTo(href)}
      hitSlop={12}
      style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityLabel="Go to home"
    >
      <Ionicons name="home-outline" size={22} color={colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // 36 x 36 circle, same size as the profile button on the home screens
  button: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint,
    alignItems: 'center', justifyContent: 'center',
  },
});
