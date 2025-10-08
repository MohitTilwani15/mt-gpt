import { Injectable } from '@nestjs/common';
import { DeletedTextRun, Document, InsertedTextRun, Packer, Paragraph, TextRun, type ParagraphChild } from 'docx';
import { NodeType, parse, type HTMLElement, type Node as HtmlNode, type TextNode } from 'node-html-parser';

import type { LlmContractReviewResult } from './llm-contract-review.service';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type DiffMode = 'normal' | 'insert' | 'delete';

export interface BuildRedlineDocParams {
  review: LlmContractReviewResult;
  metadata?: {
    contractType?: string;
    messageId?: string;
    subject?: string | null;
    generatedAt?: Date;
  };
  filename?: string;
}

export interface RedlineAttachment {
  filename: string;
  mimeType: string;
  data: string; // base64
}

@Injectable()
export class DocxRedlineService {
  private revisionIdCounter = 1;

  async buildAttachment(params: BuildRedlineDocParams): Promise<RedlineAttachment> {
    const buffer = await this.buildDocumentBuffer(params);
    const filename = params.filename ?? this.buildFilename(params.metadata);

    return {
      filename,
      mimeType: DOCX_MIME,
      data: buffer.toString('base64'),
    };
  }

  async buildDocumentBuffer(params: BuildRedlineDocParams): Promise<Buffer> {
    const { review, metadata } = params;
    const revisionAuthor =
      metadata?.contractType?.trim() && metadata.contractType.length <= 32
        ? `AI Review (${metadata.contractType.toUpperCase()})`
        : 'AI Contract Reviewer';
    const revisionDate = (metadata?.generatedAt ?? new Date()).toISOString();

    this.revisionIdCounter = 1;

    const diffParagraphs = this.buildDiffParagraphs(review.summary[0] ?? '', revisionAuthor, revisionDate); // TODO fix it
    const children = diffParagraphs.length
      ? diffParagraphs
      : [
          new Paragraph({
            children: [
              new TextRun({
                text: 'No tracked changes generated for this document.',
                italics: true,
              }),
            ],
          }),
        ];

    const doc = new Document({
      features: {
        trackRevisions: true,
      },
      sections: [
        {
          children,
        },
      ],
    });

    try {
      return await Packer.toBuffer(doc);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to build DOCX redline document: ${message}`);
    }
  }

  private buildFilename(metadata?: BuildRedlineDocParams['metadata']): string {
    const type = metadata?.contractType ? metadata.contractType.toLowerCase() : 'contract';
    const timestamp = (metadata?.generatedAt ?? new Date()).toISOString().replace(/[:.]/g, '-');
    return `Contract-Review-${this.sanitizeFilenamePart(type)}-${timestamp}.docx`;
  }

  private sanitizeFilenamePart(part: string): string {
    return part.replace(/[^a-z0-9-_]+/gi, '_');
  }

  private buildDiffParagraphs(htmlDiff: string, author: string, revisionDate: string): Paragraph[] {
    const normalized = this.normalizeDiffHtml(htmlDiff);
    if (!normalized.trim()) {
      return [];
    }

    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0);

    const docxParagraphs: Paragraph[] = [];

    for (const paragraph of paragraphs) {
      const isBullet = /^-\s+/.test(paragraph);
      const paragraphContent = isBullet ? paragraph.replace(/^-\s+/, '') : paragraph;
      const runs = this.buildDiffRuns(paragraphContent, author, revisionDate);
      if (!runs.length) {
        continue;
      }
      docxParagraphs.push(
        new Paragraph({
          children: runs,
          spacing: { after: 90 },
          bullet: isBullet ? { level: 0 } : undefined,
        }),
      );
    }

    return docxParagraphs;
  }

  private buildDiffRuns(paragraph: string, author: string, revisionDate: string): ParagraphChild[] {
    const runs: ParagraphChild[] = [];
    let buffer = '';
    let mode: DiffMode = 'normal';
    let index = 0;

    const flush = () => {
      if (!buffer) return;
      const text = buffer;
      buffer = '';

      if (text.length === 0) return;

      if (text.includes('\n')) {
        const parts = text.split('\n');
        parts.forEach((part, idx) => {
          if (part) {
            const run = this.createTrackedRun(part, mode, author, revisionDate);
            if (run) {
              runs.push(run);
            }
          }
          if (idx < parts.length - 1) {
            runs.push(new TextRun({ break: 1 }));
          }
        });
      } else {
        const run = this.createTrackedRun(text, mode, author, revisionDate);
        if (run) {
          runs.push(run);
        }
      }
    };

    while (index < paragraph.length) {
      const remaining = paragraph.slice(index);

      if (remaining.startsWith('[INS]')) {
        flush();
        mode = 'insert';
        index += 5;
        continue;
      }

      if (remaining.startsWith('[/INS]')) {
        flush();
        mode = 'normal';
        index += 6;
        continue;
      }

      if (remaining.startsWith('[DEL]')) {
        flush();
        mode = 'delete';
        index += 5;
        continue;
      }

      if (remaining.startsWith('[/DEL]')) {
        flush();
        mode = 'normal';
        index += 6;
        continue;
      }

      buffer += paragraph[index];
      index += 1;
    }

    flush();
    return runs;
  }

  private createTrackedRun(text: string, mode: DiffMode, author: string, revisionDate: string): ParagraphChild | null {
    const normalized = text.replace(/\s+/g, (match) => (match.includes('\n') ? match : ' '));
    if (!normalized.trim()) {
      return null;
    }

    const id = this.nextRevisionId();

    if (mode === 'insert') {
      return new InsertedTextRun({
        text: normalized,
        author,
        date: revisionDate,
        id,
      });
    }

    if (mode === 'delete') {
      return new DeletedTextRun({
        text: normalized,
        author,
        date: revisionDate,
        id,
      });
    }

    return new TextRun({ text: normalized });
  }

  private nextRevisionId(): number {
    return this.revisionIdCounter++;
  }

  private normalizeDiffHtml(html: string): string {
    if (!html) return '';

    let container: HTMLElement;
    try {
      container = parse(`<div>${html}</div>`, {
        lowerCaseTagName: true,
        comment: false,
      });
    } catch {
      return this.legacyNormalizeDiffHtml(html);
    }

    const parts: string[] = [];
    const blockTags = new Set([
      'p',
      'div',
      'section',
      'article',
      'header',
      'footer',
      'aside',
      'main',
      'pre',
      'blockquote',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'tr',
      'td',
      'th',
    ]);

    const appendSeparator = (separator: string) => {
      if (!parts.length) {
        parts.push(separator);
        return;
      }

      const last = parts[parts.length - 1];
      if (last.endsWith(separator)) {
        return;
      }

      parts.push(separator);
    };

    const processNode = (node: HtmlNode): void => {
      if (node.nodeType === NodeType.TEXT_NODE) {
        const textNode = node as TextNode;
        let text = textNode.text.replace(/\u00a0/g, ' ');

        if (!text.trim()) {
          if (text.includes('\n')) {
            appendSeparator('\n');
          } else if (parts.length && !parts[parts.length - 1].endsWith(' ')) {
            parts.push(' ');
          }
          return;
        }

        parts.push(text);
        return;
      }

      if (node.nodeType !== NodeType.ELEMENT_NODE) {
        return;
      }

      const element = node as HTMLElement;
      const tag = element.tagName.toLowerCase();

      if (tag === 'br') {
        appendSeparator('\n');
        return;
      }

      if (tag === 'ins') {
        parts.push('[INS]');
        element.childNodes.forEach(processNode);
        parts.push('[/INS]');
        return;
      }

      if (tag === 'del') {
        parts.push('[DEL]');
        element.childNodes.forEach(processNode);
        parts.push('[/DEL]');
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        element.childNodes.forEach(processNode);
        appendSeparator('\n');
        return;
      }

      if (tag === 'li') {
        parts.push('- ');
        element.childNodes.forEach(processNode);
        appendSeparator('\n\n');
        return;
      }

      const isBlock = blockTags.has(tag);
      const beforeLength = parts.length;
      element.childNodes.forEach(processNode);

      if (isBlock && parts.length > beforeLength) {
        appendSeparator('\n\n');
      }
    };

    container.childNodes.forEach(processNode);

    let normalized = parts.join('').replace(/\r\n/g, '\n');
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    normalized = normalized.replace(/[ \t]+\n/g, '\n');
    normalized = normalized.replace(/\n[ \t]+/g, '\n');

    const trimmed = normalized.trim();
    return trimmed.length ? trimmed : this.legacyNormalizeDiffHtml(html);
  }

  private legacyNormalizeDiffHtml(html: string): string {
    if (!html) return '';

    return (
      html
        .replace(/\r\n/g, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/li>/gi, '\n')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<ins[^>]*>/gi, '[INS]')
        .replace(/<\/ins>/gi, '[/INS]')
        .replace(/<del[^>]*>/gi, '[DEL]')
        .replace(/<\/del>/gi, '[/DEL]')
        .replace(/<[^>]+>/g, '')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
    );
  }
}
