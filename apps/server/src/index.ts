import { buildApp } from './app';
import { config } from './config';
import { openDb } from './db';

const db = openDb(config.dbPath);
const app = await buildApp(config, db);

await app.listen({ port: config.port, host: '0.0.0.0' });
app.log.info(`Garmin integration running in ${config.garmin.mode} mode`);
