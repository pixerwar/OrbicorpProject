import prisma from '../../shared/utils/prisma.js';
import { hashPassword, verifyPassword } from '../../shared/utils/password.js';
import { CreateUserInput, UpdateUserInput, ChangePasswordInput, ResetPasswordInput, ListUsersQuery } from './users.schema.js';
import { Prisma } from '@prisma/client';

export class UsersService {
  // List users in company
  async list(companyId: string, query: ListUsersQuery) {
    const { page, limit, role, status, department, search } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      companyId,
      ...(role && { role }),
      ...(status && { status }),
      ...(department && { department }),
      ...(search && {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { phone: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          phone: true,
          department: true,
          role: true,
          status: true,
          avatarUrl: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Get user by ID
  async getById(id: string, companyId: string) {
    const user = await prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        department: true,
        role: true,
        status: true,
        avatarUrl: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  // Get user by ID with password (for admin password view)
  async getByIdWithPassword(id: string, companyId: string) {
    const user = await prisma.user.findFirst({
      where: { id, companyId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        department: true,
        role: true,
        status: true,
        avatarUrl: true,
        passwordHash: true, // Include for admin
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return user;
  }

  // Create new user (invite)
  async create(companyId: string, input: CreateUserInput) {
    // Check if email already exists
    const existing = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existing) {
      throw new Error('Email already registered');
    }

    const passwordHash = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        companyId,
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        department: input.department,
        role: input.role,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        department: true,
        role: true,
        status: true,
        createdAt: true,
      },
    });

    return user;
  }

  // Update user
  async update(id: string, companyId: string, input: UpdateUserInput, requesterId: string, requesterRole: string) {
    const user = await this.getById(id, companyId);

    // Prevent non-admins from changing roles
    if (input.role && requesterRole !== 'ADMIN') {
      throw new Error('Only admins can change user roles');
    }

    // Prevent self-demotion from admin
    if (id === requesterId && input.role && input.role !== 'ADMIN' && user.role === 'ADMIN') {
      throw new Error('Cannot demote yourself from admin');
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.firstName !== undefined && { firstName: input.firstName }),
        ...(input.lastName !== undefined && { lastName: input.lastName }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.department !== undefined && { department: input.department }),
        ...(input.role !== undefined && { role: input.role }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.avatarUrl !== undefined && { avatarUrl: input.avatarUrl }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        department: true,
        role: true,
        status: true,
        avatarUrl: true,
        updatedAt: true,
      },
    });

    return updated;
  }

  // Delete user
  async delete(id: string, companyId: string, requesterId: string) {
    // Prevent self-deletion
    if (id === requesterId) {
      throw new Error('Cannot delete your own account');
    }

    await this.getById(id, companyId);

    // Check if this is the last admin
    const adminCount = await prisma.user.count({
      where: { companyId, role: 'ADMIN' },
    });

    const userToDelete = await prisma.user.findUnique({
      where: { id },
      select: { role: true },
    });

    if (userToDelete?.role === 'ADMIN' && adminCount <= 1) {
      throw new Error('Cannot delete the last admin');
    }

    await prisma.user.delete({
      where: { id },
    });

    return { deleted: true };
  }

  // Change password (user changes own password)
  async changePassword(userId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const isValid = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }

    const newHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens (force re-login)
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { success: true };
  }

  // Reset password (admin resets user password)
  async resetPassword(userId: string, companyId: string, input: ResetPasswordInput) {
    // Verify user exists and belongs to company
    await this.getById(userId, companyId);

    const newHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    // Revoke all refresh tokens (force re-login)
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });

    return { success: true };
  }

  // Get user stats
  async getStats(companyId: string) {
    const [total, byRole, byStatus, byDepartment] = await Promise.all([
      prisma.user.count({ where: { companyId } }),
      prisma.user.groupBy({
        by: ['role'],
        where: { companyId },
        _count: true,
      }),
      prisma.user.groupBy({
        by: ['status'],
        where: { companyId },
        _count: true,
      }),
      prisma.user.groupBy({
        by: ['department'],
        where: { companyId, department: { not: null } },
        _count: true,
      }),
    ]);

    return {
      total,
      byRole: byRole.reduce((acc, r) => ({ ...acc, [r.role]: r._count }), {}),
      byStatus: byStatus.reduce((acc, s) => ({ ...acc, [s.status]: s._count }), {}),
      byDepartment: byDepartment.reduce((acc, d) => ({ ...acc, [d.department || 'Diğer']: d._count }), {}),
    };
  }

  // Get departments list
  getDepartments() {
    return [
      'Yönetim',
      'Bilgi Teknolojileri',
      'İnsan Kaynakları',
      'Finans',
      'Satış',
      'Pazarlama',
      'Operasyon',
      'Müşteri Hizmetleri',
      'Hukuk',
      'Ar-Ge',
      'Diğer',
    ];
  }
}

export const usersService = new UsersService();
