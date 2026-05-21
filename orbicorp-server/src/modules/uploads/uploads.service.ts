import { randomUUID } from 'crypto';
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, extname } from 'path';
import { pipeline } from 'stream/promises';
import prisma from '../../shared/utils/prisma.js';

// Supported file types
const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  // Images
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  // PDF
  'application/pdf': ['.pdf'],
  // Office
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
};

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export interface UploadedFile {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  createdAt: Date;
}

export class UploadsService {
  private uploadDir: string;

  constructor() {
    // Create uploads directory if not exists
    this.uploadDir = join(process.cwd(), 'uploads');
    if (!existsSync(this.uploadDir)) {
      mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  // Validate file
  validateFile(mimeType: string, size: number): { valid: boolean; error?: string } {
    if (!ALLOWED_MIME_TYPES[mimeType]) {
      return {
        valid: false,
        error: `Desteklenmeyen dosya türü: ${mimeType}. Desteklenen: resimler, PDF, Word, Excel, PowerPoint`,
      };
    }

    if (size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Dosya çok büyük. Maksimum: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      };
    }

    return { valid: true };
  }

  // Get file extension from mime type
  getExtension(mimeType: string): string {
    const extensions = ALLOWED_MIME_TYPES[mimeType];
    return extensions ? extensions[0] : '';
  }

  // Save file to disk
  async saveFile(
    fileStream: NodeJS.ReadableStream,
    mimeType: string,
    originalName: string,
    companyId: string
  ): Promise<UploadedFile> {
    const id = randomUUID();
    const ext = this.getExtension(mimeType) || extname(originalName);
    const filename = `${id}${ext}`;
    const filepath = join(this.uploadDir, filename);

    // Save to disk
    const writeStream = createWriteStream(filepath);
    await pipeline(fileStream, writeStream);

    // Get file size
    const stats = await import('fs/promises').then(fs => fs.stat(filepath));
    const size = stats.size;

    // Validate size after upload
    if (size > MAX_FILE_SIZE) {
      unlinkSync(filepath);
      throw new Error(`Dosya çok büyük. Maksimum: ${MAX_FILE_SIZE / 1024 / 1024} MB`);
    }

    // Save to database
    const upload = await prisma.upload.create({
      data: {
        id,
        companyId,
        filename,
        originalName,
        mimeType,
        size,
        path: filepath,
      },
    });

    return {
      id: upload.id,
      filename: upload.filename,
      originalName: upload.originalName,
      mimeType: upload.mimeType,
      size: upload.size,
      url: `/uploads/${upload.filename}`,
      createdAt: upload.createdAt,
    };
  }

  // Get upload by ID
  async getById(id: string, companyId: string): Promise<UploadedFile | null> {
    const upload = await prisma.upload.findFirst({
      where: { id, companyId },
    });

    if (!upload) return null;

    return {
      id: upload.id,
      filename: upload.filename,
      originalName: upload.originalName,
      mimeType: upload.mimeType,
      size: upload.size,
      url: `/uploads/${upload.filename}`,
      createdAt: upload.createdAt,
    };
  }

  // Delete upload
  async delete(id: string, companyId: string): Promise<boolean> {
    const upload = await prisma.upload.findFirst({
      where: { id, companyId },
    });

    if (!upload) return false;

    // Delete from disk
    try {
      if (existsSync(upload.path)) {
        unlinkSync(upload.path);
      }
    } catch (e) {
      console.error('Failed to delete file from disk:', e);
    }

    // Delete from database
    await prisma.upload.delete({ where: { id } });

    return true;
  }

  // Check if file is an image
  isImage(mimeType: string): boolean {
    return mimeType.startsWith('image/');
  }
}

export const uploadsService = new UploadsService();
