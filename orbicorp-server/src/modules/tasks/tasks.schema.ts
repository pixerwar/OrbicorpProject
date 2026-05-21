import { z } from 'zod';

export const createTaskSchema = z.object({
  workflowId: z.string().optional(),
  agentId: z.string().min(1, 'Agent ID is required'),
  name: z.string().min(1, 'Task name is required').max(255),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'APPROVAL']).default('PENDING'),
  triggerType: z.enum(['MANUAL', 'SCHEDULED', 'WEBHOOK', 'EMAIL']).default('MANUAL'),
  scheduledAt: z.string().datetime().optional(),
  startedAt: z.string().datetime().optional(),
  repeatInterval: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']).optional(),
  input: z.any().optional(),
});

export const updateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'APPROVAL']).optional(),
  progress: z.number().min(0).max(100).optional(),
  steps: z.array(z.any()).optional(),
  output: z.any().optional(),
  error: z.string().optional(),
});

export const listTasksQuery = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 20),
  status: z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'APPROVAL']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  workflowId: z.string().uuid().optional(),
  agentId: z.string().uuid().optional(),
  search: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

export const addTaskLogSchema = z.object({
  level: z.enum(['info', 'warn', 'error', 'debug']).default('info'),
  message: z.string().min(1),
});

export const updateTaskStepSchema = z.object({
  stepId: z.number(),
  status: z.enum(['pending', 'running', 'done', 'error', 'approval-needed']),
  output: z.any().optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type ListTasksQuery = z.infer<typeof listTasksQuery>;
export type AddTaskLogInput = z.infer<typeof addTaskLogSchema>;
export type UpdateTaskStepInput = z.infer<typeof updateTaskStepSchema>;
