import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canManageRoom, canViewRoomAddress } from './authorization.js';
import { roomCreateSchema, roomSearchSchema, roommateProfileSchema, roommateSearchSchema } from './validation.js';

test('validates room creation fields and rejects invalid rent/status', () => {
  const valid = roomCreateSchema.safeParse({
    title: 'Private room',
    description: 'Room available in a shared flat.',
    city: 'Pune',
    area: 'Kothrud',
    rent: 15000,
    roomType: 'Private',
    media: [],
  });
  assert.equal(valid.success, true);

  assert.equal(roomCreateSchema.safeParse({
    title: 'Room',
    description: 'Details',
    city: 'Pune',
    area: 'Kothrud',
    rent: 0,
    roomType: 'Private',
    status: 'LET',
  }).success, false);
});

test('validates room search filters and rent range order', () => {
  assert.equal(roomSearchSchema.safeParse({
    city: 'Pune',
    minRent: '10000',
    maxRent: '20000',
    amenities: 'wifi, laundry',
    sort: 'rent-asc',
    cursor: 'opaque-cursor',
  }).success, true);
  assert.equal(roomSearchSchema.safeParse({ minRent: '25000', maxRent: '10000' }).success, false);
  assert.equal(roomSearchSchema.safeParse({ sort: 'random' }).success, false);
});

test('requires completed, coherent roommate profiles and validates discovery budgets', () => {
  assert.equal(roommateProfileSchema.safeParse({
    city: 'Pune',
    bio: 'Working professional looking for a flatmate.',
    budgetMin: 10000,
    budgetMax: 20000,
    preferences: { lifestyle: ['quiet'] },
  }).success, true);
  assert.equal(roommateProfileSchema.safeParse({ city: 'Pune', bio: '', budgetMin: 20000, budgetMax: 10000 }).success, false);
  assert.equal(roommateSearchSchema.safeParse({ minBudget: '25000', maxBudget: '10000', cursor: 'opaque-cursor' }).success, false);
});

test('restricts room mutations and full-address visibility to the owner', () => {
  assert.equal(canManageRoom('owner-1', 'owner-1'), true);
  assert.equal(canManageRoom('owner-1', 'viewer-2'), false);
  assert.equal(canViewRoomAddress('owner-1', 'owner-1'), true);
  assert.equal(canViewRoomAddress('owner-1', 'viewer-2'), false);
});
