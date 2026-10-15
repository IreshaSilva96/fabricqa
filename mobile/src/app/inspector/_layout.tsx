// Navigation for the inspector section: Home -> Batch -> Item -> Roll -> Capture -> Result.
import { router, Stack } from 'expo-router';
import { useAuth } from '../../lib/auth';
import ProfileButton from '../../components/ProfileButton';
import HomeButton from '../../components/HomeButton';
import { colors } from '../../constants/theme';

export default function InspectorLayout() {
  const { profile } = useAuth();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.primary,
        headerBackTitle: 'Back',
        headerRight: () => <HomeButton href="/inspector" />,
      }}
    >
      <Stack.Screen
        name="index"
        options={{
          title: 'FabricQA',
          headerRight: () => <ProfileButton name={profile?.name} onPress={() => router.push('/inspector/profile')} />,
        }}
      />
      <Stack.Screen name="batch/[batchNumber]" options={{ title: 'Batch' }} />
      <Stack.Screen name="item/[itemId]" options={{ title: 'Item' }} />
      <Stack.Screen name="roll/[rollNumber]" options={{ title: 'Roll inspection' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture defect' }} />
      <Stack.Screen name="result" options={{ title: 'Defect result' }} />
      <Stack.Screen name="defect/[defectId]" options={{ title: 'Defect' }} />
      <Stack.Screen name="profile" options={{ title: 'Profile' }} />
    </Stack>
  );
}
