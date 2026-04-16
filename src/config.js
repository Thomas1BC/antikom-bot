import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

function parseInteger(value, defaultValue) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR || './data');

export const config = {
  port: parseInteger(process.env.PORT, 3000),
  dataDir,
  stravaClientId: required('STRAVA_CLIENT_ID'),
  stravaClientSecret: required('STRAVA_CLIENT_SECRET'),
  stravaRefreshToken: required('STRAVA_REFRESH_TOKEN'),
  pollIntervalMs: parseInteger(process.env.POLL_INTERVAL_MS, 300000),
  lookbackSeconds: parseInteger(process.env.LOOKBACK_SECONDS, 86400),
  annotateOnlyTypes: (process.env.ANNOTATE_ONLY_TYPES || 'Ride,Run,VirtualRide,GravelRide,MountainBikeRide,TrailRun')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
  adminToken: process.env.ADMIN_TOKEN || '',
  dryRun: parseBoolean(process.env.DRY_RUN, false),
  prependLines: parseBoolean(process.env.PREPEND_LINES, true),
  enableAntiKom: parseBoolean(process.env.ENABLE_ANTIKOM, true),
  enableAntiPr: parseBoolean(process.env.ENABLE_ANTIPR, true)
};
