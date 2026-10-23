import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Alert } from 'react-native';
import { spacing, useTheme } from '@/constants/theme';
import { connectGarmin } from '@/lib/garmin';
import { queryKeys, useGarminDisconnect, useGarminImport, useGarminSync, useMe } from '@/lib/queries';
import { Badge, Button, Card, Row, T } from './ui';

export function GarminCard({ compact }: { compact?: boolean }) {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const me = useMe();
  const sync = useGarminSync();
  const importRuns = useGarminImport();
  const disconnect = useGarminDisconnect();
  const [connecting, setConnecting] = useState(false);

  const garmin = me.data?.garmin;
  if (!garmin) return null;

  const connect = async () => {
    setConnecting(true);
    try {
      const result = await connectGarmin();
      if (result.status === 'error') Alert.alert('Garmin', result.message);
      if (result.status === 'connected') {
        await queryClient.invalidateQueries({ queryKey: queryKeys.me });
        const synced = await sync.mutateAsync(14);
        Alert.alert('Garmin connected', `${synced.synced} upcoming workouts were sent to your Garmin calendar.`);
      }
    } catch (err) {
      Alert.alert('Garmin', err instanceof Error ? err.message : 'Could not connect');
    } finally {
      setConnecting(false);
    }
  };

  if (!garmin.connected) {
    return (
      <Card>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="heading">Connect Garmin</T>
          {garmin.mode === 'mock' && <Badge label="Simulated" color={theme.textMuted} />}
        </Row>
        <T muted>Send structured workouts with pace targets to your watch and sync your runs back automatically.</T>
        <Button title="Connect Garmin" onPress={connect} loading={connecting} style={{ marginTop: spacing.sm }} />
      </Card>
    );
  }

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="heading">Garmin connected</T>
        <Badge label={garmin.mode === 'mock' ? 'Simulated' : 'Live'} color={theme.success} />
      </Row>
      {!compact && <T muted>The next two weeks of workouts are on your watch. Completed runs sync back to your plan.</T>}
      <Row style={{ marginTop: spacing.sm }}>
        <Button
          title="Sync watch"
          variant="secondary"
          style={{ flex: 1 }}
          loading={sync.isPending}
          onPress={() =>
            sync.mutate(14, {
              onSuccess: (r) =>
                Alert.alert('Synced', r.synced === 0 ? 'Your watch is already up to date.' : `${r.synced} workouts sent to Garmin.`),
            })
          }
        />
        <Button
          title="Import runs"
          variant="secondary"
          style={{ flex: 1 }}
          loading={importRuns.isPending}
          onPress={() =>
            importRuns.mutate(14, {
              onSuccess: (r) => {
                if (r.messages.length === 0) {
                  Alert.alert('Import complete', r.imported === 0 ? 'No new runs found.' : `${r.imported} runs imported, ${r.matched} matched to your plan.`);
                }
              },
            })
          }
        />
      </Row>
      {!compact && (
        <Button
          title="Disconnect Garmin"
          variant="danger"
          loading={disconnect.isPending}
          onPress={() =>
            Alert.alert('Disconnect Garmin?', 'Workouts will no longer sync to your watch.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Disconnect', style: 'destructive', onPress: () => disconnect.mutate() },
            ])
          }
        />
      )}
    </Card>
  );
}
