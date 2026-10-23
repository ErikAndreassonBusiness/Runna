import { formatDuration, parseDuration } from '@stride/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Button, Field, Screen, T } from '@/components/ui';
import { useCompleteWorkout, useWorkout } from '@/lib/queries';

export default function LogRun() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useWorkout(id);
  const complete = useCompleteWorkout();
  const [km, setKm] = useState(workout ? (workout.distanceMeters / 1000).toFixed(1) : '');
  const [time, setTime] = useState(workout ? formatDuration(workout.estDurationSeconds) : '');

  if (!workout) return null;

  const distance = Number(km.replace(',', '.'));
  const seconds = parseDuration(time);
  const valid = distance > 0 && seconds !== null;

  return (
    <Screen header>
      <T variant="title">{workout.title}</T>
      <T muted>No watch, or the run didn’t sync? Enter it here. Your plan adapts the same way.</T>
      <Field label="Distance (km)" value={km} onChangeText={setKm} keyboardType="decimal-pad" />
      <Field
        label="Time (mm:ss or h:mm:ss)"
        value={time}
        onChangeText={setTime}
        keyboardType="numbers-and-punctuation"
        error={time && !seconds ? 'Use a format like 45:30' : undefined}
      />
      <Button
        title="Save run"
        disabled={!valid}
        loading={complete.isPending}
        onPress={() =>
          complete.mutate(
            { id: workout.id, distanceMeters: Math.round(distance * 1000), durationSeconds: seconds! },
            { onSuccess: () => router.back() },
          )
        }
      />
    </Screen>
  );
}
