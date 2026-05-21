import prisma from '../../shared/utils/prisma.js';
import { CreateTaskInput, UpdateTaskInput, ListTasksQuery, AddTaskLogInput, UpdateTaskStepInput } from './tasks.schema.js';
import { Prisma } from '@prisma/client';

export class TasksService {
  // List tasks with pagination and filters
  async list(companyId: string, query: ListTasksQuery) {
    const { page, limit, status, priority, workflowId, agentId, search, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.TaskWhereInput = {
      companyId,
      ...(status && { status }),
      ...(priority && { priority }),
      ...(workflowId && { workflowId }),
      ...(agentId && { agentId }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
      ...(dateFrom && { createdAt: { gte: new Date(dateFrom) } }),
      ...(dateTo && { createdAt: { lte: new Date(dateTo) } }),
    };

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        skip,
        take: limit,
        orderBy: [
          { status: 'asc' }, // Running first
          { priority: 'desc' }, // Critical first
          { createdAt: 'desc' },
        ],
        include: {
          workflow: {
            select: {
              id: true,
              name: true,
              icon: true,
            },
          },
        },
      }),
      prisma.task.count({ where }),
    ]);

    return {
      tasks,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get single task by ID
  async getById(id: string, companyId: string) {
    const task = await prisma.task.findFirst({
      where: { id, companyId },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
            icon: true,
            definition: true,
          },
        },
      },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    return task;
  }

  // Create new task (manual task or from workflow trigger)
  async create(companyId: string, input: CreateTaskInput) {
    const task = await prisma.task.create({
      data: {
        companyId,
        workflowId: input.workflowId || null,
        agentId: input.agentId,
        name: input.name,
        description: input.description,
        priority: input.priority || 'MEDIUM',
        status: input.status || 'PENDING',
        scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : null,
        startedAt: input.startedAt ? new Date(input.startedAt) : null,
        input: input.input || {},
        steps: [],
        logs: [{
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Task "${input.name}" created`,
        }],
      },
      include: {
        workflow: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return task;
  }

  // Update task
  async update(id: string, companyId: string, input: UpdateTaskInput) {
    const existing = await prisma.task.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Task not found');
    }

    // Determine if status changed
    const statusChanged = input.status && input.status !== existing.status;
    const completedAt = input.status === 'COMPLETED' || input.status === 'FAILED' || input.status === 'CANCELLED'
      ? new Date()
      : undefined;
    const startedAt = input.status === 'RUNNING' && !existing.startedAt
      ? new Date()
      : undefined;

    const task = await prisma.task.update({
      where: { id },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.priority !== undefined && { priority: input.priority }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.progress !== undefined && { progress: input.progress }),
        ...(input.steps !== undefined && { steps: input.steps as any }),
        ...(input.output !== undefined && { output: input.output }),
        ...(input.error !== undefined && { error: input.error }),
        ...(startedAt && { startedAt }),
        ...(completedAt && { completedAt }),
      },
    });

    return task;
  }

  // Delete task
  async delete(id: string, companyId: string) {
    const existing = await prisma.task.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      throw new Error('Task not found');
    }

    await prisma.task.delete({
      where: { id },
    });

    return { deleted: true };
  }

  // Start task
  async start(id: string, companyId: string) {
    const task = await this.getById(id, companyId);
    
    if (task.status !== 'PENDING') {
      throw new Error('Task must be pending to start');
    }

    return this.update(id, companyId, {
      status: 'RUNNING',
      progress: 0,
    });
  }

  // Cancel task
  async cancel(id: string, companyId: string) {
    const task = await this.getById(id, companyId);
    
    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      throw new Error('Task is already finished');
    }

    return this.update(id, companyId, {
      status: 'CANCELLED',
      error: 'Task cancelled by user',
    });
  }

  // Approve task step
  async approve(id: string, companyId: string, stepId: number, approved: boolean) {
    const task = await this.getById(id, companyId);
    
    if (task.status !== 'APPROVAL') {
      throw new Error('Task is not waiting for approval');
    }

    const steps = (task.steps as any[]) || [];
    const stepIndex = steps.findIndex(s => s.id === stepId);
    
    if (stepIndex === -1) {
      throw new Error('Step not found');
    }

    // Update step status
    steps[stepIndex].status = approved ? 'done' : 'error';
    steps[stepIndex].approvedAt = new Date().toISOString();
    steps[stepIndex].approved = approved;

    // Continue to next step or complete
    const nextPendingIndex = steps.findIndex((s, i) => i > stepIndex && s.status === 'pending');
    if (nextPendingIndex !== -1) {
      steps[nextPendingIndex].status = 'running';
    }

    const allDone = steps.every(s => s.status === 'done' || s.status === 'error');
    const newStatus = approved
      ? (allDone ? 'COMPLETED' : 'RUNNING')
      : 'FAILED';

    return this.update(id, companyId, {
      status: newStatus,
      steps,
      progress: Math.round((steps.filter(s => s.status === 'done').length / steps.length) * 100),
    });
  }

  // Add log entry to task
  async addLog(id: string, companyId: string, input: AddTaskLogInput) {
    const task = await this.getById(id, companyId);
    
    const logs = (task.logs as any[]) || [];
    logs.push({
      timestamp: new Date().toISOString(),
      level: input.level,
      message: input.message,
    });

    await prisma.task.update({
      where: { id },
      data: { logs: logs as any },
    });

    return { added: true };
  }

  // Update task step
  async updateStep(id: string, companyId: string, input: UpdateTaskStepInput) {
    const task = await this.getById(id, companyId);
    
    const steps = (task.steps as any[]) || [];
    const stepIndex = steps.findIndex(s => s.id === input.stepId);
    
    if (stepIndex === -1) {
      throw new Error('Step not found');
    }

    steps[stepIndex].status = input.status;
    if (input.output) {
      steps[stepIndex].output = input.output;
    }
    if (input.status === 'done' || input.status === 'error') {
      steps[stepIndex].completedAt = new Date().toISOString();
    }

    // Calculate progress
    const doneSteps = steps.filter(s => s.status === 'done').length;
    const progress = Math.round((doneSteps / steps.length) * 100);

    // Check if approval needed
    const needsApproval = input.status === 'approval-needed';
    const allDone = steps.every(s => s.status === 'done');

    await prisma.task.update({
      where: { id },
      data: {
        steps: steps as any,
        progress,
        ...(needsApproval && { status: 'APPROVAL' }),
        ...(allDone && { status: 'COMPLETED', completedAt: new Date() }),
      },
    });

    return { updated: true };
  }

  // Get task stats
  async getStats(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [statusCounts, priorityCounts, todayStats] = await Promise.all([
      prisma.task.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      prisma.task.groupBy({
        by: ['priority'],
        where: { companyId, status: { in: ['PENDING', 'RUNNING', 'APPROVAL'] } },
        _count: true,
      }),
      prisma.task.aggregate({
        where: { companyId, createdAt: { gte: today } },
        _count: true,
      }),
    ]);

    return {
      byStatus: statusCounts.reduce((acc, s) => {
        acc[s.status.toLowerCase()] = s._count;
        return acc;
      }, {} as Record<string, number>),
      byPriority: priorityCounts.reduce((acc, p) => {
        acc[p.priority.toLowerCase()] = p._count;
        return acc;
      }, {} as Record<string, number>),
      todayCount: todayStats._count,
    };
  }
}

export const tasksService = new TasksService();
