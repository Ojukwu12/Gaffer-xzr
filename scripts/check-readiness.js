#!/usr/bin/env node

/**
 * Production readiness checker.
 * Evaluates whether paper/staging predictions have enough resolved samples
 * and statistical lower-bound win rate to justify production launch.
 */

const { connectDB, closeDB } = require('../src/config/db');
const predictionTrackingService = require('../src/services/predictionTrackingService');
const config = require('../src/config/env');

const parseArg = (name, defaultValue) => {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  if (!matched) return defaultValue;
  return matched.slice(prefix.length);
};

(async () => {
  const days = Number(parseArg('days', 30));
  const mode = parseArg('mode', 'paper');
  const minResolved = Number(parseArg('minResolved', config.readinessMinResolved || 100));
  const minLowerBound = Number(parseArg('minLowerBound', config.minWinRateLowerBound || 51));

  try {
    await connectDB();

    const readiness = await predictionTrackingService.getProductionReadiness({
      days,
      evaluationMode: mode,
      minResolved,
      minLowerBound
    });

    const summary = readiness.checks;

    console.log('=== Polyscope Production Readiness Check ===');
    console.log(`Mode: ${summary.evaluationMode}`);
    console.log(`Window: ${summary.windowDays} day(s)`);
    console.log(`Resolved predictions: ${summary.resolvedPredictions}`);
    console.log(`Point win rate: ${summary.pointWinRate}%`);
    console.log(`Wilson 95% lower bound: ${summary.wilsonLowerBound}%`);
    console.log(`Minimum resolved required: ${summary.minResolved}`);
    console.log(`Minimum lower bound required: ${summary.minLowerBound}%`);
    console.log(`Ready for production: ${readiness.ready ? 'YES' : 'NO'}`);

    if (readiness.reasons.length > 0) {
      console.log('Reasons:');
      for (const reason of readiness.reasons) {
        console.log(`- ${reason}`);
      }
    }

    process.exit(readiness.ready ? 0 : 2);
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    process.exit(1);
  } finally {
    await closeDB().catch(() => {});
  }
})();
