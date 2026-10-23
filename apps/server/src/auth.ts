import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { nowIso, type Db } from './db';

const SESSION_DAYS = 90;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltText, hashText] = stored.split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64url');
  const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length);
  return timingSafeEqual(expected, actual);
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function createSession(db: Db, userId: string): string {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    hashToken(token),
    userId,
    nowIso(),
    expires,
  );
  return token;
}

export function deleteSession(db: Db, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export function requireUser(db: Db) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const token = bearerToken(request);
    const row = token
      ? (db
          .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
          .get(hashToken(token)) as { user_id: string; expires_at: string } | undefined)
      : undefined;
    if (!row || row.expires_at < nowIso()) {
      return reply.code(401).send({ error: 'Not signed in' });
    }
    request.userId = row.user_id;
  };
}
