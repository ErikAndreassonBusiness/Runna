import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireUser } from '../auth';
import {
  normalizeBatch,
  type GarminActivityDetails,
  type GarminActivitySummary,
} from '../garmin/format';
import { GarminNotConnectedError } from '../services/garmin';
import { requestToday, type AppContext } from './context';

const daysBody = z.object({ days: z.number().int().min(1).max(30).optional() }).default({});

/** App links we are willing to send the browser back to after connecting. */
const RETURN_URL = /^(stride|exp|exps):\/\/|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;
const connectBody = z
  .object({ returnUrl: z.string().regex(RETURN_URL, 'Unsupported return URL').optional() })
  .default({});

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Garmin notification item: push mode carries data, ping mode a callback URL. */
type NotificationItem = (GarminActivitySummary | GarminActivityDetails) & { userId: string; callbackURL?: string };

export function garminRoutes(app: FastifyInstance, { db, config, garmin }: AppContext) {
  const auth = { preHandler: requireUser(db) };

  const handleNotConnected = (err: unknown, reply: FastifyReply) => {
    if (err instanceof GarminNotConnectedError) return reply.code(409).send({ error: err.message });
    throw err;
  };

  app.get('/garmin/status', auth, async (request) => garmin.status(request.userId));

  app.post('/garmin/connect', auth, async (request) => {
    const { returnUrl = config.appRedirectUrl } = connectBody.parse(request.body ?? {});
    // Live Garmin only redirects to the callback registered in the developer portal.
    // The mock uses whatever address the app reached us on, so phones on the LAN work.
    const base = garmin.mode === 'live' ? config.publicUrl : `${request.protocol}://${request.host}`;
    return { url: garmin.beginConnect(request.userId, `${base}/garmin/callback`, returnUrl) };
  });

  /** Garmin redirects the browser here after the user approves (or denies) access. */
  app.get('/garmin/callback', async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const returnUrl = (query.state && garmin.returnUrlFor(query.state)) || config.appRedirectUrl;
    const redirect = (params: Record<string, string>) =>
      reply.redirect(`${returnUrl}${returnUrl.includes('?') ? '&' : '?'}${new URLSearchParams(params)}`);
    if (!query.code || !query.state) return redirect({ status: 'cancelled' });
    try {
      await garmin.completeConnect(query.state, query.code);
      return redirect({ status: 'connected' });
    } catch (err) {
      request.log.warn({ err }, 'Garmin connect failed');
      return redirect({ status: 'error', message: err instanceof Error ? err.message : 'Connection failed' });
    }
  });

  app.delete('/garmin', auth, async (request, reply) => {
    await garmin.disconnect(request.userId);
    return reply.code(204).send();
  });

  app.post('/garmin/sync', auth, async (request, reply) => {
    const { days } = daysBody.parse(request.body ?? {});
    try {
      return await garmin.syncUpcoming(request.userId, requestToday(request), days);
    } catch (err) {
      return handleNotConnected(err, reply);
    }
  });

  app.post('/garmin/import', auth, async (request, reply) => {
    const { days } = daysBody.parse(request.body ?? {});
    try {
      return await garmin.importRecent(request.userId, requestToday(request), days);
    } catch (err) {
      return handleNotConnected(err, reply);
    }
  });

  // --- Webhooks Garmin calls (configure these URLs in the Garmin developer portal) ---

  const checkWebhookToken = (query: unknown, reply: FastifyReply) => {
    if (!config.garmin.webhookSecret) return true;
    if ((query as { token?: string }).token === config.garmin.webhookSecret) return true;
    reply.code(401).send();
    return false;
  };

  app.post('/garmin/webhooks/activities', { bodyLimit: 20 * 1024 * 1024 }, async (request, reply) => {
    if (!checkWebhookToken(request.query, reply)) return;
    const body = (request.body ?? {}) as Record<string, NotificationItem[] | undefined>;
    const summaries = [...(body.activities ?? []), ...(body.manuallyUpdatedActivities ?? [])];
    const details = body.activityDetails ?? [];

    const byUser = new Map<string, { summaries: GarminActivitySummary[]; details: GarminActivityDetails[]; callbacks: string[] }>();
    const bucket = (garminUserId: string) => {
      if (!byUser.has(garminUserId)) byUser.set(garminUserId, { summaries: [], details: [], callbacks: [] });
      return byUser.get(garminUserId)!;
    };
    for (const item of summaries) {
      if (item.callbackURL) bucket(item.userId).callbacks.push(item.callbackURL);
      else bucket(item.userId).summaries.push(item as GarminActivitySummary);
    }
    for (const item of details) {
      if (item.callbackURL) bucket(item.userId).callbacks.push(item.callbackURL);
      else bucket(item.userId).details.push(item as GarminActivityDetails);
    }

    const today = requestToday(request);
    for (const [garminUserId, data] of byUser) {
      const userId = garmin.userForGarminId(garminUserId);
      if (!userId) continue;
      try {
        await garmin.ingestNotification(userId, { activities: normalizeBatch(data.summaries, data.details) }, today);
        for (const callbackUrl of data.callbacks) await garmin.ingestNotification(userId, { callbackUrl }, today);
      } catch (err) {
        // Always acknowledge, otherwise Garmin retries and eventually disables the endpoint.
        request.log.error({ err, garminUserId }, 'Failed to process Garmin activity notification');
      }
    }
    return reply.code(200).send();
  });

  app.post('/garmin/webhooks/deregistrations', async (request, reply) => {
    if (!checkWebhookToken(request.query, reply)) return;
    const body = (request.body ?? {}) as { deregistrations?: { userId: string }[] };
    for (const d of body.deregistrations ?? []) garmin.removeByGarminUser(d.userId);
    return reply.code(200).send();
  });

  // --- Mock Garmin consent screen (GARMIN_MODE=mock only) ---

  if (garmin.mode === 'mock') {
    app.get('/garmin/mock/authorize', async (request, reply) => {
      const { state = '', redirect_uri = '' } = request.query as Record<string, string | undefined>;
      // Only ever send the browser back to our own callback.
      const target = URL.canParse(redirect_uri) ? new URL(redirect_uri) : null;
      if (!target || target.hostname !== request.hostname || target.pathname !== '/garmin/callback') {
        return reply.code(400).send({ error: 'Invalid redirect_uri' });
      }
      const allow = `${redirect_uri}?${new URLSearchParams({ code: 'mock-code', state })}`;
      const deny = `${redirect_uri}?${new URLSearchParams({ state })}`;
      return reply.type('text/html').send(`<!doctype html>
<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Mock Garmin Connect</title>
<style>body{font-family:system-ui;background:#111;color:#eee;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}
.card{max-width:360px;padding:32px;background:#1d1d1f;border-radius:16px;text-align:center}
a{display:block;margin-top:12px;padding:14px;border-radius:10px;text-decoration:none;font-weight:600}
.allow{background:#007cc3;color:#fff}.deny{color:#aaa}</style></head>
<body><div class="card"><h2>Mock Garmin Connect</h2>
<p>Stride would like to send workouts to your Garmin calendar and read your activities.</p>
<p style="color:#888;font-size:13px">This is a simulated consent screen. Set GARMIN_MODE=live to use the real Garmin.</p>
<a class="allow" href="${escapeHtml(allow)}">Allow</a><a class="deny" href="${escapeHtml(deny)}">Deny</a></div></body></html>`);
    });
  }
}
