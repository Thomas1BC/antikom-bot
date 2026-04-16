import { getActivity, getRecentActivities, getSegment, refreshAccessToken, updateActivity } from './strava.js';
import { errorLog, log } from './logger.js';

function secondsToHuman(seconds) {
  return `${Math.round(seconds)}`;
}

function sanitizeDescription(description) {
  return (description || '')
    .split(/\r?\n/)
    .filter((line) => !/^AntiKOM\s*:|^AntiPR\s*:/i.test(line.trim()))
    .join('\n')
    .trim();
}

function mergeDescription(existingDescription, antiLines, prependLines) {
  const cleaned = sanitizeDescription(existingDescription);
  const block = antiLines.join('\n').trim();
  if (!cleaned) return block;
  if (!block) return cleaned;
  return prependLines ? `${block}\n\n${cleaned}` : `${cleaned}\n\n${block}`;
}

function isInterestingType(activity, allowedTypes) {
  const type = activity.sport_type || activity.type;
  return allowedTypes.includes(type);
}

function bestManualKomCandidate(efforts, manualKoms) {
  let best = null;

  for (const effort of efforts) {
    const segmentId = String(effort?.segment?.id || '');
    const entry = manualKoms[segmentId];
    if (!entry || !Number.isFinite(entry.elapsed_time)) continue;
    const delta = effort.elapsed_time - entry.elapsed_time;
    if (!best || delta > best.delta) {
      best = {
        segmentId,
        segmentName: effort.name || entry.name || effort?.segment?.name || 'Segment inconnu',
        delta,
        komElapsedTime: entry.elapsed_time,
        effortElapsedTime: effort.elapsed_time
      };
    }
  }

  return best;
}

async function getSegmentPrData(accessToken, efforts) {
  const cache = new Map();

  for (const effort of efforts) {
    const segmentId = effort?.segment?.id;
    if (!segmentId || cache.has(segmentId)) continue;
    try {
      const segment = await getSegment(accessToken, segmentId);
      cache.set(segmentId, segment);
    } catch (err) {
      cache.set(segmentId, { __error: err?.response?.data || err.message || 'unknown_error' });
    }
  }

  return cache;
}

function bestPersonalGapCandidate(efforts, segmentCache) {
  let best = null;

  for (const effort of efforts) {
    const segmentId = effort?.segment?.id;
    const segment = segmentCache.get(segmentId);
    const prSeconds = segment?.athlete_segment_stats?.pr_elapsed_time || segment?.athlete_pr_effort?.pr_elapsed_time;
    if (!Number.isFinite(prSeconds)) continue;

    const delta = effort.elapsed_time - prSeconds;
    if (!best || delta > best.delta) {
      best = {
        segmentId: String(segmentId),
        segmentName: effort.name || effort?.segment?.name || segment?.name || 'Segment inconnu',
        delta,
        prElapsedTime: prSeconds,
        effortElapsedTime: effort.elapsed_time
      };
    }
  }

  return best;
}

async function ensureFreshAccessToken(store, config) {
  const state = await store.readState();
  const nowSeconds = Math.floor(Date.now() / 1000);
  const oauth = state.oauth;

  if (oauth.accessToken && oauth.expiresAt && oauth.expiresAt - 120 > nowSeconds) {
    return oauth.accessToken;
  }

  const tokenData = await refreshAccessToken({
    clientId: config.stravaClientId,
    clientSecret: config.stravaClientSecret,
    refreshToken: oauth.refreshToken || config.stravaRefreshToken
  });

  await store.updateState((draft) => {
    draft.oauth.refreshToken = tokenData.refresh_token;
    draft.oauth.accessToken = tokenData.access_token;
    draft.oauth.expiresAt = tokenData.expires_at;
    draft.oauth.athleteId = tokenData.athlete?.id || draft.oauth.athleteId;
    draft.oauth.scope = tokenData.scope || draft.oauth.scope;
    return draft;
  });

  return tokenData.access_token;
}

