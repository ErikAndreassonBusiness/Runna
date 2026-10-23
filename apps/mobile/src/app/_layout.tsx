import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { palette } from '@/constants/theme';
import { useActivePlan } from '@/lib/queries';
import { SessionProvider, useSession } from '@/lib/session';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? palette.dark : palette.light;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider
      value={{
        ...base,
        colors: { ...base.colors, primary: colors.accent, background: colors.background, card: colors.background, text: colors.text },
      }}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <RootNavigator />
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { token, isLoading } = useSession();
  const plan = useActivePlan();
  const signedIn = Boolean(token);
  // Keep the splash screen up until we know where to send the runner.
  const ready = !isLoading && (!signedIn || !plan.isPending);
  const hasPlan = Boolean(plan.data);
  const planFailed = plan.isError;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  // Where to send someone who lands on a screen they can't use right now.
  const home = !signedIn ? '/welcome' : hasPlan || planFailed ? '/' : '/onboarding';

  return (
    <Stack screenOptions={{ headerShown: false, headerBackButtonDisplayMode: 'minimal', headerShadowVisible: false }}>
      <Stack.Protected guard={!signedIn} redirectTo={home}>
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sign-in" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="sign-up" options={{ headerShown: true, title: '' }} />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && !hasPlan && !planFailed} redirectTo={home}>
        <Stack.Screen name="onboarding" />
      </Stack.Protected>

      <Stack.Protected guard={signedIn && (hasPlan || planFailed)} redirectTo={home}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="workout/[id]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="log/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Log run' }} />
        <Stack.Screen name="race-result" options={{ presentation: 'modal', headerShown: true, title: 'Race result' }} />
        <Stack.Screen name="garmin" />
      </Stack.Protected>
    </Stack>
  );
}
