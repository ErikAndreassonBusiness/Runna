import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { bearerToken, createSession, deleteSession, hashPassword, requireUser, verifyPassword } from '../auth';
import { newId, nowIso } from '../db';
import type { AppContext } from './context';

const registerBody = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().trim().min(1).max(80),
  password: z.string().min(8).max(200),
});

const loginBody = z.object({
  email: z.string().transform((e) => e.toLowerCase()),
  password: z.string(),
});

interface UserRow {
  id: string;
  email: string;
  name: string;
  password_hash: string;
}

const userDto = (u: UserRow) => ({ id: u.id, email: u.email, name: u.name });

export function authRoutes(app: FastifyInstance, { db, garmin }: AppContext) {
  app.post('/auth/register', async (request, reply) => {
    const body = registerBody.parse(request.body);
    const exists = db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email);
    if (exists) return reply.code(409).send({ error: 'An account with this email already exists' });

    const user: UserRow = { id: newId(), email: body.email, name: body.name, password_hash: hashPassword(body.password) };
    db.prepare('INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(
      user.id,
      user.email,
      user.name,
      user.password_hash,
      nowIso(),
    );
    return reply.code(201).send({ token: createSession(db, user.id), user: userDto(user) });
  });

  app.post('/auth/login', async (request, reply) => {
    const body = loginBody.parse(request.body);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email) as UserRow | undefined;
    if (!user || !verifyPassword(body.password, user.password_hash)) {
      return reply.code(401).send({ error: 'Incorrect email or password' });
    }
    return { token: createSession(db, user.id), user: userDto(user) };
  });

  app.post('/auth/logout', async (request, reply) => {
    const token = bearerToken(request);
    if (token) deleteSession(db, token);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: requireUser(db) }, async (request) => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(request.userId) as unknown as UserRow;
    return { user: userDto(user), garmin: garmin.status(request.userId) };
  });

  app.delete('/me', { preHandler: requireUser(db) }, async (request, reply) => {
    await garmin.disconnect(request.userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(request.userId);
    return reply.code(204).send();
  });
}
