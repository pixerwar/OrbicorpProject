import prisma from '../../shared/utils/prisma.js';
import { CreateWorkflowInput, UpdateWorkflowInput, ListWorkflowsQuery } from './workflows.schema.js';
import { Prisma } from '@prisma/client';

export class WorkflowsService {
  // List workflows with pagination
  async list(companyId: string, query: ListWorkflowsQuery) {
    const { page, limit, status, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.WorkflowWhereInput = {
      companyId,
      ...(status && { status }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [workflows, total] = await Promise.all([
      prisma.workflow.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
        include: {
          _count: {
            select: { tasks: true }
          }
        }
      }),
      prisma.workflow.count({ where }),
    ]);

    // Transform to include task count and node count
    const transformedWorkflows = workflows.map(w => {
      const definition = w.definition as { nodes?: any[] } || {};
      return {
        ...w,
        stepCount: definition.nodes?.length || 0,
        taskCount: w._count.tasks,
      };
    });

    return {
      workflows: transformedWorkflows,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single workflow by ID
  async getById(id: string, companyId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id, companyId },
      include: {
        tasks: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: { tasks: true }
        }
      },
    });

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    return workflow;
  }

  // Create new workflow
  async create(companyId: string, input: CreateWorkflowInput) {
    const workflow = await prisma.workflow.create({
      data: {
        companyId,
        name: input.name,
        description: input.description,
        icon: input.icon || '⚡',
        definition: input.definition as any,
        status: input.status || 'DRAFT',
        schedule: input.schedule,
      },
    });

    return workflow;
  }

  // Update workflow
  async update(id: string, companyId: string, input: UpdateWorkflowInput) {
    const existing = await prisma.workflow.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Workflow not found');
    }

    const workflow = await prisma.workflow.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.definition !== undefined && { definition: input.definition as any }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.schedule !== undefined && { schedule: input.schedule }),
      },
    });

    return workflow;
  }

  // Delete workflow
  async delete(id: string, companyId: string) {
    const existing = await prisma.workflow.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Workflow not found');
    }

    await prisma.workflow.delete({
      where: { id },
    });

    return { deleted: true };
  }

  // Activate workflow
  async activate(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'ACTIVE' });
  }

  // Pause workflow
  async pause(id: string, companyId: string) {
    return this.update(id, companyId, { status: 'PAUSED' });
  }

  // Run workflow manually (creates a task)
  async run(id: string, companyId: string, triggerData?: any) {
    const workflow = await this.getById(id, companyId);

    if (workflow.status !== 'ACTIVE' && workflow.status !== 'DRAFT') {
      throw new Error('Workflow must be active or draft to run');
    }

    // Get nodes from definition
    const definition = workflow.definition as { nodes?: any[] } || {};
    const nodes = definition.nodes || [];

    // Create steps from nodes
    const steps = nodes.map((node, index) => ({
      id: node.id,
      name: node.label || `Step ${index + 1}`,
      type: node.type,
      status: index === 0 ? 'running' : 'pending',
      config: node.config || {},
    }));

    // Create task
    const task = await prisma.task.create({
      data: {
        companyId,
        workflowId: id,
        name: workflow.name,
        description: `Manual run of ${workflow.name}`,
        status: 'RUNNING',
        priority: 'MEDIUM',
        steps: steps as any,
        input: triggerData || {},
        startedAt: new Date(),
        logs: [{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Workflow "${workflow.name}" started manually`,
        }] as any,
      },
    });

    // Update workflow stats
    await prisma.workflow.update({
      where: { id },
      data: {
        lastRunAt: new Date(),
        runCount: { increment: 1 },
      },
    });

    return task;
  }

  // Get workflow stats
  async getStats(companyId: string) {
    const [totalWorkflows, activeWorkflows, tasksToday, taskStats] = await Promise.all([
      prisma.workflow.count({ where: { companyId } }),
      prisma.workflow.count({ where: { companyId, status: 'ACTIVE' } }),
      prisma.task.count({
        where: {
          companyId,
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
    ]);

    const statusCounts = taskStats.reduce((acc, s) => {
      acc[s.status] = s._count;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalWorkflows,
      activeWorkflows,
      tasksToday,
      tasksByStatus: statusCounts,
    };
  }
}

export const workflowsService = new WorkflowsService();
