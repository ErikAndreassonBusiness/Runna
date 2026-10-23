import {
  addDays,
  daysBetween,
  formatDuration,
  MAX_PLAN_WEEKS,
  parseDuration,
  planWeekCount,
  predictRaceSeconds,
  RACE_LABELS,
  RACE_METERS,
  startOfWeek,
  today,
  vdotFromRace,
  type Experience,
  type RaceDistance,
} from '@stride/core';
import { useState, type ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { CalendarPicker } from '@/components/calendar';
import { Button, Card, Chip, Field, Option, ProgressBar, Row, Screen, T } from '@/components/ui';
import { spacing, useTheme, WEEKDAYS } from '@/constants/theme';
import { formatLongDate } from '@/lib/format';
import { useCreatePlan } from '@/lib/queries';
import { useSession } from '@/lib/session';

const GOALS: { value: RaceDistance; subtitle: string }[] = [
  { value: '5k', subtitle: 'Get faster over 5 kilometres' },
  { value: '10k', subtitle: 'Build speed and endurance' },
  { value: 'half', subtitle: '21.1 km — the perfect challenge' },
  { value: 'marathon', subtitle: '42.2 km — go the distance' },
];

const EXPERIENCE: { value: Experience; title: string; subtitle: string }[] = [
  { value: 'beginner', title: 'New to running', subtitle: 'Running for less than a year or getting back into it' },
  { value: 'intermediate', title: 'Regular runner', subtitle: 'Running consistently and have done a few races' },
  { value: 'advanced', title: 'Experienced', subtitle: 'Years of structured training and racing' },
];

const STEPS = ['Goal', 'Race date', 'Experience', 'Fitness', 'Volume', 'Schedule', 'Review'];

export default function Onboarding() {
  const theme = useTheme();
  const { signOut } = useSession();
  const createPlan = useCreatePlan();
  const now = today();

  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState<RaceDistance>('10k');
  const [raceDate, setRaceDate] = useState<string | null>(null);
  const [experience, setExperience] = useState<Experience>('intermediate');
  const [hasRace, setHasRace] = useState(true);
  const [raceDistance, setRaceDistance] = useState<RaceDistance>('5k');
  const [raceTime, setRaceTime] = useState('');
  const [goalTime, setGoalTime] = useState('');
  const [weeklyKm, setWeeklyKm] = useState(20);
  const [runDays, setRunDays] = useState<number[]>([1, 3, 6]);
  const [longRunDay, setLongRunDay] = useState(6);

  const minDate = addDays(now, 14);
  const maxDate = addDays(startOfWeek(now), MAX_PLAN_WEEKS * 7 - 1);
  const raceSeconds = parseDuration(raceTime);
  const goalSeconds = goalTime ? parseDuration(goalTime) : null;
  const predicted =
    hasRace && raceSeconds
      ? predictRaceSeconds(vdotFromRace(RACE_METERS[raceDistance], raceSeconds), RACE_METERS[goal])
      : null;

  const toggleDay = (d: number) => {
    const next = runDays.includes(d) ? runDays.filter((x) => x !== d) : [...runDays, d].sort();
    setRunDays(next);
    if (!next.includes(longRunDay) && next.length > 0) setLongRunDay(next[next.length - 1]);
  };

  const canContinue = [
    true,
    raceDate !== null,
    true,
    (!hasRace || raceSeconds !== null) && (!goalTime || goalSeconds !== null),
    true,
    runDays.length >= 2 && runDays.includes(longRunDay),
    true,
  ][step];

  const submit = () =>
    createPlan.mutate({
      goal,
      raceDate: raceDate!,
      experience,
      recentRace: hasRace && raceSeconds ? { distanceMeters: RACE_METERS[raceDistance], timeSeconds: raceSeconds } : undefined,
      goalTimeSeconds: goalSeconds ?? undefined,
      weeklyKm,
      runDays,
      longRunDay,
    });

  const pages: ReactNode[] = [
    <Section key="goal" title="What are you training for?">
      {GOALS.map((g) => (
        <Option key={g.value} title={RACE_LABELS[g.value]} subtitle={g.subtitle} selected={goal === g.value} onPress={() => setGoal(g.value)} />
      ))}
    </Section>,

    <Section key="date" title="When is race day?" subtitle="Plans run from 3 to 30 weeks.">
      <Card>
        <CalendarPicker value={raceDate} onChange={setRaceDate} min={minDate} max={maxDate} />
      </Card>
      {raceDate && (
        <T muted style={{ textAlign: 'center' }}>
          {formatLongDate(raceDate)} · {planWeekCount(now, raceDate)} weeks of training · {daysBetween(now, raceDate)} days to go
        </T>
      )}
    </Section>,

    <Section key="exp" title="How would you describe your running?">
      {EXPERIENCE.map((e) => (
        <Option key={e.value} title={e.title} subtitle={e.subtitle} selected={experience === e.value} onPress={() => setExperience(e.value)} />
      ))}
    </Section>,

    <Section key="fitness" title="Your current fitness" subtitle="A recent race or time trial lets us set your paces precisely.">
      <Row>
        <Chip label="I have a recent time" selected={hasRace} onPress={() => setHasRace(true)} style={{ flex: 1 }} />
        <Chip label="Not sure" selected={!hasRace} onPress={() => setHasRace(false)} style={{ flex: 1 }} />
      </Row>
      {hasRace ? (
        <>
          <Row>
            {(['5k', '10k', 'half', 'marathon'] as const).map((d) => (
              <Chip key={d} label={RACE_LABELS[d].replace(' Marathon', '')} selected={raceDistance === d} onPress={() => setRaceDistance(d)} style={{ flex: 1, paddingHorizontal: 4 }} />
            ))}
          </Row>
          <Field
            label="Finish time (mm:ss or h:mm:ss)"
            placeholder={raceDistance === '5k' ? '25:00' : raceDistance === '10k' ? '52:00' : raceDistance === 'half' ? '1:55:00' : '4:00:00'}
            value={raceTime}
            onChangeText={setRaceTime}
            keyboardType="numbers-and-punctuation"
            error={raceTime && !raceSeconds ? 'Use a format like 25:30' : undefined}
          />
        </>
      ) : (
        <Card>
          <T muted>No problem — we’ll start you at a comfortable level based on your experience, and adjust your paces as your runs come in.</T>
        </Card>
      )}
      <Field
        label={`Goal ${RACE_LABELS[goal]} time (optional)`}
        placeholder={predicted ? formatDuration(predicted) : 'e.g. 1:45:00'}
        value={goalTime}
        onChangeText={setGoalTime}
        keyboardType="numbers-and-punctuation"
        error={goalTime && !goalSeconds ? 'Use a format like 1:45:00' : undefined}
      />
      {predicted && (
        <T variant="caption" muted>
          Based on your time, you could run a {RACE_LABELS[goal]} in about {formatDuration(predicted)} today.
        </T>
      )}
    </Section>,

    <Section key="volume" title="How much do you run now?" subtitle="Your average weekly distance over the last month.">
      <Card style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <Row gap={spacing.xl}>
          <Stepper label="−" onPress={() => setWeeklyKm(Math.max(0, weeklyKm - 5))} />
          <View style={{ alignItems: 'center', minWidth: 100 }}>
            <T variant="display">{weeklyKm}</T>
            <T muted>km / week</T>
          </View>
          <Stepper label="+" onPress={() => setWeeklyKm(Math.min(150, weeklyKm + 5))} />
        </Row>
      </Card>
    </Section>,

    <Section key="days" title="Which days can you run?" subtitle="Pick at least 2. More days means more easy running.">
      <Row gap={6}>
        {WEEKDAYS.map((d, i) => (
          <Chip key={d} label={d.slice(0, 2)} selected={runDays.includes(i)} onPress={() => toggleDay(i)} style={{ flex: 1, paddingHorizontal: 0 }} />
        ))}
      </Row>
      <T variant="heading" style={{ marginTop: spacing.md }}>
        Long run day
      </T>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {runDays.map((i) => (
          <Chip key={i} label={WEEKDAYS[i]} selected={longRunDay === i} onPress={() => setLongRunDay(i)} />
        ))}
      </Row>
    </Section>,

    <Section key="review" title="Ready to build your plan">
      <Card>
        <ReviewRow label="Goal" value={RACE_LABELS[goal]} />
        <ReviewRow label="Race day" value={raceDate ? formatLongDate(raceDate) : '—'} />
        <ReviewRow label="Plan length" value={raceDate ? `${planWeekCount(now, raceDate)} weeks` : '—'} />
        <ReviewRow label="Current fitness" value={hasRace && raceSeconds ? `${RACE_LABELS[raceDistance]} in ${formatDuration(raceSeconds)}` : 'Estimated'} />
        {goalSeconds && <ReviewRow label="Goal time" value={formatDuration(goalSeconds)} />}
        <ReviewRow label="Weekly distance" value={`${weeklyKm} km`} />
        <ReviewRow label="Runs per week" value={`${runDays.length} (long run ${WEEKDAYS[longRunDay]})`} />
      </Card>
    </Section>,
  ];

  return (
    <Screen
      footer={
        <Row>
          {step > 0 && <Button title="Back" variant="secondary" onPress={() => setStep(step - 1)} style={{ flex: 1 }} />}
          {step < STEPS.length - 1 ? (
            <Button title="Continue" onPress={() => setStep(step + 1)} disabled={!canContinue} style={{ flex: 2 }} />
          ) : (
            <Button title="Build my plan" onPress={submit} loading={createPlan.isPending} style={{ flex: 2 }} />
          )}
        </Row>
      }>
      <Row style={{ justifyContent: 'space-between' }}>
        <T variant="label" color={theme.accent}>
          {STEPS[step]} · {step + 1}/{STEPS.length}
        </T>
        {step === 0 && (
          <Pressable onPress={signOut} hitSlop={8}>
            <T variant="caption" muted>
              Sign out
            </T>
          </Pressable>
        )}
      </Row>
      <ProgressBar value={(step + 1) / STEPS.length} />
      {pages[step]}
    </Screen>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: spacing.xs, marginBottom: spacing.sm }}>
        <T variant="title">{title}</T>
        {subtitle && <T muted>{subtitle}</T>}
      </View>
      {children}
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: theme.surfaceAlt,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.7 : 1,
      })}>
      <T variant="title">{label}</T>
    </Pressable>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
      <T muted>{label}</T>
      <T style={{ fontWeight: '700' }}>{value}</T>
    </Row>
  );
}
