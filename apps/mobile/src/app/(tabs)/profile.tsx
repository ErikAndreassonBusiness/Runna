import { router } from 'expo-router';
import { Alert, View } from 'react-native';
import { GarminCard } from '@/components/garmin-card';
import { Button, Card, Screen, T } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { API_URL } from '@/lib/api';
import { useDeleteAccount, useEndPlan, useMe } from '@/lib/queries';
import { useSession } from '@/lib/session';

export default function Profile() {
  const { signOut } = useSession();
  const me = useMe();
  const endPlan = useEndPlan();
  const deleteAccount = useDeleteAccount();

  return (
    <Screen>
      <View style={{ gap: spacing.xs }}>
        <T variant="display">{me.data?.user.name ?? 'Profile'}</T>
        <T muted>{me.data?.user.email}</T>
      </View>

      <GarminCard />

      <Card>
        <T variant="heading">Your plan</T>
        <T muted>Ran a race or time trial recently? Log it and we’ll recalibrate every upcoming pace.</T>
        <Button title="Log a race result" variant="secondary" onPress={() => router.push('/race-result')} />
        <Button
          title="Start a new plan"
          variant="ghost"
          loading={endPlan.isPending}
          onPress={() =>
            Alert.alert('Start a new plan?', 'Your current plan will be archived. Your run history is kept.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Start over', style: 'destructive', onPress: () => endPlan.mutate() },
            ])
          }
        />
      </Card>

      <Card>
        <T variant="heading">Account</T>
        <Button title="Sign out" variant="secondary" onPress={signOut} />
        <Button
          title="Delete account"
          variant="danger"
          loading={deleteAccount.isPending}
          onPress={() =>
            Alert.alert('Delete your account?', 'This permanently deletes your plans, runs and Garmin connection.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteAccount.mutate() },
            ])
          }
        />
      </Card>

      {__DEV__ && (
        <T variant="caption" muted style={{ textAlign: 'center' }}>
          API: {API_URL}
        </T>
      )}
    </Screen>
  );
}
