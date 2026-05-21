import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════
// SHARED
// ═══════════════════════════════════════════════════════════════════

const MetadataItemSchema = z.object({
  key:   z.string(),
  value: z.string(),
});

// ═══════════════════════════════════════════════════════════════════
// CREATE TASK → Approval Card
// ═══════════════════════════════════════════════════════════════════

export const CreateTaskInputSchema = z.object({
  name:        z.string().min(1),
  description: z.string().min(1),
  priority:    z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
});

export const CreateTaskOutputSchema = z.object({
  component:   z.literal('approval-card'),
  taskId:      z.string(),
  title:       z.string(),
  description: z.string(),
  variant:     z.enum(['default', 'destructive']).default('default'),
  metadata:    z.array(MetadataItemSchema),
});

export type CreateTaskOutput = z.infer<typeof CreateTaskOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// LIST TASKS → Data Table
// ═══════════════════════════════════════════════════════════════════

export const ListTasksInputSchema = z.object({
  status: z.enum(['RUNNING', 'PENDING', 'APPROVAL', 'COMPLETED', 'FAILED']).optional(),
});

export const DataTableColumnSchema = z.object({
  key:      z.string(),
  label:    z.string(),
  sortable: z.boolean().default(false),
  width:    z.string().optional(),
});

export const DataTableRowSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export const ListTasksOutputSchema = z.object({
  component: z.literal('data-table'),
  title:     z.string().optional(),
  total:     z.number(),
  filter:    z.string().optional(),
  columns:   z.array(DataTableColumnSchema),
  rows:      z.array(DataTableRowSchema),
});

export type ListTasksOutput = z.infer<typeof ListTasksOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// UPDATE TASK → Progress Tracker
// ═══════════════════════════════════════════════════════════════════

export const UpdateTaskInputSchema = z.object({
  task_id:     z.string(),
  progress:    z.number().min(0).max(100).optional(),
  status:      z.enum(['RUNNING', 'COMPLETED', 'FAILED']).optional(),
  log_message: z.string().optional(),
});

export const ProgressTrackerOutputSchema = z.object({
  component: z.literal('progress-tracker'),
  taskId:    z.string(),
  taskName:  z.string(),
  progress:  z.number().min(0).max(100),
  status:    z.string(),
  changes:   z.array(z.string()),
  message:   z.string(),
  logs:      z.array(z.object({
    timestamp: z.string(),
    message:   z.string(),
  })).optional(),
});

export type ProgressTrackerOutput = z.infer<typeof ProgressTrackerOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// PLAN TASK → Plan Card (YENİ TOOL)
// Agent adımları gösterir → kullanıcı onaylar → create_task çağrılır
// ═══════════════════════════════════════════════════════════════════

export const PlanStepSchema = z.object({
  id:          z.string(),
  title:       z.string(),
  description: z.string().optional(),
  tool:        z.string().optional(),
  duration:    z.string().optional(),
});

export const PlanTaskInputSchema = z.object({
  title:             z.string().min(1),
  description:       z.string().min(1),
  steps:             z.array(PlanStepSchema).min(1),
  priority:          z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  estimatedDuration: z.string().optional(),
});

export const PlanCardOutputSchema = z.object({
  component:         z.literal('plan-card'),
  planId:            z.string(),
  title:             z.string(),
  description:       z.string(),
  priority:          z.string(),
  estimatedDuration: z.string().optional(),
  steps: z.array(z.object({
    id:          z.string(),
    title:       z.string(),
    description: z.string().optional(),
    tool:        z.string().optional(),
    duration:    z.string().optional(),
    status:      z.enum(['pending', 'running', 'done', 'error']).default('pending'),
  })),
});

export type PlanCardOutput = z.infer<typeof PlanCardOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// ASK USER → Option List (YENİ TOOL)
// Seçenek C: seçim → receipt + summary mesaj gönderilir
// ═══════════════════════════════════════════════════════════════════

export const OptionSchema = z.object({
  id:          z.string(),
  label:       z.string(),
  description: z.string().optional(),
  icon:        z.string().optional(),
});

export const AskUserInputSchema = z.object({
  question:      z.string().min(1),
  context:       z.string().optional(),
  options:       z.array(OptionSchema).min(2).max(8),
  allowMultiple: z.boolean().default(false),
});

export const OptionListOutputSchema = z.object({
  component:     z.literal('option-list'),
  questionId:    z.string(),
  question:      z.string(),
  context:       z.string().optional(),
  allowMultiple: z.boolean().default(false),
  options:       z.array(OptionSchema),
});

export type OptionListOutput = z.infer<typeof OptionListOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// ERROR
// ═══════════════════════════════════════════════════════════════════

export const ErrorOutputSchema = z.object({
  component: z.literal('error-card'),
  toolName:  z.string(),
  message:   z.string(),
});

export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// UNION
// ═══════════════════════════════════════════════════════════════════

export const ToolOutputSchema = z.discriminatedUnion('component', [
  CreateTaskOutputSchema,
  ListTasksOutputSchema,
  ProgressTrackerOutputSchema,
  PlanCardOutputSchema,
  OptionListOutputSchema,
  ErrorOutputSchema,
]);

export type ToolOutput = z.infer<typeof ToolOutputSchema>;

// ═══════════════════════════════════════════════════════════════════
// SAFE PARSE HELPERS
// ═══════════════════════════════════════════════════════════════════

export function safeParseToolOutput(data: unknown): ToolOutput | null {
  const r = ToolOutputSchema.safeParse(data);
  if (!r.success) { console.error('[tool-schemas]', r.error.flatten()); return null; }
  return r.data;
}
export function safeParseCreateTask(d: unknown): CreateTaskOutput | null {
  const r = CreateTaskOutputSchema.safeParse(d); return r.success ? r.data : null;
}
export function safeParseListTasks(d: unknown): ListTasksOutput | null {
  const r = ListTasksOutputSchema.safeParse(d); return r.success ? r.data : null;
}
export function safeParseProgressTracker(d: unknown): ProgressTrackerOutput | null {
  const r = ProgressTrackerOutputSchema.safeParse(d); return r.success ? r.data : null;
}
export function safeParsePlanCard(d: unknown): PlanCardOutput | null {
  const r = PlanCardOutputSchema.safeParse(d); return r.success ? r.data : null;
}
export function safeParseOptionList(d: unknown): OptionListOutput | null {
  const r = OptionListOutputSchema.safeParse(d); return r.success ? r.data : null;
}
