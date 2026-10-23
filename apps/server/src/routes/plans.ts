import { PlanInputError } from '@stride/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth';
import {
  applyRaceResult,
  createPlan,
  getActivePlan,
  getActivitiesForPlan,
  getPlanEvents,
  getPlanWorkouts,
  planDto,
  workoutDto,
} from '../services/plans';
import { requestToday, type AppContext } from './context';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const weekday = z.number().int().min(0).max(6);

const raceResult = z.object({
  distanceMeters: z.number().positive().max(100_000),
  timeSeconds: z.number().positive().max(24 * 3600),
});

const planBody = z.object({
  goal: z.enum(['5k', '10k', 'half', 'marathon']),
  raceDate: date,
  experience: z.enum(['beginner', 'intermediate', 'advanced']),
  recentRace: raceResult.optional(),
  goalTimeSeconds: z.number().positive().optional(),
  weeklyKm: z.number().min(0).max(250),
  runDays: z.array(weekday).min(2).max(7),
  longRunDay: weekday,
});

export function planRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;
  const auth = { preHandler: requireUser(db) };

  app.post('/plans', auth, async (request, reply) => {
    const body = planBody.parse(request.body);
    try {
      createPlan(db, request.userId, { ...body, startDate: requestToday(request) });
    } catch (err) {
      if (err instanceof PlanInputError) return reply.code(400).send({ error: err.message });
      throw err;
    }
    return reply.code(201).send(activePlanResponse(ctx, request.userId, requestToday(request)));
  });

  app.get('/plans/active', auth, async (request, reply) => {
    const response = activePlanResponse(ctx, request.userId, requestToday(request));
    if (!response) return reply.code(404).send({ error: 'No active plan' });
    return response;
  });

  app.delete('/plans/active', auth, async (request, reply) => {
    db.prepare("UPDATE plans SET status = 'archived' WHERE user_id = ? AND status = 'active'").run(request.userId);
    return reply.code(204).send();
  });

  app.post('/plans/active/race-result', auth, async (request, reply) => {
    const body = raceResult.parse(request.body);
    const plan = getActivePlan(db, request.userId);
    if (!plan) return reply.code(404).send({ error: 'No active plan' });
    const message = applyRaceResult(db, plan, body, requestToday(request));
    return { message, ...activePlanResponse(ctx, request.userId, requestToday(request)) };
  });
}

export function activePlanResponse({ db }: AppContext, userId: string, today: string) {
  const plan = getActivePlan(db, userId);
  if (!plan) return null;
  const activities = getActivitiesForPlan(db, plan.id);
  return {
    plan: planDto(plan, today),
    workouts: getPlanWorkouts(db, plan.id).map((w) => workoutDto(w, activities.get(w.id))),
    events: getPlanEvents(db, plan.id),
  };
}
