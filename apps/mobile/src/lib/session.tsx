import { useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { api, setAuthToken, setUnauthorizedHandler } from './api';
import type { AuthResponse } from './types';

const TOKEN_KEY = 'stride.session';

// SecureStore is native-only; fall back to localStorage when running on web.
const storage = {
  get: () => (Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(TOKEN_KEY)) : SecureStore.getItemAsync(TOKEN_KEY)),
  set: (value: string) =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.setItem(TOKEN_KEY, value)) : SecureStore.setItemAsync(TOKEN_KEY, value),
  clear: () => (Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(TOKEN_KEY)) : SecureStore.deleteItemAsync(TOKEN_KEY)),
};

interface Session {
  token: string | null;
  isLoading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const applyToken = useCallback(
    async (next: string | null) => {
      setAuthToken(next);
      if (next) await storage.set(next);
      else {
        await storage.clear();
        queryClient.clear();
      }
      setToken(next);
    },
    [queryClient],
  );

  useEffect(() => {
    storage
      .get()
      .then((saved) => {
        setAuthToken(saved);
        setToken(saved);
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void applyToken(null));
    return () => setUnauthorizedHandler(null);
  }, [applyToken]);

  const session: Session = {
    token,
    isLoading,
    async signIn(email, password) {
      const res = await api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
      await applyToken(res.token);
    },
    async signUp(name, email, password) {
      const res = await api<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password } });
      await applyToken(res.token);
    },
    async signOut() {
      await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      await applyToken(null);
    },
  };

  return <SessionContext value={session}>{children}</SessionContext>;
}

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession must be used inside SessionProvider');
  return session;
}
