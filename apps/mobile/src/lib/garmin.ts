import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { api } from './api';

export type ConnectResult = { status: 'connected' } | { status: 'cancelled' } | { status: 'error'; message: string };

/**
 * Garmin OAuth: the server builds the authorisation URL (PKCE lives server-side),
 * we open it in an auth browser session and wait for the redirect back into the app.
 */
export async function connectGarmin(): Promise<ConnectResult> {
  const returnUrl = Linking.createURL('garmin');
  const { url } = await api<{ url: string }>('/garmin/connect', { method: 'POST', body: { returnUrl } });
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl);
  if (result.type !== 'success') return { status: 'cancelled' };

  const { queryParams } = Linking.parse(result.url);
  if (queryParams?.status === 'connected') return { status: 'connected' };
  if (queryParams?.status === 'error') {
    return { status: 'error', message: String(queryParams.message ?? 'Could not connect to Garmin') };
  }
  return { status: 'cancelled' };
}
