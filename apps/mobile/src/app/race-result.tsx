import { parseDuration, RACE_LABELS, RACE_METERS, type RaceDistance } from '@stride/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';
import { Button, Chip, Field, Row, Screen, T } from '@/components/ui';
import { useRaceResult } from '@/lib/queries';

export default function RaceResult() {
  const save = useRaceResult();
  const [distance, setDistance] = useState<RaceDistance>('5k');
  const [time, setTime] = useState('');
  const seconds = parseDuration(time);

  return (
    <Screen header>
      <T muted>Race or all-out time trial in the last few weeks. Every upcoming pace in your plan will be recalculated.</T>
      <Row>
        {(['5k', '10k', 'half', 'marathon'] as const).map((d) => (
          <Chip key={d} label={RACE_LABELS[d].replace(' Marathon', '')} selected={distance === d} onPress={() => setDistance(d)} style={{ flex: 1, paddingHorizontal: 4 }} />
        ))}
      </Row>
      <Field
        label="Finish time (mm:ss or h:mm:ss)"
        value={time}
        onChangeText={setTime}
        keyboardType="numbers-and-punctuation"
        error={time && !seconds ? 'Use a format like 24:30' : undefined}
      />
      <Button
        title="Update my paces"
        disabled={!seconds}
        loading={save.isPending}
        onPress={() =>
          save.mutate(
            { distanceMeters: RACE_METERS[distance], timeSeconds: seconds! },
            {
              onSuccess: (r) => {
                Alert.alert('Paces updated', r.message);
                router.back();
              },
            },
          )
        }
      />
    </Screen>
  );
}
