import {
  expandSteps,
  formatDuration,
  formatPace,
  formatPaceRange,
  formatStepDuration,
  type WorkoutItem,
  type WorkoutStep,
} from '@stride/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme, workoutColors, workoutLabels, zoneLabels } from '@/constants/theme';
import { formatDay, formatKm } from '@/lib/format';
import type { Workout } from '@/lib/types';
import { Badge, Card, Row, Stat, T } from './ui';

function openWorkout(id: string) {
  router.push({ pathname: '/workout/[id]', params: { id } });
}

function StatusMark({ workout }: { workout: Workout }) {
  const theme = useTheme();
  if (workout.status === 'completed') {
    return (
      <View style={[styles.mark, { backgroundColor: theme.success }]}>
        <T variant="caption" color="#fff" style={{ fontWeight: '800' }}>
          ✓
        </T>
      </View>
    );
  }
  if (workout.status === 'skipped') {
    return (
      <View style={[styles.mark, { backgroundColor: theme.surfaceAlt }]}>
        <T variant="caption" muted style={{ fontWeight: '800' }}>
          –
        </T>
      </View>
    );
  }
  return <View style={[styles.mark, { borderWidth: 2, borderColor: theme.border }]} />;
}

/** Compact row used in lists. */
export function WorkoutRow({ workout, showDate = true }: { workout: Workout; showDate?: boolean }) {
  const theme = useTheme();
  const color = workoutColors[workout.type];
  return (
    <Pressable
      onPress={() => openWorkout(workout.id)}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.8 : workout.status === 'skipped' ? 0.55 : 1 },
      ]}>
      <View style={[styles.stripe, { backgroundColor: color }]} />
      <View style={{ flex: 1, gap: 2 }}>
        {showDate && (
          <T variant="caption" muted>
            {formatDay(workout.date)}
          </T>
        )}
        <T variant="heading" numberOfLines={1} style={{ fontSize: 16 }}>
          {workout.title}
        </T>
        <T variant="caption" muted>
          {formatKm(workout.distanceMeters)} · {formatDuration(workout.estDurationSeconds)}
          {workout.garminSynced ? ' · On watch' : ''}
        </T>
      </View>
      <StatusMark workout={workout} />
    </Pressable>
  );
}

/** Large card for today's / next session. */
export function WorkoutHero({ workout, label }: { workout: Workout; label: string }) {
  const color = workoutColors[workout.type];
  return (
    <Card onPress={() => openWorkout(workout.id)} style={{ borderLeftWidth: 6, borderLeftColor: color, gap: spacing.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="label" muted>
          {label}
        </T>
        <Badge label={workout.status === 'completed' ? 'Done' : workoutLabels[workout.type]} color={color} />
      </Row>
      <T variant="title">{workout.title}</T>
      <T muted numberOfLines={2}>
        {workout.description}
      </T>
      <Row gap={spacing.lg}>
        <Stat label="Distance" value={formatKm(workout.distanceMeters)} />
        <Stat label="Est. time" value={formatDuration(workout.estDurationSeconds)} />
        <Stat label="Watch" value={workout.garminSynced ? 'Synced' : '—'} />
      </Row>
    </Card>
  );
}

function intensityLabel(step: WorkoutStep): string {
  switch (step.intensity) {
    case 'warmup':
      return 'Warm up';
    case 'cooldown':
      return 'Cool down';
    case 'recovery':
      return step.note ?? 'Recover';
    case 'rest':
      return 'Rest';
    default:
      return step.zone ? `${zoneLabels[step.zone]} pace` : 'Run';
  }
}

function StepLine({ step }: { step: WorkoutStep }) {
  const theme = useTheme();
  const isWork = step.intensity === 'active';
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: spacing.sm }}>
      <Row gap={spacing.md} style={{ flex: 1 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: isWork ? theme.accent : theme.textMuted }} />
        <View style={{ flex: 1 }}>
          <T style={{ fontWeight: isWork ? '700' : '500' }}>{formatStepDuration(step.duration)}</T>
          <T variant="caption" muted>
            {intensityLabel(step)}
          </T>
        </View>
      </Row>
      {step.pace && (
        <T variant="caption" style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
          {formatPaceRange(step.pace)}
        </T>
      )}
    </Row>
  );
}

export function StepList({ steps }: { steps: WorkoutItem[] }) {
  const theme = useTheme();
  return (
    <View>
      {steps.map((item, i) =>
        item.kind === 'step' ? (
          <StepLine key={i} step={item} />
        ) : (
          <View
            key={i}
            style={{ borderLeftWidth: 3, borderColor: theme.accent, paddingLeft: spacing.md, marginVertical: spacing.xs }}>
            <T variant="label" color={theme.accent}>
              Repeat {item.times}×
            </T>
            {item.steps.map((s, j) => (
              <StepLine key={j} step={s} />
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/** Planned vs actual, with per-lap paces when the watch recorded laps. */
export function ActivitySummary({ workout }: { workout: Workout }) {
  const theme = useTheme();
  const a = workout.activity;
  if (!a) return null;
  const pace = a.durationSeconds / (a.distanceMeters / 1000);
  const steps = expandSteps(workout.steps);
  const lapsMatchSteps = a.laps && a.laps.length === steps.length;
  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading">Your run</T>
        <Badge label={a.source === 'garmin' ? 'From Garmin' : 'Logged manually'} color={theme.success} />
      </Row>
      <Row gap={spacing.lg}>
        <Stat label="Distance" value={formatKm(a.distanceMeters)} />
        <Stat label="Time" value={formatDuration(a.durationSeconds)} />
        <Stat label="Avg pace" value={`${formatPace(pace)}/km`} />
        {a.avgHeartRate ? <Stat label="Avg HR" value={`${Math.round(a.avgHeartRate)}`} /> : null}
      </Row>
      {lapsMatchSteps && (
        <View style={{ marginTop: spacing.sm }}>
          <T variant="label" muted>
            Laps vs target
          </T>
          {a.laps!.map((lap, i) => {
            const step = steps[i];
            if (step.intensity !== 'active' || !step.pace || lap.distanceMeters <= 0) return null;
            const lapPace = lap.durationSeconds / (lap.distanceMeters / 1000);
            const onTarget = lapPace >= step.pace.fast - 5 && lapPace <= step.pace.slow + 5;
            return (
              <Row key={i} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                <T variant="caption" muted>
                  Lap {i + 1} · {formatStepDuration(step.duration)}
                </T>
                <T variant="caption" color={onTarget ? theme.success : theme.accent} style={{ fontWeight: '700' }}>
                  {formatPace(lapPace)}/km {onTarget ? '✓' : lapPace < step.pace.fast ? '↑ fast' : '↓ slow'}
                </T>
              </Row>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    paddingLeft: 0,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  stripe: { width: 5, alignSelf: 'stretch', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  mark: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
});
