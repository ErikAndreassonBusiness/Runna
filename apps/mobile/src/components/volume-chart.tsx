import { View } from 'react-native';
import { spacing, useTheme } from '@/constants/theme';
import type { Plan, Workout } from '@/lib/types';
import { Row, T } from './ui';

/** Weekly volume: planned (outline) vs completed (filled), current week highlighted. */
export function VolumeChart({ plan, workouts }: { plan: Plan; workouts: Workout[] }) {
  const theme = useTheme();
  const weeks = plan.weeks.map((w) => {
    const ofWeek = workouts.filter((x) => x.week === w.week);
    return {
      week: w.week,
      planned: ofWeek.reduce((s, x) => s + x.distanceMeters, 0),
      done: ofWeek.reduce((s, x) => s + (x.activity?.distanceMeters ?? 0), 0),
    };
  });
  const max = Math.max(...weeks.map((w) => Math.max(w.planned, w.done)), 1);
  const HEIGHT = 120;

  return (
    <View style={{ gap: spacing.sm }}>
      <Row gap={3} style={{ alignItems: 'flex-end', height: HEIGHT }}>
        {weeks.map((w) => {
          const current = w.week === plan.currentWeek;
          return (
            <View
              key={w.week}
              accessibilityLabel={`Week ${w.week}: ${(w.done / 1000).toFixed(0)} of ${(w.planned / 1000).toFixed(0)} km`}
              style={{
                flex: 1,
                height: (w.planned / max) * HEIGHT,
                borderRadius: 3,
                borderWidth: 1.5,
                borderColor: current ? theme.accent : theme.border,
                justifyContent: 'flex-end',
                overflow: 'hidden',
              }}>
              <View
                style={{
                  height: `${Math.min(100, (w.done / Math.max(w.planned, 1)) * 100)}%`,
                  backgroundColor: current ? theme.accent : theme.success,
                }}
              />
            </View>
          );
        })}
      </Row>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="caption" muted>
          Week 1
        </T>
        <T variant="caption" muted>
          Race week
        </T>
      </Row>
    </View>
  );
}
