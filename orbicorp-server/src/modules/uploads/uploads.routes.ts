import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { uploadsService } from './uploads.service.js';
import { authMiddleware } from '../../shared/middleware/auth.js';

export async function uploadsRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook('preHandler', authMiddleware);

  // POST /api/v1/uploads - Upload file
  app.post('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const data = await request.file();
      
      if (!data) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Dosya bulunamadı',
        });
      }

      // Validate file type
      const validation = uploadsService.validateFile(data.mimetype, 0);
      if (!validation.valid) {
        return reply.status(400).send({
          success: false,
          error: 'Bad Request',
          message: validation.error,
        });
      }

      // Save file
      const upload = await uploadsService.saveFile(
        data.file,
        data.mimetype,
        data.filename,
        request.user!.companyId
      );

      return reply.status(201).send({
        success: true,
        data: upload,
        message: 'Dosya başarıyla yüklendi',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Dosya yüklenemedi';
      return reply.status(400).send({
        success: false,
        error: 'Bad Request',
        message,
      });
    }
  });

  // GET /api/v1/uploads/:id - Get upload info
  app.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const upload = await uploadsService.getById(
        request.params.id,
        request.user!.companyId
      );

      if (!upload) {
        return reply.status(404).send({
          success: false,
          error: 'Not Found',
          message: 'Dosya bulunamadı',
        });
      }

      return reply.send({
        success: true,
        data: upload,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Dosya bilgisi alınamadı',
      });
    }
  });

  // DELETE /api/v1/uploads/:id - Delete upload
  app.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const deleted = await uploadsService.delete(
        request.params.id,
        request.user!.companyId
      );

      if (!deleted) {
        return reply.status(404).send({
          success: false,
          error: 'Not Found',
          message: 'Dosya bulunamadı',
        });
      }

      return reply.send({
        success: true,
        message: 'Dosya silindi',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: 'Internal Server Error',
        message: 'Dosya silinemedi',
      });
    }
  });
}
