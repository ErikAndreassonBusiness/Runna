import { useState } from 'react';
import { Button, Field, Screen, T } from '@/components/ui';
import { useTheme } from '@/constants/theme';
import { useSession } from '@/lib/session';

export default function SignUp() {
  const theme = useTheme();
  const { signUp } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  const passwordTooShort = password.length > 0 && password.length < 8;

  const submit = async () => {
    setError(undefined);
    setLoading(true);
    try {
      await signUp(name.trim(), email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen header>
      <T variant="title">Create your account</T>
      <T muted>Free, forever. Then we’ll build your plan.</T>
      <Field label="First name" value={name} onChangeText={setName} autoComplete="given-name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <Field
        label="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoComplete="new-password"
        error={passwordTooShort ? 'At least 8 characters' : undefined}
      />
      {error && <T color={theme.danger}>{error}</T>}
      <Button title="Continue" onPress={submit} loading={loading} disabled={!name || !email || password.length < 8} />
    </Screen>
  );
}
