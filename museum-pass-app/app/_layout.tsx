import { Stack } from 'expo-router';

/**
 * Root layout for expo-router.
 * The entire app is served through app/index.tsx which manages its own
 * React Navigation stack/tabs. We just need a minimal expo-router shell.
 */
export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
