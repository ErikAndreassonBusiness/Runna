import cors from '@fastify/cors';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import type { Config } from './config';
import type { Db } from './db';
import { LiveGarminProvider } from './garmin/live';
import { MockGarminProvider } from './garmin/mock';
import type { GarminProvider } from './garmin/provider';
import { authRoutes } from './routes/auth';
import type { AppContext } from './routes/context';
import { garminRoutes } from './routes/garmin';
import { planRoutes } from './routes/plans';
import { workoutRoutes } from './routes/workouts';
import { GarminService } from './services/garmin';

export function createGarminProvider(config: Config, db: Db): GarminProvider {
  return config.garmin.mode === 'live'
    ? new LiveGarminProvider(config.garmin.clientId, config.garmin.clientSecret)
    : new MockGarminProvider(db, config.publicUrl);
}

export async function buildApp(config: Config, db: Db, provider = createGarminProvider(config, db)) {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err, request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) request.log.error(err);
    return reply.code(status).send({ error: status >= 500 ? 'Something went wrong' : (err as Error).message });
  });

  const ctx: AppContext = {
    db,
    config,
    garmin: new GarminService(db, provider),
  };

  app.get('/health', async () => ({ ok: true, garmin: provider.mode }));
  authRoutes(app, ctx);
  planRoutes(app, ctx);
  workoutRoutes(app, ctx);
  garminRoutes(app, ctx);
  return app;
}
