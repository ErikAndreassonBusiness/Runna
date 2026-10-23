import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { radius, spacing, useTheme } from '@/constants/theme';

type TextVariant = 'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';

const textStyles = StyleSheet.create({
  display: { fontSize: 34, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, lineHeight: 22 },
  label: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  caption: { fontSize: 13, lineHeight: 18 },
});

export function T({
  variant = 'body',
  muted,
  color,
  style,
  children,
  numberOfLines,
}: {
  variant?: TextVariant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[textStyles[variant], { color: color ?? (muted ? theme.textMuted : theme.text) }, style]}>
      {children}
    </Text>
  );
}

/** Scrollable page with safe-area padding. Set `header` when a navigation header is shown. */
export function Screen({
  children,
  header,
  footer,
  contentStyle,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  header?: boolean;
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={theme.accent} /> : undefined}
        contentContainerStyle={[
          {
            padding: spacing.lg,
            // On web the tab bar floats at the top of the page.
            paddingTop: header ? spacing.lg : insets.top + spacing.lg + (Platform.OS === 'web' ? 72 : 0),
            paddingBottom: footer ? spacing.lg : insets.bottom + 100,
            gap: spacing.lg,
          },
          contentStyle,
        ]}>
        {children}
      </ScrollView>
      {footer && (
        <View
          style={{
            padding: spacing.lg,
            paddingBottom: insets.bottom + spacing.lg,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderColor: theme.border,
            backgroundColor: theme.background,
            gap: spacing.sm,
          }}>
          {footer}
        </View>
      )}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const theme = useTheme();
  const base: ViewStyle = {
    backgroundColor: theme.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.border,
  };
  if (!onPress) return <View style={[base, style]}>{children}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [base, style, pressed && { opacity: 0.85 }]}>
      {children}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const colors = {
    primary: { bg: theme.accent, fg: theme.onAccent },
    secondary: { bg: theme.surfaceAlt, fg: theme.text },
    ghost: { bg: 'transparent', fg: theme.accent },
    danger: { bg: 'transparent', fg: theme.danger },
  }[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: colors.bg,
          borderRadius: radius.pill,
          paddingVertical: 15,
          paddingHorizontal: spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.fg} />
      ) : (
        <Text style={{ color: colors.fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        {
          paddingVertical: 10,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: selected ? theme.accent : theme.border,
          backgroundColor: selected ? theme.accentSoft : theme.surface,
          alignItems: 'center',
        },
        style,
      ]}>
      <Text style={{ color: selected ? theme.accent : theme.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** Large selectable option used in onboarding. */
export function Option({
  title,
  subtitle,
  selected,
  onPress,
}: {
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        padding: spacing.lg,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accentSoft : theme.surface,
        gap: 2,
      }}>
      <T variant="heading">{title}</T>
      {subtitle && <T variant="caption" muted>{subtitle}</T>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <T variant="caption" muted>
        {label}
      </T>
      <TextInput
        placeholderTextColor={theme.textMuted}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={{
          color: theme.text,
          fontSize: 17,
          paddingVertical: 14,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          borderWidth: 1.5,
          borderColor: error ? theme.danger : focused ? theme.accent : theme.border,
          backgroundColor: theme.surface,
        }}
      />
      {error && <T variant="caption" color={theme.danger}>{error}</T>}
    </View>
  );
}

export function Stat({ label, value, align = 'left' }: { label: string; value: string; align?: 'left' | 'center' }) {
  return (
    <View style={{ flex: 1, alignItems: align === 'center' ? 'center' : 'flex-start', gap: 2 }}>
      <T variant="heading">{value}</T>
      <T variant="caption" muted>
        {label}
      </T>
    </View>
  );
}

export function Row({ children, gap = spacing.sm, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ backgroundColor: `${color}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' }}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const theme = useTheme();
  return (
    <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
      <View style={{ width: `${Math.min(100, Math.max(0, value * 100))}%`, height: '100%', backgroundColor: color ?? theme.accent }} />
    </View>
  );
}

export function Loading() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
      <ActivityIndicator color={theme.accent} />
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Screen contentStyle={{ flexGrow: 1, justifyContent: 'center' }}>
      <T variant="heading" style={{ textAlign: 'center' }}>
        Couldn’t load your plan
      </T>
      <T muted style={{ textAlign: 'center' }}>
        {message}
      </T>
      <Button title="Try again" onPress={onRetry} />
    </Screen>
  );
}
