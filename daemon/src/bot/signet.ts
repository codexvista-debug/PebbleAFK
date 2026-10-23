export const SIGNET_SHORT_RETURN_LIMIT = 3;
export const SIGNET_QUEUE_FAILURE_LIMIT = 3;

function boundedAttempt(attempt: number) {
  return Math.max(1, Math.min(5, Math.floor(Number.isFinite(attempt) ? attempt : 1)));
}

function boundedJitter(jitter: number) {
  return Math.max(0, Math.min(0.999999, Number.isFinite(jitter) ? jitter : 0));
}

/** Short, paced `/lifesteal` retries; triggerJoinCommandRetry still applies the daemon-wide command slot. */
export function signetCommandRetryDelayMs(attempt: number, jitter = Math.random()) {
  const exponent = Math.min(boundedAttempt(attempt) - 1, 2);
  const baseDelay = Math.min(32_000, 8_000 * (2 ** exponent));
  return Math.min(35_000, baseDelay + Math.floor(boundedJitter(jitter) * 3_000));
}

/** Exponential but bounded reconnect cooldown after Signet escalates to a fresh Bedrock session. */
export function signetConnectionRecoveryDelayMs(cycle: number, jitter = Math.random()) {
  const exponent = Math.min(boundedAttempt(cycle) - 1, 2);
  const baseDelay = Math.min(28_000, 7_000 * (2 ** exponent));
  return Math.min(31_000, baseDelay + Math.floor(boundedJitter(jitter) * 3_000));
}

export function shouldResetFreshSmpSession(shortReturns: number, queueFailures: number) {
  return shortReturns >= SIGNET_SHORT_RETURN_LIMIT || queueFailures >= SIGNET_QUEUE_FAILURE_LIMIT;
}
