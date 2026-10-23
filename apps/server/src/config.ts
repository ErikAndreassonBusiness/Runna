try {
  process.loadEnvFile('.env');
} catch {
  // No .env file — rely on the real environment.
}

const port = Number(process.env.PORT ?? 4000);

export interface Config {
  port: number;
  publicUrl: string;
  dbPath: string;
  appRedirectUrl: string;
  garmin: {
    mode: 'mock' | 'live';
    clientId: string;
    clientSecret: string;
    /** Optional shared secret Garmin must send as ?token= on webhook calls. */
    webhookSecret: string;
  };
}

export const config: Config = {
  port,
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  dbPath: process.env.DATABASE_PATH ?? 'stride.db',
  appRedirectUrl: process.env.APP_REDIRECT_URL ?? 'stride://garmin',
  garmin: {
    mode: process.env.GARMIN_MODE === 'live' ? 'live' : 'mock',
    clientId: process.env.GARMIN_CLIENT_ID ?? '',
    clientSecret: process.env.GARMIN_CLIENT_SECRET ?? '',
    webhookSecret: process.env.GARMIN_WEBHOOK_SECRET ?? '',
  },
};
