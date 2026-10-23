import { RACE_LABELS } from '@stride/core';
import { View } from 'react-native';
import { Badge, ErrorState, Loading, Row, Screen, T } from '@/components/ui';
import { WorkoutRow } from '@/components/workout';
import { phaseLabels, spacing, useTheme } from '@/constants/theme';
import { formatDay, formatKm, formatLongDate } from '@/lib/format';
import { useActivePlan } from '@/lib/queries';

const PHASE_COLORS = { base: '#3FB27F', build: '#3D7BF7', peak: '#EF4444', taper: '#A855F7' } as const;

export default function PlanScreen() {
  const theme = useTheme();
  const { data, isPending, error, refetch, isRefetching } = useActivePlan();
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'No plan found'} onRetry={refetch} />;

  const { plan, workouts } = data;

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <View style={{ gap: spacing.xs }}>
        <T variant="display">{RACE_LABELS[plan.goal]}</T>
        <T muted>
          {plan.weeks.length} weeks · Race day {formatLongDate(plan.raceDate)}
        </T>
      </View>

      {plan.weeks.map((week) => {
        const ofWeek = workouts.filter((w) => w.week === week.week);
        const planned = ofWeek.reduce((s, w) => s + w.distanceMeters, 0);
        const current = week.week === plan.currentWeek;
        return (
          <View
            key={week.week}
            style={{
              gap: spacing.sm,
              padding: current ? spacing.md : 0,
              marginHorizontal: current ? -spacing.md : 0,
              borderRadius: 20,
              backgroundColor: current ? theme.accentSoft : 'transparent',
            }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Row>
                <T variant="heading">Week {week.week}</T>
                <Badge label={phaseLabels[week.phase]} color={PHASE_COLORS[week.phase]} />
                {current && <Badge label="This week" color={theme.accent} />}
              </Row>
              <T variant="caption" muted>
                {formatKm(planned)}
              </T>
            </Row>
            <T variant="caption" muted>
              From {formatDay(week.startDate, false)}
            </T>
            {ofWeek.length === 0 ? (
              <T muted>No sessions this week.</T>
            ) : (
              ofWeek.map((w) => <WorkoutRow key={w.id} workout={w} />)
            )}
          </View>
        );
      })}
    </Screen>
  );
}
