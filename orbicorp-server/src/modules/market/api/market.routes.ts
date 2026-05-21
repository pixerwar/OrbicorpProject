import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { authenticate, AuthenticatedRequest } from '../../shared/middleware/auth.js';
import { marketService } from './market.service.js';
import {
  ListPackagesQuery,
  InstallPackageBody,
  UpdatePackageConfigBody,
  AssignPackageToAgentBody,
  CreatePackageBody,
  listPackagesSchema,
  installPackageSchema,
  updatePackageConfigSchema,
  assignPackageToAgentSchema,
  createPackageSchema,
} from './market.schema.js';

export async function marketRoutes(app: FastifyInstance) {
  
  // ==========================================
  // PUBLIC ENDPOINTS (Market browsing)
  // ==========================================

  // List all published packages (Market sayfası için)
  app.get('/', async (request: FastifyRequest<{ Querystring: ListPackagesQuery }>, reply: FastifyReply) => {
    const { type, category, search, page, limit, sort } = request.query;
    
    const result = await marketService.listPackages({
      type,
      category,
      search,
      page: page || 1,
      limit: limit || 20,
      sort: sort || 'popular',
    });
    
    return reply.send(result);
  });

  // Get package details
  app.get('/:packageId', async (request: FastifyRequest<{ Params: { packageId: string } }>, reply: FastifyReply) => {
    const { packageId } = request.params;
    
    const pkg = await marketService.getPackageById(packageId);
    
    if (!pkg) {
      return reply.status(404).send({ 
        success: false, 
        error: 'Package not found' 
      });
    }
    
    return reply.send({ success: true, data: pkg });
  });

  // Get package by slug/name
  app.get('/by-name/:name', async (request: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
    const { name } = request.params;
    
    const pkg = await marketService.getPackageByName(name);
    
    if (!pkg) {
      return reply.status(404).send({ 
        success: false, 
        error: 'Package not found' 
      });
    }
    
    return reply.send({ success: true, data: pkg });
  });

  // Get categories
  app.get('/meta/categories', async (request, reply) => {
    const categories = await marketService.getCategories();
    return reply.send({ success: true, data: categories });
  });

  // ==========================================
  // AUTHENTICATED ENDPOINTS
  // ==========================================

  // Install package to company
  app.post('/install', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ Body: InstallPackageBody }>, reply: FastifyReply) => {
    const { packageId, config } = request.body;
    const { companyId } = request.user;
    
    try {
      const installation = await marketService.installPackage({
        companyId,
        packageId,
        config,
      });
      
      return reply.status(201).send({ 
        success: true, 
        data: installation,
        message: 'Paket başarıyla kuruldu'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Uninstall package from company
  app.delete('/uninstall/:packageId', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ Params: { packageId: string } }>, reply: FastifyReply) => {
    const { packageId } = request.params;
    const { companyId } = request.user;
    
    try {
      await marketService.uninstallPackage({
        companyId,
        packageId,
      });
      
      return reply.send({ 
        success: true, 
        message: 'Paket kaldırıldı' 
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Get installed packages for company
  app.get('/installed', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest, reply: FastifyReply) => {
    const { companyId } = request.user;
    
    const installations = await marketService.getInstalledPackages(companyId);
    
    return reply.send({ success: true, data: installations });
  });

  // Update package config
  app.patch('/installed/:installationId/config', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { installationId: string },
    Body: UpdatePackageConfigBody 
  }>, reply: FastifyReply) => {
    const { installationId } = request.params;
    const { config } = request.body;
    const { companyId } = request.user;
    
    try {
      const updated = await marketService.updatePackageConfig({
        companyId,
        installationId,
        config,
      });
      
      return reply.send({ 
        success: true, 
        data: updated,
        message: 'Paket ayarları güncellendi'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Toggle installation status (enable/disable)
  app.patch('/installed/:installationId/status', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { installationId: string },
    Body: { status: 'ACTIVE' | 'DISABLED' } 
  }>, reply: FastifyReply) => {
    const { installationId } = request.params;
    const { status } = request.body;
    const { companyId } = request.user;
    
    try {
      const updated = await marketService.updateInstallationStatus({
        companyId,
        installationId,
        status,
      });
      
      return reply.send({ 
        success: true, 
        data: updated 
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // ==========================================
  // AGENT-PACKAGE MANAGEMENT
  // ==========================================

  // Assign package to agent
  app.post('/agents/:agentId/packages', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { agentId: string },
    Body: AssignPackageToAgentBody 
  }>, reply: FastifyReply) => {
    const { agentId } = request.params;
    const { installationId } = request.body;
    const { companyId } = request.user;
    
    try {
      const assignment = await marketService.assignPackageToAgent({
        companyId,
        agentId,
        installationId,
      });
      
      return reply.status(201).send({ 
        success: true, 
        data: assignment,
        message: 'Paket agent\'a eklendi'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Remove package from agent
  app.delete('/agents/:agentId/packages/:installationId', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { agentId: string, installationId: string }
  }>, reply: FastifyReply) => {
    const { agentId, installationId } = request.params;
    const { companyId } = request.user;
    
    try {
      await marketService.removePackageFromAgent({
        companyId,
        agentId,
        installationId,
      });
      
      return reply.send({ 
        success: true, 
        message: 'Paket agent\'dan kaldırıldı' 
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Get packages assigned to agent
  app.get('/agents/:agentId/packages', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { agentId: string }
  }>, reply: FastifyReply) => {
    const { agentId } = request.params;
    const { companyId } = request.user;
    
    const packages = await marketService.getAgentPackages({
      companyId,
      agentId,
    });
    
    return reply.send({ success: true, data: packages });
  });

  // Toggle package enabled/disabled for agent
  app.patch('/agents/:agentId/packages/:installationId', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { agentId: string, installationId: string },
    Body: { enabled: boolean }
  }>, reply: FastifyReply) => {
    const { agentId, installationId } = request.params;
    const { enabled } = request.body;
    const { companyId } = request.user;
    
    try {
      const updated = await marketService.toggleAgentPackage({
        companyId,
        agentId,
        installationId,
        enabled,
      });
      
      return reply.send({ 
        success: true, 
        data: updated 
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // ==========================================
  // PACKAGE CREATION (for developers)
  // ==========================================

  // Create new package (submit to market)
  app.post('/', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ Body: CreatePackageBody }>, reply: FastifyReply) => {
    const { user } = request;
    
    // Only admins can create packages
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ 
        success: false, 
        error: 'Paket oluşturmak için admin yetkisi gerekli' 
      });
    }
    
    try {
      const pkg = await marketService.createPackage({
        ...request.body,
        authorName: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
        authorEmail: user.email,
      });
      
      return reply.status(201).send({ 
        success: true, 
        data: pkg,
        message: 'Paket oluşturuldu'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Update package
  app.patch('/:packageId', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { packageId: string },
    Body: Partial<CreatePackageBody>
  }>, reply: FastifyReply) => {
    const { packageId } = request.params;
    const { user } = request;
    
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ 
        success: false, 
        error: 'Paket güncellemek için admin yetkisi gerekli' 
      });
    }
    
    try {
      const pkg = await marketService.updatePackage(packageId, request.body);
      
      return reply.send({ 
        success: true, 
        data: pkg,
        message: 'Paket güncellendi'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // Publish package
  app.post('/:packageId/publish', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ Params: { packageId: string } }>, reply: FastifyReply) => {
    const { packageId } = request.params;
    const { user } = request;
    
    if (user.role !== 'ADMIN') {
      return reply.status(403).send({ 
        success: false, 
        error: 'Paket yayınlamak için admin yetkisi gerekli' 
      });
    }
    
    try {
      const pkg = await marketService.publishPackage(packageId);
      
      return reply.send({ 
        success: true, 
        data: pkg,
        message: 'Paket yayınlandı'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });

  // ==========================================
  // REVIEWS
  // ==========================================

  // Get package reviews
  app.get('/:packageId/reviews', async (request: FastifyRequest<{ 
    Params: { packageId: string },
    Querystring: { page?: number, limit?: number }
  }>, reply: FastifyReply) => {
    const { packageId } = request.params;
    const { page = 1, limit = 10 } = request.query;
    
    const reviews = await marketService.getPackageReviews(packageId, page, limit);
    
    return reply.send({ success: true, data: reviews });
  });

  // Add review
  app.post('/:packageId/reviews', {
    preHandler: [authenticate],
  }, async (request: AuthenticatedRequest<{ 
    Params: { packageId: string },
    Body: { rating: number, title?: string, comment?: string }
  }>, reply: FastifyReply) => {
    const { packageId } = request.params;
    const { rating, title, comment } = request.body;
    const { companyId, id: userId } = request.user;
    
    try {
      const review = await marketService.addReview({
        packageId,
        companyId,
        userId,
        rating,
        title,
        comment,
      });
      
      return reply.status(201).send({ 
        success: true, 
        data: review,
        message: 'Değerlendirme eklendi'
      });
    } catch (error: any) {
      return reply.status(400).send({ 
        success: false, 
        error: error.message 
      });
    }
  });
}
