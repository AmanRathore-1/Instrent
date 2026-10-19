import assert from 'node:assert/strict';
import { test } from 'node:test';
import { persistThenPublish } from './service.js';

test('publishes a social event only after persistence resolves', async () => {
  const order: string[] = [];
  const result = await persistThenPublish(
    async () => {
      order.push('persisted');
      return { id: 'post-1' };
    },
    (value) => {
      assert.equal(value.id, 'post-1');
      order.push('published');
    },
  );

  assert.deepEqual(order, ['persisted', 'published']);
  assert.equal(result.id, 'post-1');
});

test('does not publish when persistence fails', async () => {
  let published = false;
  await assert.rejects(
    persistThenPublish(
      async () => {
        throw new Error('database write failed');
      },
      () => {
        published = true;
      },
    ),
    /database write failed/,
  );
  assert.equal(published, false);
});

test('publishes only once for a duplicate-safe persistence result', async () => {
  let writes = 0;
  let events = 0;
  const persistDuplicateSafeLike = async () => {
    writes += 1;
    return { created: writes === 1 };
  };
  await persistThenPublish(persistDuplicateSafeLike, ({ created }) => {
    if (created) events += 1;
  });
  await persistThenPublish(persistDuplicateSafeLike, ({ created }) => {
    if (created) events += 1;
  });

  assert.equal(writes, 2);
  assert.equal(events, 1);
});
