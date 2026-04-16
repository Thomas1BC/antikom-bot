import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE = {
  oauth: {
    refreshToken: null,
    accessToken: null,
    expiresAt: 0,
    athleteId: null,
    scope: null
  },
  scanner: {
    lastScanStartedAt: 0,
    lastScanFinishedAt: 0,
    lastSuccessfulScanAt: 0,
    processedActivityIds: {}
  }
};

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

export class JsonStore {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.statePath = path.join(dataDir, 'state.json');
    this.manualKomsPath = path.join(dataDir, 'manual-koms.json');
    this._writePromise = Promise.resolve();
  }

  async init(initialRefreshToken) {
    await ensureDir(this.dataDir);
    try {
      await fs.access(this.statePath);
    } catch {
      const initialState = structuredClone(DEFAULT_STATE);
      initialState.oauth.refreshToken = initialRefreshToken;
      await fs.writeFile(this.statePath, JSON.stringify(initialState, null, 2));
    }

    try {
      await fs.access(this.manualKomsPath);
    } catch {
      await fs.writeFile(this.manualKomsPath, JSON.stringify({}, null, 2));
    }
  }

  async readState() {
    const raw = await fs.readFile(this.statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      oauth: {
        ...structuredClone(DEFAULT_STATE.oauth),
        ...(parsed.oauth || {})
      },
      scanner: {
        ...structuredClone(DEFAULT_STATE.scanner),
        ...(parsed.scanner || {})
      }
    };
  }

  async updateState(mutator) {
    this._writePromise = this._writePromise.then(async () => {
      const state = await this.readState();
      const nextState = await mutator(state);
      await fs.writeFile(this.statePath, JSON.stringify(nextState, null, 2));
      return nextState;
    });
    return this._writePromise;
  }

  async readManualKoms() {
    const raw = await fs.readFile(this.manualKomsPath, 'utf8');
    return JSON.parse(raw || '{}');
  }
}
