import { prisma } from '../../shared/utils/prisma.js';
import { CreateNotificationInput, RespondNotificationInput } from './notifications.schema.js';

export class NotificationsService {
  
  // List notifications for a user (for topbar dropdown)
  async listForUser(userId: string, options?: { 
    status?: string; 
    type?: string;
    limit?: number;
  }) {
    const { status, type, limit = 20 } = options || {};
    
    return prisma.notification.findMany({
      where: {
        userId,
        ...(status && { status }),
        ...(type && { type }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        channel: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }
  
  // Get pending approvals for a user
  async getPendingApprovals(userId: string) {
    return prisma.notification.findMany({
      where: {
        userId,
        type: 'APPROVAL',
        status: { in: ['PENDING', 'SENT', 'DELIVERED', 'READ'] },
        response: null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
  
  // Count pending approvals (for badge)
  async countPendingApprovals(userId: string): Promise<number> {
    return prisma.notification.count({
      where: {
        userId,
        type: 'APPROVAL',
        status: { in: ['PENDING', 'SENT', 'DELIVERED', 'READ'] },
        response: null,
      },
    });
  }
  
  // Get single notification
  async get(userId: string, id: string) {
    return prisma.notification.findFirst({
      where: { id, userId },
      include: {
        channel: {
          select: { id: true, name: true, type: true },
        },
      },
    });
  }
  
  // Create notification
  async create(companyId: string, data: CreateNotificationInput) {
    return prisma.notification.create({
      data: {
        companyId,
        userId: data.userId,
        taskId: data.taskId,
        channelId: data.channelId,
        type: data.type,
        title: data.title,
        message: data.message,
        data: data.data || {},
        status: 'PENDING',
      },
    });
  }
  
  // Mark as read
  async markAsRead(userId: string, id: string) {
    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });
    
    if (!notification) return null;
    
    return prisma.notification.update({
      where: { id },
      data: { 
        status: 'READ',
        readAt: new Date(),
      },
    });
  }
  
  // Mark all as read
  async markAllAsRead(userId: string) {
    await prisma.notification.updateMany({
      where: { 
        userId,
        readAt: null,
      },
      data: { 
        status: 'READ',
        readAt: new Date(),
      },
    });
    
    return { success: true };
  }
  
  // Respond to approval notification
  async respond(userId: string, id: string, data: RespondNotificationInput) {
    const notification = await prisma.notification.findFirst({
      where: { id, userId, type: 'APPROVAL' },
    });
    
    if (!notification) {
      return { success: false, error: 'Bildirim bulunamadı' };
    }
    
    if (notification.response) {
      return { success: false, error: 'Bu bildirimi zaten yanıtladınız' };
    }
    
    // Update notification
    const updated = await prisma.notification.update({
      where: { id },
      data: {
        status: 'RESPONDED',
        response: data.response,
        respondedAt: new Date(),
        data: {
          ...(notification.data as object),
          responseComment: data.comment,
        },
      },
    });
    
    // If there's a related task, update its status
    if (notification.taskId) {
      const newStatus = data.response === 'APPROVED' ? 'RUNNING' : 'CANCELLED';
      await prisma.task.update({
        where: { id: notification.taskId },
        data: { 
          status: newStatus,
          logs: {
            push: {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Onay ${data.response === 'APPROVED' ? 'verildi' : 'reddedildi'}${data.comment ? `: ${data.comment}` : ''}`,
            },
          },
        },
      });
    }
    
    return { success: true, notification: updated };
  }
  
  // Update notification status (after sending via channel)
  async updateStatus(id: string, status: string, sentAt?: Date) {
    return prisma.notification.update({
      where: { id },
      data: { 
        status,
        ...(sentAt && { sentAt }),
      },
    });
  }
  
  // Create approval notification for a task
  async createApprovalNotification(params: {
    companyId: string;
    userId: string;
    taskId: string;
    taskName: string;
    channelId?: string;
    details?: Record<string, any>;
  }) {
    const { companyId, userId, taskId, taskName, channelId, details } = params;
    
    return this.create(companyId, {
      userId,
      taskId,
      channelId,
      type: 'APPROVAL',
      title: `Onay Bekliyor: ${taskName}`,
      message: `"${taskName}" görevi onayınızı bekliyor.`,
      data: {
        taskId,
        taskName,
        ...details,
        actions: [
          { label: 'Onayla', value: 'APPROVED', style: 'success' },
          { label: 'Reddet', value: 'REJECTED', style: 'danger' },
        ],
      },
    });
  }
}

export const notificationsService = new NotificationsService();
