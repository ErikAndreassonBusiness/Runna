import { formatDuration, formatPaceRange, RACE_LABELS, today, type PaceZone } from '@stride/core';
import { View } from 'react-native';
import { Card, ErrorState, Loading, ProgressBar, Row, Screen, Stat, T } from '@/components/ui';
import { VolumeChart } from '@/components/volume-chart';
import { spacing, useTheme, zoneLabels } from '@/constants/theme';
import { formatKm } from '@/lib/format';
import { useActivePlan } from '@/lib/queries';

const ZONES: PaceZone[] = ['easy', 'long', 'marathon', 'threshold', 'interval', 'repetition', 'race'];

export default function Progress() {
  const theme = useTheme();
  const { data, isPending, error, refetch, isRefetching } = useActivePlan();
  if (isPending) return <Loading />;
  if (error || !data) return <ErrorState message={error?.message ?? 'No plan found'} onRetry={refetch} />;

  const { plan, workouts } = data;
  const now = today();
  const past = workouts.filter((w) => w.date < now || w.status !== 'planned');
  const completed = workouts.filter((w) => w.status === 'completed');
  const completion = past.length ? completed.length / past.length : 0;
  const totalKm = completed.reduce((s, w) => s + (w.activity?.distanceMeters ?? w.distanceMeters), 0);
  const thisWeek = workouts.filter((w) => w.week === plan.currentWeek);
  const weekPlanned = thisWeek.reduce((s, w) => s + w.distanceMeters, 0);
  const weekDone = thisWeek.reduce((s, w) => s + (w.activity?.distanceMeters ?? 0), 0);

  return (
    <Screen refreshing={isRefetching} onRefresh={refetch}>
      <T variant="display">Progress</T>

      <Card>
        <T variant="label" muted>
          Predicted {RACE_LABELS[plan.goal]}
        </T>
        <T variant="display" color={theme.accent}>
          {formatDuration(plan.predictedRaceSeconds)}
        </T>
        <T variant="caption" muted>
          Where your training is taking you by race day. Fitness score (VDOT) this week: {plan.vdot}
          {plan.vdotAdjustment !== 0 &&
            ` (${plan.vdotAdjustment > 0 ? '+' : ''}${plan.vdotAdjustment.toFixed(1)} from your recent sessions)`}
        </T>
      </Card>

      <Card>
        <Row gap={spacing.lg}>
          <Stat label="Sessions done" value={`${completed.length}`} />
          <Stat label="Completion" value={`${Math.round(completion * 100)}%`} />
          <Stat label="Distance run" value={formatKm(totalKm)} />
        </Row>
      </Card>

      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">This week</T>
          <T variant="caption" muted>
            {formatKm(weekDone)} of {formatKm(weekPlanned)}
          </T>
        </Row>
        <ProgressBar value={weekPlanned ? weekDone / weekPlanned : 0} />
      </Card>

      <Card>
        <T variant="heading">Weekly volume</T>
        <VolumeChart plan={plan} workouts={workouts} />
      </Card>

      <Card>
        <T variant="heading">Your pace zones</T>
        <T variant="caption" muted>
          Updated automatically as your fitness changes.
        </T>
        <View style={{ marginTop: spacing.sm }}>
          {ZONES.map((z) => (
            <Row key={z} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <T>{zoneLabels[z]}</T>
              <T style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>{formatPaceRange(plan.paces[z])}</T>
            </Row>
          ))}
        </View>
      </Card>
    </Screen>
  );
}
