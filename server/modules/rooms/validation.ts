import { z } from 'zod';

const roomStatus = z.enum(['AVAILABLE', 'UNAVAILABLE', 'RENTED']);
const roomMedia = z.array(z.object({
  publicId: z.string().min(1).max(255),
})).max(10);

export const roomCreateSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(2200),
  city: z.string().trim().min(1).max(120),
  area: z.string().trim().min(1).max(160),
  fullAddress: z.string().trim().max(500).default(''),
  rent: z.number().int().positive(),
  roomType: z.string().trim().min(1).max(40),
  availableAt: z.string().datetime().nullable().optional(),
  amenities: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  media: roomMedia.default([]),
  status: roomStatus.default('AVAILABLE'),
}).strict();

export const roomUpdateSchema = roomCreateSchema.partial().strict();

export const roommateProfileSchema = z.object({
  city: z.string().trim().min(1).max(120),
  bio: z.string().trim().min(1).max(500),
  budgetMin: z.number().int().nonnegative().nullable().optional(),
  budgetMax: z.number().int().positive().nullable().optional(),
  moveInAt: z.string().datetime().nullable().optional(),
  preferences: z.object({
    lifestyle: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  }).strict().default({ lifestyle: [] }),
}).strict().refine((value) =>
  value.budgetMin == null || value.budgetMax == null || value.budgetMin <= value.budgetMax,
{ message: 'Minimum budget cannot be greater than maximum budget.' });

export const roomSearchSchema = z.object({
  city: z.string().trim().max(120).optional(),
  minRent: z.coerce.number().int().nonnegative().optional(),
  maxRent: z.coerce.number().int().nonnegative().optional(),
  roomType: z.string().trim().max(40).optional(),
  amenities: z.string().max(1000).optional(),
  sort: z.enum(['newest', 'rent-asc', 'rent-desc']).default('newest'),
  availableBefore: z.coerce.date().optional(),
}).refine((value) =>
  value.minRent === undefined || value.maxRent === undefined || value.minRent <= value.maxRent,
{ message: 'Minimum rent cannot exceed maximum rent.' });

export const roommateSearchSchema = z.object({
  city: z.string().trim().max(120).optional(),
  minBudget: z.coerce.number().int().nonnegative().optional(),
  maxBudget: z.coerce.number().int().nonnegative().optional(),
  moveInBefore: z.coerce.date().optional(),
  lifestyle: z.string().trim().max(60).optional(),
}).refine((value) =>
  value.minBudget === undefined || value.maxBudget === undefined || value.minBudget <= value.maxBudget,
{ message: 'Minimum budget cannot exceed maximum budget.' });
