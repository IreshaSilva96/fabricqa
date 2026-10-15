// Navigation for the supervisor section: Dashboard -> Item review -> Roll -> Defect.
import { router, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import ProfileButton from '../../components/ProfileButton';
import HomeButton from '../../components/HomeButton';
import { colors } from '../../constants/theme';

export default function SupervisorLayout() {
  const { profile } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerBackTitle: 'Back',
        headerRight: () => <HomeButton href="/supervisor" />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'FabricQA',
          headerRight: () => <ProfileButton name={profile?.name} onPress={() => router.push('/supervisor/profile')} />,
        }}
      />
      <Stack.Screen name="item/[itemId]" options={{ title: 'Item review' }} />
      <Stack.Screen name="roll/[id]" options={{ title: 'Roll' }} />
      <Stack.Screen name="defect/[defectId]" options={{ title: 'Defect' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
    </Stack>
  );
}
