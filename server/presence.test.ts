import test from 'node:test';
import assert from 'node:assert/strict';
import { PresenceRegistry } from './presence.js';

test('keeps a user online until the last socket disconnects', () => {
  const presence = new PresenceRegistry();
  assert.equal(presence.add('user-1', 'socket-a'), true);
  assert.equal(presence.add('user-1', 'socket-b'), false);
  assert.equal(presence.isOnline('user-1'), true);
  assert.equal(presence.remove('user-1', 'socket-a'), false);
  assert.equal(presence.isOnline('user-1'), true);
  assert.equal(presence.remove('user-1', 'socket-b'), true);
  assert.equal(presence.isOnline('user-1'), false);
});

test('removes all sockets when a user session is invalidated', () => {
  const presence = new PresenceRegistry();
  presence.add('user-1', 'socket-a');
  presence.add('user-1', 'socket-b');
  assert.equal(presence.removeAll('user-1'), true);
  assert.equal(presence.isOnline('user-1'), false);
  assert.deepEqual(presence.onlineUserIds(), []);
});
