import { z } from 'zod';

// Node definition for workflow builder
const workflowNodeSchema = z.object({
  id: z.number(),
  type: z.enum(['trigger', 'agent', 'condition', 'approval', 'integration', 'notification', 'transform']),
  x: z.number(),
  y: z.number(),
  label: z.string(),
  sub: z.string().optional(),
  config: z.record(z.any()).optional(),
});

// Connection between nodes
const workflowConnectionSchema = z.object({
  from: z.number(),
  to: z.number(),
  fromPort: z.string().optional(),
  toPort: z.string().optional(),
  label: z.string().optional(),
});

// Workflow definition (nodes + connections)
const workflowDefinitionSchema = z.object({
  nodes: z.array(workflowNodeSchema),
  connections: z.array(workflowConnectionSchema),
});

export const createWorkflowSchema = z.object({
  name: z.string().min(1, 'Workflow name is required').max(255),
  description: z.string().optional(),
  icon: z.string().optional(),
  definition: workflowDefinitionSchema,
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED']).optional(),
  schedule: z.string().optional(), // cron expression
});

export const updateWorkflowSchema = createWorkflowSchema.partial();

export const listWorkflowsQuery = z.object({
  page: z.string().optional().transform(v => v ? parseInt(v) : 1),
  limit: z.string().optional().transform(v => v ? parseInt(v) : 20),
  status: z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  search: z.string().optional(),
});

export type CreateWorkflowInput = z.infer<typeof createWorkflowSchema>;
export type UpdateWorkflowInput = z.infer<typeof updateWorkflowSchema>;
export type ListWorkflowsQuery = z.infer<typeof listWorkflowsQuery>;
export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowConnection = z.infer<typeof workflowConnectionSchema>;
