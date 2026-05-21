import { randomUUID } from 'crypto';
import prisma from '../../shared/utils/prisma.js';
import { hashPassword, verifyPassword } from '../../shared/utils/password.js';
import { LoginInput, RegisterInput } from './auth.schema.js';
import { config } from '../../config/index.js';

export class AuthService {
  // Login user
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      include: { company: true },
    });

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new Error('Account is not active');
    }

    const isValidPassword = await verifyPassword(input.password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return {
      userId: user.id,
      companyId: user.companyId,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      company: {
        id: user.company.id,
        name: user.company.name,
        slug: user.company.slug,
      },
    };
  }

  // Register new company + admin user
  async register(input: RegisterInput) {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new Error('Email already registered');
    }

    // Generate company slug
    const slug = input.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    // Check if slug exists
    const existingCompany = await prisma.company.findUnique({
      where: { slug },
    });

    const finalSlug = existingCompany ? `${slug}-${Date.now()}` : slug;

    // Create company and admin user in transaction
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.companyName,
          slug: finalSlug,
          settings: {
            timezone: 'Europe/Istanbul',
            language: 'tr',
            theme: 'light',
          },
        },
      });

      const passwordHash = await hashPassword(input.password);

      const user = await tx.user.create({
        data: {
          companyId: company.id,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          role: 'ADMIN',
          status: 'ACTIVE',
        },
      });

      return { company, user };
    });

    return {
      userId: result.user.id,
      companyId: result.company.id,
      email: result.user.email,
      role: result.user.role,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      company: {
        id: result.company.id,
        name: result.company.name,
        slug: result.company.slug,
      },
    };
  }

  // Create refresh token
  async createRefreshToken(userId: string): Promise<string> {
    const token = randomUUID();
    
    // Parse expiry duration (e.g., "7d" -> 7 days)
    const expiresIn = config.jwt.refreshExpiresIn;
    const match = expiresIn.match(/^(\d+)([dhms])$/);
    
    let expiresMs = 7 * 24 * 60 * 60 * 1000; // Default 7 days
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      switch (unit) {
        case 'd': expiresMs = value * 24 * 60 * 60 * 1000; break;
        case 'h': expiresMs = value * 60 * 60 * 1000; break;
        case 'm': expiresMs = value * 60 * 1000; break;
        case 's': expiresMs = value * 1000; break;
      }
    }

    const expiresAt = new Date(Date.now() + expiresMs);

    await prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    });

    return token;
  }

  // Verify refresh token
  async verifyRefreshToken(token: string) {
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { include: { company: true } } },
    });

    if (!refreshToken) {
      throw new Error('Invalid refresh token');
    }

    if (refreshToken.expiresAt < new Date()) {
      // Delete expired token
      await prisma.refreshToken.delete({ where: { id: refreshToken.id } });
      throw new Error('Refresh token expired');
    }

    return {
      userId: refreshToken.user.id,
      companyId: refreshToken.user.companyId,
      email: refreshToken.user.email,
      role: refreshToken.user.role,
    };
  }

  // Revoke refresh token
  async revokeRefreshToken(token: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { token },
    });
  }

  // Revoke all refresh tokens for user (logout everywhere)
  async revokeAllUserTokens(userId: string): Promise<void> {
    await prisma.refreshToken.deleteMany({
      where: { userId },
    });
  }

  // Get user by ID
  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { company: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      companyId: user.companyId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      status: user.status,
      avatarUrl: user.avatarUrl,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      company: {
        id: user.company.id,
        name: user.company.name,
        slug: user.company.slug,
        logoUrl: user.company.logoUrl,
      },
    };
  }
}

export const authService = new AuthService();
