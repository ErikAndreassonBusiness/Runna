import { addDays, today as serverToday } from '@stride/core';
import type { FastifyRequest } from 'fastify';
import type { Config } from '../config';
import type { Db } from '../db';
import type { GarminService } from '../services/garmin';

export interface AppContext {
  db: Db;
  config: Config;
  garmin: GarminService;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The runner's local date. The app sends it in `x-local-date` so time zones are
 * respected; we only trust it within a day of the server's date.
 */
export function requestToday(request: FastifyRequest): string {
  const server = serverToday();
  const header = request.headers['x-local-date'];
  if (typeof header === 'string' && DATE.test(header) && header >= addDays(server, -1) && header <= addDays(server, 1)) {
    return header;
  }
  return server;
}
