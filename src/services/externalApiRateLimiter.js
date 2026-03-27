/**
 * External API Rate Limiter
 * Serializes provider calls and enforces a minimum interval between requests.
 * @module services/externalApiRateLimiter
 */

const config = require('../config/env');

const providerIntervals = {
  theSportsDb: Number(config.theSportsDbMinIntervalMs || 700),
  footballData: Number(config.footballDataMinIntervalMs || 500),
  coinGecko: Number(config.coinGeckoMinIntervalMs || 1200),
  yahooFinance: Number(config.yahooFinanceMinIntervalMs || 400),
  gdelt: Number(config.gdeltMinIntervalMs || 600),
  newsApi: Number(config.newsApiMinIntervalMs || 800),
  secEdgar: Number(config.secEdgarMinIntervalMs || 500),
  earningsApi: Number(config.earningsApiMinIntervalMs || 500)
};

const providerState = new Map();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

const getProviderState = (provider) => {
  if (!providerState.has(provider)) {
    providerState.set(provider, {
      queue: Promise.resolve(),
      nextAvailableAt: 0
    });
  }

  return providerState.get(provider);
};

const getProviderInterval = (provider) => {
  const interval = providerIntervals[provider];
  return Number.isFinite(interval) && interval >= 0 ? interval : 0;
};

const schedule = (provider, requestFn) => {
  const state = getProviderState(provider);
  const minIntervalMs = getProviderInterval(provider);

  const run = async () => {
    const waitMs = state.nextAvailableAt - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    state.nextAvailableAt = Date.now() + minIntervalMs;
    return requestFn();
  };

  const task = state.queue.then(run, run);
  state.queue = task.then(() => undefined, () => undefined);

  return task;
};

module.exports = {
  schedule
};