async function annotateActivity(store, config, accessToken, activityId) {
  const activity = await getActivity(accessToken, activityId);
  const activityType = activity.sport_type || activity.type;

  if (!isInterestingType(activity, config.annotateOnlyTypes)) {
    log(`Skipping activity ${activityId}: unsupported type ${activityType}`);
    return { skipped: true, reason: 'unsupported_type', activityId, activityType };
  }

  const efforts = (activity.segment_efforts || []).filter((effort) => !effort.hidden && effort.segment?.id && Number.isFinite(effort.elapsed_time));
  if (!efforts.length) {
    log(`Skipping activity ${activityId}: no segment efforts`);
    return { skipped: true, reason: 'no_segment_efforts', activityId, activityType };
  }

  const manualKoms = await store.readManualKoms();
  const antiKom = config.enableAntiKom ? bestManualKomCandidate(efforts, manualKoms) : null;

  let antiPr = null;
  if (config.enableAntiPr) {
    const segmentCache = await getSegmentPrData(accessToken, efforts);
    antiPr = bestPersonalGapCandidate(efforts, segmentCache);
  }

  const lines = [];
  if (antiKom) {
    lines.push(`AntiKOM : "${antiKom.segmentName}" à ${secondsToHuman(antiKom.delta)} secondes du KOM`);
  }
  if (antiPr) {
    lines.push(`AntiPR : "${antiPr.segmentName}" à ${secondsToHuman(antiPr.delta)} secondes de ton PR`);
  }

  if (!lines.length) {
    log(`Skipping activity ${activityId}: no AntiKOM/AntiPR candidate available`);
    return { skipped: true, reason: 'no_candidates', activityId, activityType };
  }

  const nextDescription = mergeDescription(activity.description, lines, config.prependLines);

  if (config.dryRun) {
    log(`DRY_RUN activity ${activityId} -> ${nextDescription}`);
    return {
      updated: false,
      dryRun: true,
      activityId,
      description: nextDescription,
      antiKom,
      antiPr
    };
  }

  await updateActivity(accessToken, activityId, nextDescription);
  log(`Updated activity ${activityId}`);

  return {
    updated: true,
    activityId,
    description: nextDescription,
    antiKom,
    antiPr
  };
}

export function createScanner({ store, config }) {
  let scanning = false;

  return {
    async scan({ forceActivityId = null } = {}) {
      if (scanning) {
        return { skipped: true, reason: 'scan_already_running' };
      }

      scanning = true;
      await store.updateState((draft) => {
        draft.scanner.lastScanStartedAt = Date.now();
        return draft;
      });

      try {
        const accessToken = await ensureFreshAccessToken(store, config);
        const results = [];

        if (forceActivityId) {
          const result = await annotateActivity(store, config, accessToken, forceActivityId);
          results.push(result);
          return { ok: true, forced: true, results };
        }

        const state = await store.readState();
        const lastSuccessfulMs = state.scanner.lastSuccessfulScanAt || 0;
        const fallbackAfterSeconds = Math.floor(Date.now() / 1000) - config.lookbackSeconds;
        const afterSeconds = Math.max(fallbackAfterSeconds, Math.floor(lastSuccessfulMs / 1000) - 60);
        const activities = await getRecentActivities(accessToken, { after: afterSeconds, perPage: 30 });

        for (const activity of activities) {
          const activityId = String(activity.id);
          if (state.scanner.processedActivityIds[activityId]) {
            continue;
          }

          try {
            const result = await annotateActivity(store, config, accessToken, activity.id);
            results.push(result);
            await store.updateState((draft) => {
              draft.scanner.processedActivityIds[activityId] = Date.now();
              return draft;
            });
          } catch (err) {
            errorLog(`Failed to process activity ${activity.id}`, err?.response?.data || err.stack || err.message);
          }
        }

        await store.updateState((draft) => {
          draft.scanner.lastSuccessfulScanAt = Date.now();
          draft.scanner.lastScanFinishedAt = Date.now();
          const entries = Object.entries(draft.scanner.processedActivityIds);
          if (entries.length > 1000) {
            entries
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(1000)
              .forEach(([activityId]) => {
                delete draft.scanner.processedActivityIds[activityId];
              });
          }
          return draft;
        });

        return { ok: true, forced: false, count: results.length, results };
      } finally {
        scanning = false;
      }
    }
  };
}
