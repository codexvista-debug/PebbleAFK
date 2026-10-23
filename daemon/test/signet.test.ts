import assert from 'node:assert/strict';
import test from 'node:test';
import {
  signetCommandRetryDelayMs,
  signetConnectionRecoveryDelayMs,
  shouldResetFreshSmpSession,
} from '../src/bot/signet';

test('Signet retries quickly at first, then applies bounded backoff', () => {
  assert.equal(signetCommandRetryDelayMs(1, 0), 8_000);
  assert.equal(signetCommandRetryDelayMs(2, 0), 16_000);
  assert.equal(signetCommandRetryDelayMs(3, 0), 32_000);
  assert.equal(signetCommandRetryDelayMs(5, 0), 32_000);
  assert.equal(signetCommandRetryDelayMs(3, 0.5), 33_500);
  assert.equal(signetCommandRetryDelayMs(3, 0.999999), 34_999);
});

test('Signet session-reset cooldown is bounded and stagger-friendly', () => {
  assert.equal(signetConnectionRecoveryDelayMs(1, 0), 7_000);
  assert.equal(signetConnectionRecoveryDelayMs(2, 0), 14_000);
  assert.equal(signetConnectionRecoveryDelayMs(3, 0), 28_000);
  assert.equal(signetConnectionRecoveryDelayMs(5, 0.999999), 30_999);
});

test('Signet resets a FreshSMP session only after repeated failures', () => {
  assert.equal(shouldResetFreshSmpSession(0, 0), false);
  assert.equal(shouldResetFreshSmpSession(2, 0), false);
  assert.equal(shouldResetFreshSmpSession(3, 0), true);
  assert.equal(shouldResetFreshSmpSession(0, 3), true);
});
