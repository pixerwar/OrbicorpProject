import { prisma } from '../../shared/utils/prisma.js';
import { PackageType, PricingModel, PackageStatus, InstallationStatus } from '@prisma/client';

// ==========================================
// TYPES
// ==========================================

interface ListPackagesParams {
  type?: PackageType;
  category?: string;
  search?: string;
  page: number;
  limit: number;
  sort: 'popular' | 'newest' | 'rating' | 'name';
}

interface InstallPackageParams {
  companyId: string;
  packageId: string;
  config?: Record<string, any>;
}

interface AssignPackageParams {
  companyId: string;
  agentId: string;
  installationId: string;
}

// ==========================================
// SERVICE
// ==========================================

class MarketService {

  // ==========================================
  // PACKAGE LISTING & DETAILS
  // ==========================================

  async listPackages(params: ListPackagesParams) {
    const { type, category, search, page, limit, sort } = params;
    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      status: 'PUBLISHED',
    };

    if (type) {
      where.type = type;
    }

    if (category) {
      where.category = category;
    }

    if (search) {
      where.OR = [
        { displayName: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { tags: { has: search.toLowerCase() } },
      ];
    }

    // Build order by
    let orderBy: any = {};
    switch (sort) {
      case 'popular':
        orderBy = { installCount: 'desc' };
        break;
      case 'newest':
        orderBy = { publishedAt: 'desc' };
        break;
      case 'rating':
        orderBy = { rating: 'desc' };
        break;
      case 'name':
        orderBy = { displayName: 'asc' };
        break;
    }

    const [packages, total] = await Promise.all([
      prisma.marketPackage.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        select: {
          id: true,
          name: true,
          version: true,
          type: true,
          displayName: true,
          description: true,
          icon: true,
          category: true,
          tags: true,
          authorName: true,
          pricingModel: true,
          price: true,
          currency: true,
          installCount: true,
          rating: true,
          reviewCount: true,
          isOfficial: true,
          isVerified: true,
          publishedAt: true,
        },
      }),
      prisma.marketPackage.count({ where }),
    ]);

    return {
      success: true,
      data: packages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPackageById(packageId: string) {
    return prisma.marketPackage.findUnique({
      where: { id: packageId },
      include: {
        _count: {
          select: { installations: true, reviews: true },
        },
      },
    });
  }

  async getPackageByName(name: string) {
    return prisma.marketPackage.findUnique({
      where: { name },
      include: {
        _count: {
          select: { installations: true, reviews: true },
        },
      },
    });
  }

  async getCategories() {
    const categories = await prisma.marketPackage.groupBy({
      by: ['category'],
      where: { status: 'PUBLISHED', category: { not: null } },
      _count: true,
    });

    return categories.map(c => ({
      name: c.category,
      count: c._count,
    }));
  }

  // ==========================================
  // INSTALLATION MANAGEMENT
  // ==========================================

  async installPackage(params: InstallPackageParams) {
    const { companyId, packageId, config } = params;

    // Check if package exists and is published
    const pkg = await prisma.marketPackage.findUnique({
      where: { id: packageId },
    });

    if (!pkg) {
      throw new Error('Paket bulunamadı');
    }

    if (pkg.status !== 'PUBLISHED') {
      throw new Error('Bu paket henüz yayınlanmamış');
    }

    // Check if already installed
    const existing = await prisma.packageInstallation.findUnique({
      where: {
        companyId_packageId: { companyId, packageId },
      },
    });

    if (existing) {
      throw new Error('Bu paket zaten kurulu');
    }

    // Check if config is required
    const configSchema = pkg.configSchema as Record<string, any> || {};
    const requiredFields = Object.entries(configSchema)
      .filter(([_, field]: [string, any]) => field.required)
      .map(([key]) => key);

    const providedConfig = config || {};
    const missingFields = requiredFields.filter(f => !providedConfig[f]);

    let status: InstallationStatus = 'ACTIVE';
    if (missingFields.length > 0) {
      status = 'PENDING_CONFIG';
    }

    // Create installation
    const installation = await prisma.packageInstallation.create({
      data: {
        companyId,
        packageId,
        version: pkg.version,
        config: providedConfig,
        status,
      },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            displayName: true,
            type: true,
            icon: true,
          },
        },
      },
    });

    // Increment install count
    await prisma.marketPackage.update({
      where: { id: packageId },
      data: { installCount: { increment: 1 } },
    });

    return installation;
  }

  async uninstallPackage(params: { companyId: string; packageId: string }) {
    const { companyId, packageId } = params;

    // Find installation
    const installation = await prisma.packageInstallation.findUnique({
      where: {
        companyId_packageId: { companyId, packageId },
      },
    });

    if (!installation) {
      throw new Error('Bu paket kurulu değil');
    }

    // Delete all agent assignments first
    await prisma.agentPackage.deleteMany({
      where: { installationId: installation.id },
    });

    // Delete installation
    await prisma.packageInstallation.delete({
      where: { id: installation.id },
    });

    // Decrement install count
    await prisma.marketPackage.update({
      where: { id: packageId },
      data: { installCount: { decrement: 1 } },
    });

    return true;
  }

  async getInstalledPackages(companyId: string) {
    return prisma.packageInstallation.findMany({
      where: { companyId },
      include: {
        package: {
          select: {
            id: true,
            name: true,
            displayName: true,
            description: true,
            type: true,
            icon: true,
            category: true,
            version: true,
            configSchema: true,
          },
        },
        agentPackages: {
          select: {
            agentId: true,
            enabled: true,
          },
        },
      },
      orderBy: { installedAt: 'desc' },
    });
  }

  async updatePackageConfig(params: {
    companyId: string;
    installationId: string;
    config: Record<string, any>;
  }) {
    const { companyId, installationId, config } = params;

    const installation = await prisma.packageInstallation.findFirst({
      where: { id: installationId, companyId },
      include: { package: true },
    });

    if (!installation) {
      throw new Error('Kurulum bulunamadı');
    }

    // Merge configs
    const newConfig = { ...installation.config as object, ...config };

    // Check if all required fields are now provided
    const configSchema = installation.package.configSchema as Record<string, any> || {};
    const requiredFields = Object.entries(configSchema)
      .filter(([_, field]: [string, any]) => field.required)
      .map(([key]) => key);

    const missingFields = requiredFields.filter(f => !newConfig[f]);
    const newStatus = missingFields.length > 0 ? 'PENDING_CONFIG' : 'ACTIVE';

    return prisma.packageInstallation.update({
      where: { id: installationId },
      data: {
        config: newConfig,
        status: newStatus as InstallationStatus,
      },
    });
  }

  async updateInstallationStatus(params: {
    companyId: string;
    installationId: string;
    status: 'ACTIVE' | 'DISABLED';
  }) {
    const { companyId, installationId, status } = params;

    const installation = await prisma.packageInstallation.findFirst({
      where: { id: installationId, companyId },
    });

    if (!installation) {
      throw new Error('Kurulum bulunamadı');
    }

    return prisma.packageInstallation.update({
      where: { id: installationId },
      data: { status: status as InstallationStatus },
    });
  }

  // ==========================================
  // AGENT-PACKAGE MANAGEMENT
  // ==========================================

  async assignPackageToAgent(params: AssignPackageParams) {
    const { companyId, agentId, installationId } = params;

    // Verify agent belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, companyId },
    });

    if (!agent) {
      throw new Error('Agent bulunamadı');
    }

    // Verify installation belongs to company
    const installation = await prisma.packageInstallation.findFirst({
      where: { id: installationId, companyId },
    });

    if (!installation) {
      throw new Error('Paket kurulumu bulunamadı');
    }

    // Check if already assigned
    const existing = await prisma.agentPackage.findUnique({
      where: {
        agentId_installationId: { agentId, installationId },
      },
    });

    if (existing) {
      throw new Error('Bu paket zaten bu agent\'a atanmış');
    }

    return prisma.agentPackage.create({
      data: {
        agentId,
        installationId,
        enabled: true,
      },
      include: {
        installation: {
          include: {
            package: {
              select: {
                id: true,
                name: true,
                displayName: true,
                type: true,
                icon: true,
              },
            },
          },
        },
      },
    });
  }

  async removePackageFromAgent(params: AssignPackageParams) {
    const { companyId, agentId, installationId } = params;

    // Verify agent belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, companyId },
    });

    if (!agent) {
      throw new Error('Agent bulunamadı');
    }

    const assignment = await prisma.agentPackage.findUnique({
      where: {
        agentId_installationId: { agentId, installationId },
      },
    });

    if (!assignment) {
      throw new Error('Bu paket bu agent\'a atanmamış');
    }

    await prisma.agentPackage.delete({
      where: { id: assignment.id },
    });

    return true;
  }

  async getAgentPackages(params: { companyId: string; agentId: string }) {
    const { companyId, agentId } = params;

    // Verify agent belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, companyId },
    });

    if (!agent) {
      throw new Error('Agent bulunamadı');
    }

    return prisma.agentPackage.findMany({
      where: { agentId },
      include: {
        installation: {
          include: {
            package: {
              select: {
                id: true,
                name: true,
                displayName: true,
                description: true,
                type: true,
                icon: true,
                tools: true,
                manifest: true,
              },
            },
          },
        },
      },
    });
  }

  async toggleAgentPackage(params: {
    companyId: string;
    agentId: string;
    installationId: string;
    enabled: boolean;
  }) {
    const { companyId, agentId, installationId, enabled } = params;

    // Verify agent belongs to company
    const agent = await prisma.agent.findFirst({
      where: { id: agentId, companyId },
    });

    if (!agent) {
      throw new Error('Agent bulunamadı');
    }

    const assignment = await prisma.agentPackage.findUnique({
      where: {
        agentId_installationId: { agentId, installationId },
      },
    });

    if (!assignment) {
      throw new Error('Bu paket bu agent\'a atanmamış');
    }

    return prisma.agentPackage.update({
      where: { id: assignment.id },
      data: { enabled },
    });
  }

  // ==========================================
  // PACKAGE CREATION
  // ==========================================

  async createPackage(data: any) {
    // Check if name is unique
    const existing = await prisma.marketPackage.findUnique({
      where: { name: data.name },
    });

    if (existing) {
      throw new Error('Bu isimde bir paket zaten mevcut');
    }

    // Build manifest
    const manifest = {
      name: data.name,
      version: data.version,
      type: data.type.toLowerCase(),
      displayName: data.displayName,
      description: data.description,
      icon: data.icon,
      category: data.category,
      tags: data.tags || [],
      author: {
        name: data.authorName,
        email: data.authorEmail,
      },
      pricing: {
        model: data.pricingModel?.toLowerCase() || 'free',
        price: data.price,
        currency: data.currency,
      },
      tools: data.tools || [],
      config: data.configSchema || {},
      systemPromptAddition: data.systemPromptAddition,
      agentTemplate: data.agentTemplate,
      workflowTemplate: data.workflowTemplate,
      translations: data.translations,
      readme: data.readme,
    };

    return prisma.marketPackage.create({
      data: {
        name: data.name,
        version: data.version || '1.0.0',
        type: data.type,
        displayName: data.displayName,
        description: data.description,
        icon: data.icon,
        category: data.category,
        tags: data.tags || [],
        authorName: data.authorName,
        authorEmail: data.authorEmail,
        pricingModel: data.pricingModel || 'FREE',
        price: data.price || 0,
        currency: data.currency || 'USD',
        minVersion: data.minVersion,
        providers: data.providers || [],
        permissions: data.permissions || [],
        dependencies: data.dependencies || [],
        manifest,
        tools: data.tools || [],
        configSchema: data.configSchema || {},
        status: 'DRAFT',
        isOfficial: false,
        isVerified: false,
      },
    });
  }

  async updatePackage(packageId: string, data: Partial<any>) {
    const pkg = await prisma.marketPackage.findUnique({
      where: { id: packageId },
    });

    if (!pkg) {
      throw new Error('Paket bulunamadı');
    }

    // Build updated manifest
    const currentManifest = pkg.manifest as any || {};
    const updatedManifest = {
      ...currentManifest,
      ...data,
      version: data.version || currentManifest.version,
    };

    return prisma.marketPackage.update({
      where: { id: packageId },
      data: {
        ...data,
        manifest: updatedManifest,
        updatedAt: new Date(),
      },
    });
  }

  async publishPackage(packageId: string) {
    const pkg = await prisma.marketPackage.findUnique({
      where: { id: packageId },
    });

    if (!pkg) {
      throw new Error('Paket bulunamadı');
    }

    if (pkg.status === 'PUBLISHED') {
      throw new Error('Paket zaten yayında');
    }

    return prisma.marketPackage.update({
      where: { id: packageId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
      },
    });
  }

  // ==========================================
  // REVIEWS
  // ==========================================

  async getPackageReviews(packageId: string, page: number, limit: number) {
    const skip = (page - 1) * limit;

    const [reviews, total] = await Promise.all([
      prisma.packageReview.findMany({
        where: { packageId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.packageReview.count({ where: { packageId } }),
    ]);

    return {
      reviews,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async addReview(params: {
    packageId: string;
    companyId: string;
    userId: string;
    rating: number;
    title?: string;
    comment?: string;
  }) {
    const { packageId, companyId, userId, rating, title, comment } = params;

    // Check if package exists
    const pkg = await prisma.marketPackage.findUnique({
      where: { id: packageId },
    });

    if (!pkg) {
      throw new Error('Paket bulunamadı');
    }

    // Check if company has installed the package
    const installation = await prisma.packageInstallation.findUnique({
      where: {
        companyId_packageId: { companyId, packageId },
      },
    });

    if (!installation) {
      throw new Error('Değerlendirmek için paketi kurmuş olmalısınız');
    }

    // Check if already reviewed
    const existing = await prisma.packageReview.findUnique({
      where: {
        packageId_companyId: { packageId, companyId },
      },
    });

    if (existing) {
      // Update existing review
      const review = await prisma.packageReview.update({
        where: { id: existing.id },
        data: { rating, title, comment },
      });

      // Recalculate average rating
      await this.recalculateRating(packageId);

      return review;
    }

    // Create new review
    const review = await prisma.packageReview.create({
      data: {
        packageId,
        companyId,
        userId,
        rating,
        title,
        comment,
      },
    });

    // Recalculate average rating
    await this.recalculateRating(packageId);

    return review;
  }

  private async recalculateRating(packageId: string) {
    const result = await prisma.packageReview.aggregate({
      where: { packageId },
      _avg: { rating: true },
      _count: true,
    });

    await prisma.marketPackage.update({
      where: { id: packageId },
      data: {
        rating: result._avg.rating || 0,
        reviewCount: result._count,
      },
    });
  }

  // ==========================================
  // HELPER: Get tools for agent
  // ==========================================

  async getToolsForAgent(agentId: string): Promise<any[]> {
    const packages = await prisma.agentPackage.findMany({
      where: {
        agentId,
        enabled: true,
        installation: {
          status: 'ACTIVE',
        },
      },
      include: {
        installation: {
          include: {
            package: {
              select: {
                type: true,
                tools: true,
                manifest: true,
              },
            },
          },
        },
      },
    });

    const tools: any[] = [];

    for (const ap of packages) {
      const pkg = ap.installation.package;
      if (pkg.type === 'SKILL' || pkg.type === 'TOOL') {
        const pkgTools = pkg.tools as any[] || [];
        tools.push(...pkgTools);
      }
    }

    return tools;
  }

  async getSystemPromptAdditionsForAgent(agentId: string): Promise<string[]> {
    const packages = await prisma.agentPackage.findMany({
      where: {
        agentId,
        enabled: true,
        installation: {
          status: 'ACTIVE',
        },
      },
      include: {
        installation: {
          include: {
            package: {
              select: {
                manifest: true,
              },
            },
          },
        },
      },
    });

    const additions: string[] = [];

    for (const ap of packages) {
      const manifest = ap.installation.package.manifest as any;
      if (manifest?.systemPromptAddition) {
        additions.push(manifest.systemPromptAddition);
      }
    }

    return additions;
  }
}

export const marketService = new MarketService();
