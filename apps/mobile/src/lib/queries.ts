import type { RaceResult } from '@stride/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { api, ApiError } from './api';
import { useSession } from './session';
import type { MeResponse, NewPlanInput, PlanResponse, Workout } from './types';

export const queryKeys = {
  me: ['me'] as const,
  plan: ['plan'] as const,
};

export function useMe() {
  const { token } = useSession();
  return useQuery({ queryKey: queryKeys.me, queryFn: () => api<MeResponse>('/me'), enabled: Boolean(token) });
}

export function useActivePlan() {
  const { token } = useSession();
  return useQuery({
    queryKey: queryKeys.plan,
    enabled: Boolean(token),
    queryFn: async () => {
      try {
        return await api<PlanResponse>('/plans/active');
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });
}

export function useWorkout(id: string): Workout | undefined {
  return useActivePlan().data?.workouts.find((w) => w.id === id);
}

/** Show plan-adaptation messages the server returns after an action. */
function announce(messages?: string[]) {
  if (messages && messages.length > 0) Alert.alert('Your plan was updated', messages.join('\n\n'));
}

function showError(err: Error) {
  Alert.alert('Something went wrong', err.message);
}

function useInvalidatingMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (result) => {
      announce((result as { messages?: string[] } | undefined)?.messages);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.plan }),
        queryClient.invalidateQueries({ queryKey: queryKeys.me }),
      ]);
    },
    onError: showError,
  });
}

export const useCreatePlan = () =>
  useInvalidatingMutation((input: NewPlanInput) => api<PlanResponse>('/plans', { method: 'POST', body: input }));

export const useEndPlan = () => useInvalidatingMutation(() => api('/plans/active', { method: 'DELETE' }));

export const useRaceResult = () =>
  useInvalidatingMutation((result: RaceResult) =>
    api<{ message: string }>('/plans/active/race-result', { method: 'POST', body: result }),
  );

export const useCompleteWorkout = () =>
  useInvalidatingMutation(({ id, ...body }: { id: string; distanceMeters?: number; durationSeconds?: number }) =>
    api<{ messages: string[] }>(`/workouts/${id}/complete`, { method: 'POST', body }),
  );

export const useSkipWorkout = () =>
  useInvalidatingMutation((id: string) => api<{ messages: string[] }>(`/workouts/${id}/skip`, { method: 'POST' }));

export const useResetWorkout = () =>
  useInvalidatingMutation((id: string) => api(`/workouts/${id}/reset`, { method: 'POST' }));

export const useMoveWorkout = () =>
  useInvalidatingMutation(({ id, date }: { id: string; date: string }) =>
    api(`/workouts/${id}/move`, { method: 'POST', body: { date } }),
  );

export const useGarminSync = () =>
  useInvalidatingMutation((days: number = 14) =>
    api<{ synced: number; total: number }>('/garmin/sync', { method: 'POST', body: { days } }),
  );

export const useGarminImport = () =>
  useInvalidatingMutation((days: number = 7) =>
    api<{ imported: number; matched: number; messages: string[] }>('/garmin/import', { method: 'POST', body: { days } }),
  );

export const useGarminDisconnect = () => useInvalidatingMutation(() => api('/garmin', { method: 'DELETE' }));

export const useDeleteAccount = () => {
  const { signOut } = useSession();
  return useMutation({
    mutationFn: () => api('/me', { method: 'DELETE' }),
    onSuccess: () => signOut(),
    onError: showError,
  });
};
