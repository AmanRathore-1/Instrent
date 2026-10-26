import assert from 'node:assert/strict';
import test from 'node:test';
import { isGrantUsable, isOtpUsable, normalizeEmail } from './auth.js';

test('normalizes email casing and surrounding whitespace', () => {
  assert.equal(normalizeEmail('  AmanRathore3271@GMAIL.COM '), 'amanrathore3271@gmail.com');
});

test('rejects expired, exhausted, and consumed OTPs', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  assert.equal(isOtpUsable({ expiresAt: new Date('2026-10-26T12:01:00.000Z'), attempts: 4, consumedAt: null }, now), true);
  assert.equal(isOtpUsable({ expiresAt: new Date('2026-10-26T11:59:59.000Z'), attempts: 0, consumedAt: null }, now), false);
  assert.equal(isOtpUsable({ expiresAt: new Date('2026-10-26T12:01:00.000Z'), attempts: 5, consumedAt: null }, now), false);
  assert.equal(isOtpUsable({ expiresAt: new Date('2026-10-26T12:01:00.000Z'), attempts: 0, consumedAt: now }, now), false);
});

test('allows a reset grant only once before expiry', () => {
  const now = new Date('2026-10-26T12:00:00.000Z');
  assert.equal(isGrantUsable({ expiresAt: new Date('2026-10-26T12:01:00.000Z'), consumedAt: null }, now), true);
  assert.equal(isGrantUsable({ expiresAt: new Date('2026-10-26T11:59:59.000Z'), consumedAt: null }, now), false);
  assert.equal(isGrantUsable({ expiresAt: new Date('2026-10-26T12:01:00.000Z'), consumedAt: now }, now), false);
});
