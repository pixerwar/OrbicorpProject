import { z } from 'zod';

// Create card schema
export const createCardSchema = z.object({
  name: z.string().min(1).max(100),
  cardHolder: z.string().min(1).max(100).optional(),
  cardNumber: z.string().min(13).max(19),
  expiryMonth: z.number().min(1).max(12),
  expiryYear: z.number().min(24).max(99), // 2-digit year
  cvv: z.string().min(3).max(4),
  monthlyLimit: z.number().min(0).default(1000),
  categories: z.array(z.string()).default([]),
});

export type CreateCardInput = z.infer<typeof createCardSchema>;

// Update card schema
export const updateCardSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  cardHolder: z.string().min(1).max(100).optional(),
  monthlyLimit: z.number().min(0).optional(),
  status: z.enum(['ACTIVE', 'FROZEN']).optional(),
  categories: z.array(z.string()).optional(),
});

export type UpdateCardInput = z.infer<typeof updateCardSchema>;

// Assign card to agent schema
export const assignCardSchema = z.object({
  agentId: z.string().uuid(),
  cardId: z.string().uuid(),
  canSpend: z.boolean().default(true),
  maxPerTransaction: z.number().min(0).optional(),
  allowedCategories: z.array(z.string()).default([]),
});

export type AssignCardInput = z.infer<typeof assignCardSchema>;

// Transaction schema
export const createTransactionSchema = z.object({
  cardId: z.string().uuid(),
  agentId: z.string().uuid().optional(),
  sessionId: z.string().uuid().optional(),
  amount: z.number().min(0.01),
  currency: z.string().default('USD'),
  description: z.string().min(1).max(500),
  merchant: z.string().optional(),
  category: z.string().optional(),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;

// List cards query
export const listCardsQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  status: z.enum(['ACTIVE', 'FROZEN', 'EXPIRED']).optional(),
});

export type ListCardsQuery = z.infer<typeof listCardsQuery>;

// List transactions query
export const listTransactionsQuery = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  cardId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED', 'FAILED', 'REFUNDED']).optional(),
});

export type ListTransactionsQuery = z.infer<typeof listTransactionsQuery>;
