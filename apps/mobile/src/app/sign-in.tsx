import { useState } from 'react';
import { Button, Field, Screen, T } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useSession } from '@/lib/session';

export default function SignIn() {
  const theme = useTheme();
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(undefined);
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header>
      <T variant="title">Welcome back</T>
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
      {error && <T color={theme.danger}>{error}</T>}
      <Button title="Sign in" onPress={submit} loading={loading} disabled={!email || !password} />
    </Screen>
  );
}
