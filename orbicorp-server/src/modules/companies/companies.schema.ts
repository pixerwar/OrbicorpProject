import { z } from 'zod';

export const updateCompanySchema = z.object({
  name: z.string().min(2).optional(),
  logoUrl: z.string().url().optional().nullable(),
  settings: z.object({
    timezone: z.string().optional(),
    language: z.enum(['tr', 'en']).optional(),
    theme: z.enum(['light', 'dark']).optional(),
    dateFormat: z.string().optional(),
    currency: z.string().optional(),
  }).optional(),
});

export const updateBrandingSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
});

export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;
