import { useQueryClient } from '@tanstack/react-query';
import { Redirect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect } from 'react';
import { queryKeys } from '@/lib/queries';

// On web the Garmin flow runs in a popup that lands here; hand the result back to the opener.
WebBrowser.maybeCompleteAuthSession();

/**
 * Landing route for the `stride://garmin?status=…` deep link. Normally the auth
 * session captures it, but if the OS opens the app directly we still refresh.
 */
export default function GarminReturn() {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.me });
  }, [queryClient]);
  return <Redirect href="/profile" />;
}
