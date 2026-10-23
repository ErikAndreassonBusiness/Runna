import { addDays, formatDate, parseDate, weekday } from '@stride/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { radius, spacing, useTheme, WEEKDAYS } from '@/constants/theme';
import { monthLabel } from '@/lib/format';
import { Row, T } from './ui';

/** Month grid date picker limited to [min, max]. */
export function CalendarPicker({
  value,
  onChange,
  min,
  max,
}: {
  value: string | null;
  onChange: (date: string) => void;
  min: string;
  max: string;
}) {
  const theme = useTheme();
  const initial = parseDate(value ?? min);
  const [cursor, setCursor] = useState({ year: initial.getUTCFullYear(), month: initial.getUTCMonth() });

  const first = formatDate(new Date(Date.UTC(cursor.year, cursor.month, 1)));
  const gridStart = addDays(first, -weekday(first));
  const cells = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));

  const shift = (delta: number) => {
    const d = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const canPrev = formatDate(new Date(Date.UTC(cursor.year, cursor.month, 0))) >= min;
  const canNext = formatDate(new Date(Date.UTC(cursor.year, cursor.month + 1, 1))) <= max;

  return (
    <View style={{ gap: spacing.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable disabled={!canPrev} onPress={() => shift(-1)} hitSlop={12} style={{ opacity: canPrev ? 1 : 0.3 }}>
          <T variant="heading">‹</T>
        </Pressable>
        <T variant="heading">{monthLabel(cursor.year, cursor.month)}</T>
        <Pressable disabled={!canNext} onPress={() => shift(1)} hitSlop={12} style={{ opacity: canNext ? 1 : 0.3 }}>
          <T variant="heading">›</T>
        </Pressable>
      </Row>
      <Row gap={0}>
        {WEEKDAYS.map((d) => (
          <T key={d} variant="caption" muted style={{ flex: 1, textAlign: 'center' }}>
            {d[0]}
          </T>
        ))}
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {cells.map((date) => {
          const inMonth = parseDate(date).getUTCMonth() === cursor.month;
          const enabled = inMonth && date >= min && date <= max;
          const selected = date === value;
          return (
            <Pressable
              key={date}
              disabled={!enabled}
              onPress={() => onChange(date)}
              style={{ width: `${100 / 7}%`, aspectRatio: 1, padding: 2 }}>
              <View
                style={{
                  flex: 1,
                  borderRadius: radius.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: selected ? theme.accent : 'transparent',
                }}>
                <T
                  color={selected ? theme.onAccent : enabled ? theme.text : theme.border}
                  style={{ fontWeight: selected ? '800' : '500', opacity: inMonth ? 1 : 0 }}>
                  {parseDate(date).getUTCDate()}
                </T>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
