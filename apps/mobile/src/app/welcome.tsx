import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, T } from '@/components/ui';
import { spacing, useTheme, workoutColors } from '@/constants/theme';

const FEATURES = [
  { color: workoutColors.intervals, text: 'A plan built around your race, fitness and schedule' },
  { color: workoutColors.tempo, text: 'Paces that adapt as you get fitter' },
  { color: workoutColors.long, text: 'Workouts sent straight to your Garmin' },
];

export default function Welcome() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.background,
        padding: spacing.xl,
        paddingTop: insets.top + spacing.xxl * 2,
        paddingBottom: insets.bottom + spacing.xl,
        justifyContent: 'space-between',
      }}>
      <View style={{ gap: spacing.lg }}>
        <T variant="display" color={theme.accent} style={{ fontSize: 52 }}>
          Stride
        </T>
        <T variant="title" style={{ fontWeight: '700' }}>
          Personalised running plans that adapt to you.
        </T>
        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          {FEATURES.map((f) => (
            <View key={f.text} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: f.color }} />
              <T muted style={{ flex: 1 }}>
                {f.text}
              </T>
            </View>
          ))}
        </View>
      </View>
      <View style={{ gap: spacing.sm }}>
        <Button title="Get started" onPress={() => router.push('/sign-up')} />
        <Button title="I already have an account" variant="ghost" onPress={() => router.push('/sign-in')} />
      </View>
    </View>
  );
}
