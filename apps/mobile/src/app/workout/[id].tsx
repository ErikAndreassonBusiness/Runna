import { addDays, daysBetween, formatDuration, startOfWeek, today } from '@stride/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Badge, Button, Card, Chip, Row, Screen, Stat, T } from '@/components/ui';
import { ActivitySummary, StepList } from '@/components/workout';
import { spacing, workoutColors, workoutLabels } from '@/constants/theme';
import { formatDay, formatKm } from '@/lib/format';
import { useActivePlan, useGarminSync, useMe, useMoveWorkout, useResetWorkout, useSkipWorkout, useWorkout } from '@/lib/queries';

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const plan = useActivePlan().data;
  const me = useMe();
  const skip = useSkipWorkout();
  const reset = useResetWorkout();
  const move = useMoveWorkout();
  const sync = useGarminSync();
  const [moving, setMoving] = useState(false);

  if (!workout || !plan) {
    return (
      <Screen header>
        <T muted>Workout not found.</T>
      </Screen>
    );
  }

  const now = today();
  const color = workoutColors[workout.type];
  const isPlanned = workout.status === 'planned';
  const garminConnected = me.data?.garmin.connected;
  const lastPlanDate = plan.workouts.at(-1)?.date ?? plan.plan.raceDate;
  const weekStart = startOfWeek(workout.date);
  const moveOptions = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter(
    (d) => d !== workout.date && d >= now && d <= lastPlanDate,
  );

  return (
    <Screen
      header
      footer={
        isPlanned ? (
          <>
            <Row>
              <Button
                title="Log run"
                style={{ flex: 2 }}
                onPress={() => router.push({ pathname: '/log/[id]', params: { id: workout.id } })}
              />
              {workout.date <= now && (
                <Button title="Skip" variant="secondary" style={{ flex: 1 }} loading={skip.isPending} onPress={() => skip.mutate(workout.id)} />
              )}
            </Row>
            {garminConnected && workout.date >= now && !workout.garminSynced && (
              <Button
                title="Send to watch"
                variant="ghost"
                loading={sync.isPending}
                onPress={() =>
                  sync.mutate(Math.min(30, daysBetween(now, workout.date) + 1), {
                    onSuccess: () => Alert.alert('Sent', 'This workout is now on your Garmin calendar.'),
                  })
                }
              />
            )}
          </>
        ) : (
          <Button title={workout.status === 'completed' ? 'Undo completion' : 'Undo skip'} variant="secondary" loading={reset.isPending} onPress={() => reset.mutate(workout.id)} />
        )
      }>
      <Stack.Screen options={{ title: formatDay(workout.date) }} />

      <View style={{ gap: spacing.sm }}>
        <Row>
          <Badge label={workoutLabels[workout.type]} color={color} />
          {workout.garminSynced && <Badge label="On your watch" color="#007CC3" />}
          {workout.status === 'skipped' && <Badge label="Skipped" color="#888" />}
        </Row>
        <T variant="display">{workout.title}</T>
        <T muted>{workout.description}</T>
      </View>

      <Card>
        <Row gap={spacing.lg}>
          <Stat label="Distance" value={formatKm(workout.distanceMeters)} />
          <Stat label="Est. time" value={formatDuration(workout.estDurationSeconds)} />
          <Stat label="Week" value={`${workout.week}`} />
        </Row>
      </Card>

      <ActivitySummary workout={workout} />

      <Card>
        <T variant="heading">Workout steps</T>
        <StepList steps={workout.steps} />
      </Card>

      {isPlanned && workout.type !== 'race' && moveOptions.length > 0 && (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <T variant="heading">Move this session</T>
            <Button title={moving ? 'Cancel' : 'Change day'} variant="ghost" onPress={() => setMoving(!moving)} style={{ paddingVertical: 4, paddingHorizontal: 0 }} />
          </Row>
          {moving && (
            <>
              <T variant="caption" muted>
                If the new day already has a session, the two swap.
              </T>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                {moveOptions.map((d) => (
                  <Chip
                    key={d}
                    label={formatDay(d)}
                    selected={false}
                    onPress={() => move.mutate({ id: workout.id, date: d }, { onSuccess: () => setMoving(false) })}
                  />
                ))}
              </Row>
            </>
          )}
        </Card>
      )}
    </Screen>
  );
}
