import { daysBetween, today } from '@stride/core';
import { View } from 'react-native';
import { GarminCard } from '@/components/garmin-card';
import { Card, ErrorState, Loading, Row, Screen, T } from '@/components/ui';
import { WorkoutHero, WorkoutRow } from '@/components/workout';
import { phaseLabels, spacing, useTheme } from '@/constants/theme';
import { formatDay } from '@/lib/format';
import { useActivePlan, useMe } from '@/lib/queries';

export default function Today() {
  const theme = useTheme();
  const me = useMe();
  const { data, isPending, error, refetch, isRefetching } = useActivePlan();

  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'No plan found'} onRetry={refetch} />;

  const { plan, workouts, events } = data;
  const now = today();
  const week = plan.weeks.find((w) => w.week === plan.currentWeek);
  const todays = workouts.find((w) => w.date === now);
  const next = workouts.find((w) => w.date > now && w.status === 'planned');
  const thisWeek = workouts.filter((w) => w.week === plan.currentWeek);
  const daysToRace = daysBetween(now, plan.raceDate);
  const recentEvent = events.find((e) => daysBetween(e.createdAt.slice(0, 10), now) <= 7);
  const raceDone = daysToRace < 0;

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <View style={{ gap: spacing.xs }}>
        <T variant="display">Hi {me.data?.user.name ?? 'runner'}</T>
        <T muted>
          {raceDone
            ? 'Your plan is complete — congratulations!'
            : `Week ${plan.currentWeek} of ${plan.weeks.length}${week ? ` · ${phaseLabels[week.phase]}` : ''} · ${daysToRace} days to race day`}
        </T>
      </View>

      {recentEvent && (
        <Card style={{ backgroundColor: theme.accentSoft, borderColor: theme.accentSoft }}>
          <T variant="label" color={theme.accent}>
            Plan update
          </T>
          <T>{recentEvent.message}</T>
        </Card>
      )}

      {todays ? (
        <WorkoutHero workout={todays} label="Today" />
      ) : (
        <Card>
          <T variant="label" muted>
            Today
          </T>
          <T variant="title">Rest day</T>
          <T muted>Recovery is when the training sinks in. Stretch, sleep well and get ready for the next session.</T>
        </Card>
      )}

      {next && (!todays || todays.status !== 'planned') && <WorkoutHero workout={next} label={`Up next · ${formatDay(next.date)}`} />}

      <View style={{ gap: spacing.sm }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">This week</T>
          {week && (
            <T variant="caption" muted>
              {thisWeek.filter((w) => w.status === 'completed').length}/{thisWeek.length} done
            </T>
          )}
        </Row>
        {thisWeek.map((w) => (
          <WorkoutRow key={w.id} workout={w} />
        ))}
      </View>

      <GarminCard compact />
    </Screen>
  );
}
