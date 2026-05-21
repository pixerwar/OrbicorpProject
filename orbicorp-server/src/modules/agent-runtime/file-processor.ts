import * as fs from 'fs';
import * as path from 'path';
import { TextContent, ImageContent, DocumentContent } from './llm-types.js';

export interface ProcessedFile {
  type: 'image' | 'document' | 'text';
  content: TextContent | ImageContent | DocumentContent;
  originalName: string;
  mimeType: string;
}

export interface FileAttachment {
  id: string;
  filename: string;
  originalName: string;
  mimeType: string;
  url: string;
}

// Supported image types
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Supported document types
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
];

export class FileProcessor {
  private uploadsDir: string;

  constructor(uploadsDir: string = './uploads') {
    this.uploadsDir = uploadsDir;
  }

  /**
   * Process attachments and convert them to LLM-compatible content
   */
  async processAttachments(attachments: FileAttachment[]): Promise<ProcessedFile[]> {
    const results: ProcessedFile[] = [];

    for (const attachment of attachments) {
      try {
        const processed = await this.processFile(attachment);
        if (processed) {
          results.push(processed);
        }
      } catch (error) {
        console.error(`Error processing file ${attachment.originalName}:`, error);
        // Add error info as text
        results.push({
          type: 'text',
          content: {
            type: 'text',
            text: `[Dosya işlenemedi: ${attachment.originalName} - ${error instanceof Error ? error.message : 'Bilinmeyen hata'}]`,
          },
          originalName: attachment.originalName,
          mimeType: attachment.mimeType,
        });
      }
    }

    return results;
  }

  /**
   * Process a single file
   */
  private async processFile(attachment: FileAttachment): Promise<ProcessedFile | null> {
    const filePath = path.join(this.uploadsDir, attachment.filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      return null;
    }

    const mimeType = attachment.mimeType;

    // Handle images
    if (IMAGE_TYPES.includes(mimeType)) {
      return this.processImage(filePath, attachment);
    }

    // Handle PDFs
    if (mimeType === 'application/pdf') {
      return this.processPDF(filePath, attachment);
    }

    // Handle Office documents
    if (DOCUMENT_TYPES.includes(mimeType)) {
      return this.processOfficeDocument(filePath, attachment);
    }

    // Unknown type - return as text note
    return {
      type: 'text',
      content: {
        type: 'text',
        text: `[Ek dosya: ${attachment.originalName} (${mimeType}) - Bu dosya türü desteklenmiyor]`,
      },
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * Process image file - convert to base64
   */
  private async processImage(filePath: string, attachment: FileAttachment): Promise<ProcessedFile> {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    return {
      type: 'image',
      content: {
        type: 'image',
        source: {
          type: 'base64',
          media_type: attachment.mimeType,
          data: base64Data,
        },
      },
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * Process PDF file
   * For now, we'll send as base64 for models that support it (Claude)
   * and extract text for others
   */
  private async processPDF(filePath: string, attachment: FileAttachment): Promise<ProcessedFile> {
    const fileBuffer = fs.readFileSync(filePath);
    const base64Data = fileBuffer.toString('base64');

    // Try to extract text from PDF for fallback
    let extractedText = '';
    try {
      // Simple PDF text extraction (basic - just look for text streams)
      // For production, use pdf-parse or similar library
      extractedText = await this.extractPDFText(fileBuffer);
    } catch (e) {
      console.warn('Could not extract PDF text:', e);
    }

    return {
      type: 'document',
      content: {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Data,
        },
        extractedText: extractedText || `[PDF dosyası: ${attachment.originalName}]`,
      },
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * Process Office documents (DOCX, XLSX, PPTX)
   * Extract text content for LLM
   */
  private async processOfficeDocument(filePath: string, attachment: FileAttachment): Promise<ProcessedFile> {
    let extractedText = '';

    try {
      // Office documents are ZIP files with XML content
      // For production, use mammoth (docx), xlsx, or pptx-parser libraries
      extractedText = await this.extractOfficeText(filePath, attachment.mimeType);
    } catch (e) {
      console.warn('Could not extract Office document text:', e);
      extractedText = `[${attachment.originalName} dosyasının içeriği çıkarılamadı]`;
    }

    return {
      type: 'text',
      content: {
        type: 'text',
        text: `📄 ${attachment.originalName}:\n\n${extractedText}`,
      },
      originalName: attachment.originalName,
      mimeType: attachment.mimeType,
    };
  }

  /**
   * Basic PDF text extraction
   * For production, replace with pdf-parse library
   */
  private async extractPDFText(buffer: Buffer): Promise<string> {
    // Basic extraction - look for text between BT and ET markers
    const content = buffer.toString('binary');
    const textMatches: string[] = [];
    
    // Very basic - just return a placeholder for now
    // In production, use: const pdfParse = require('pdf-parse'); const data = await pdfParse(buffer);
    return '[PDF içeriği - metin çıkarma için pdf-parse kütüphanesi gerekli]';
  }

  /**
   * Basic Office document text extraction
   * For production, use mammoth, xlsx, pptx-parser libraries
   */
  private async extractOfficeText(filePath: string, mimeType: string): Promise<string> {
    // For production, implement proper extraction:
    // - DOCX: use mammoth
    // - XLSX: use xlsx/exceljs
    // - PPTX: use pptx-parser or similar

    const typeMap: Record<string, string> = {
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word belgesi',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel tablosu',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint sunumu',
    };

    const typeName = typeMap[mimeType] || 'Office belgesi';
    return `[${typeName} - içerik çıkarma için ilgili kütüphane gerekli]`;
  }
}

export const fileProcessor = new FileProcessor('./uploads');
