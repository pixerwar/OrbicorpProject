import { z } from 'zod';

export const NotificationType = z.enum(['APPROVAL', 'INFO', 'ALERT', 'TASK_COMPLETE']);
export type NotificationType = z.infer<typeof NotificationType>;

export const NotificationStatus = z.enum(['PENDING', 'SENT', 'DELIVERED', 'READ', 'RESPONDED', 'FAILED']);
export type NotificationStatus = z.infer<typeof NotificationStatus>;

// Create notification (internal use)
export const CreateNotificationSchema = z.object({
  userId: z.string().uuid(),
  taskId: z.string().uuid().optional(),
  channelId: z.string().uuid().optional(),
  type: NotificationType,
  title: z.string().min(1).max(200),
  message: z.string().min(1),
  data: z.record(z.any()).optional(),
});

export type CreateNotificationInput = z.infer<typeof CreateNotificationSchema>;

// Response action (approve/reject)
export const RespondNotificationSchema = z.object({
  response: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().optional(),
});

export type RespondNotificationInput = z.infer<typeof RespondNotificationSchema>;

// Notification response
export interface NotificationResponse {
  id: string;
  companyId: string;
  userId: string;
  taskId: string | null;
  channelId: string | null;
  type: string;
  title: string;
  message: string;
  data: Record<string, any>;
  status: string;
  sentAt: Date | null;
  readAt: Date | null;
  respondedAt: Date | null;
  response: string | null;
  createdAt: Date;
}
