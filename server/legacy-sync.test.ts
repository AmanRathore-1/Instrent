import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSyncLegacyUserProfile } from './legacy-sync.js';

test('does not sync custom-auth users into the Clerk-only legacy profile table', () => {
  assert.equal(shouldSyncLegacyUserProfile(null), false);
  assert.equal(shouldSyncLegacyUserProfile('legacy-clerk-id'), true);
});
