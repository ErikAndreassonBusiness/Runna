import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth';
import { transaction } from '../db';
import { logManualActivity, resetWorkout } from '../services/activities';
import { getActivity, runAdaptation, workoutDto, type WorkoutRow } from '../services/plans';
import { requestToday, type AppContext } from './context';

const params = z.object({ id: z.string() });

const completeBody = z
  .object({
    distanceMeters: z.number().positive().max(200_000).optional(),
    durationSeconds: z.number().positive().max(48 * 3600).optional(),
  })
  .default({});

const moveBody = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

export function workoutRoutes(app: FastifyInstance, { db, garmin }: AppContext) {
  const auth = { preHandler: requireUser(db) };

  const load = (userId: string, id: string, reply: FastifyReply): WorkoutRow | null => {
    const row = db
      .prepare(
        `SELECT w.* FROM workouts w JOIN plans p ON p.id = w.plan_id
         WHERE w.id = ? AND w.user_id = ? AND p.status = 'active'`,
      )
      .get(id, userId) as WorkoutRow | undefined;
    if (!row) {
      reply.code(404).send({ error: 'Workout not found' });
      return null;
    }
    return row;
  };

  const dto = (id: string) => {
    const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id) as unknown as WorkoutRow;
    return workoutDto(row, row.activity_id ? getActivity(db, row.activity_id) : undefined);
  };

  app.get('/workouts/:id', auth, async (request, reply) => {
    const w = load(request.userId, params.parse(request.params).id, reply);
    return w && dto(w.id);
  });

  app.post('/workouts/:id/complete', auth, async (request, reply) => {
    const w = load(request.userId, params.parse(request.params).id, reply);
    if (!w) return;
    if (w.status === 'completed') return reply.code(409).send({ error: 'Workout already completed' });
    const body = completeBody.parse(request.body ?? {});
    logManualActivity(db, request.userId, w, body.distanceMeters ?? w.distance_m, body.durationSeconds ?? w.est_duration_s);
    const messages = runAdaptation(db, request.userId, requestToday(request));
    return { workout: dto(w.id), messages };
  });

  app.post('/workouts/:id/skip', auth, async (request, reply) => {
    const w = load(request.userId, params.parse(request.params).id, reply);
    if (!w) return;
    if (w.status === 'completed') return reply.code(409).send({ error: 'Undo completion first' });
    db.prepare("UPDATE workouts SET status = 'skipped' WHERE id = ?").run(w.id);
    const messages = runAdaptation(db, request.userId, requestToday(request));
    return { workout: dto(w.id), messages };
  });

  app.post('/workouts/:id/reset', auth, async (request, reply) => {
    const w = load(request.userId, params.parse(request.params).id, reply);
    if (!w) return;
    resetWorkout(db, w);
    return { workout: dto(w.id) };
  });

  /** Move a workout to another day; if that day has a planned workout, they swap. */
  app.post('/workouts/:id/move', auth, async (request, reply) => {
    const w = load(request.userId, params.parse(request.params).id, reply);
    if (!w) return;
    const { date } = moveBody.parse(request.body);
    const today = requestToday(request);
    if (w.type === 'race') return reply.code(400).send({ error: 'Race day cannot be moved' });
    if (w.status !== 'planned') return reply.code(400).send({ error: 'Only planned workouts can be moved' });
    if (date < today) return reply.code(400).send({ error: 'Cannot move a workout into the past' });

    const lastDate = (db.prepare('SELECT MAX(date) AS d FROM workouts WHERE plan_id = ?').get(w.plan_id) as { d: string }).d;
    if (date > lastDate) return reply.code(400).send({ error: 'Cannot move a workout past race day' });

    const other = db
      .prepare('SELECT * FROM workouts WHERE plan_id = ? AND date = ? AND id != ?')
      .get(w.plan_id, date, w.id) as WorkoutRow | undefined;
    if (other && (other.status !== 'planned' || other.type === 'race')) {
      return reply.code(409).send({ error: 'That day already has a workout that cannot be swapped' });
    }
    transaction(db, () => {
      db.prepare('UPDATE workouts SET date = ? WHERE id = ?').run(date, w.id);
      if (other) db.prepare('UPDATE workouts SET date = ? WHERE id = ?').run(w.date, other.id);
    });

    // Keep the watch calendar in step when already connected.
    if (garmin.status(request.userId).connected) {
      const moved = [w.id, other?.id].filter((id): id is string => Boolean(id));
      for (const id of moved) {
        const row = db.prepare('SELECT * FROM workouts WHERE id = ?').get(id) as unknown as WorkoutRow;
        if (row.garmin_workout_id) await garmin.syncWorkout(request.userId, row).catch(() => undefined);
      }
    }
    return { workout: dto(w.id) };
  });
}
