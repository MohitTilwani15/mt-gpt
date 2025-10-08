import { Injectable } from '@nestjs/common';
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
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
    const generatedAt = metadata?.generatedAt ?? new Date();

    const children: Paragraph[] = [
      new Paragraph({
        text: 'Contract Review Report',
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }),
    ];

    if (metadata?.subject) {
      children.push(
        new Paragraph({
          text: `Subject: ${metadata.subject}`,
          spacing: { after: 120 },
        }),
      );
    }

    if (metadata?.contractType) {
      children.push(
        new Paragraph({
          text: `Contract type: ${metadata.contractType.toUpperCase()}`,
          spacing: { after: 120 },
        }),
      );
    }

    if (metadata?.messageId) {
      children.push(
        new Paragraph({
          text: `Message ID: ${metadata.messageId}`,
          spacing: { after: 120 },
        }),
      );
    }

    children.push(
      new Paragraph({
        text: `Generated at: ${generatedAt.toISOString()}`,
        spacing: { after: 240 },
      }),
    );

    children.push(
      new Paragraph({
        text: 'Summary',
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 120 },
      }),
    );

    if (review.summary?.trim()) {
      for (const line of this.splitLines(review.summary)) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line })],
            spacing: { after: 120 },
          }),
        );
      }
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No summary provided.',
              italics: true,
            }),
          ],
          spacing: { after: 120 },
        }),
      );
    }

    children.push(
      new Paragraph({
        text: 'Identified Issues',
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 120 },
      }),
    );

    if (review.issues?.length) {
      for (const issue of review.issues) {
        const headerParts = [
          issue.title?.trim() || 'Issue',
          issue.severity ? `(${issue.severity.toUpperCase()})` : null,
        ].filter(Boolean);

        children.push(
          new Paragraph({
            text: headerParts.join(' '),
            bullet: { level: 0 },
            spacing: { after: 60 },
          }),
        );

        const detailText = [issue.detail, issue.recommendation].filter((part) => part?.trim()).join('\n\n');
        if (detailText) {
          for (const detailLine of this.splitLines(detailText)) {
            children.push(
              new Paragraph({
                children: [new TextRun({ text: detailLine })],
                spacing: { after: 60 },
                indent: { left: 720 },
              }),
            );
          }
        }
      }
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No issues were highlighted by the automated review.',
              italics: true,
            }),
          ],
          spacing: { after: 120 },
        }),
      );
    }

    children.push(
      new Paragraph({
        text: 'AI Redline Diff',
        heading: HeadingLevel.HEADING_2,
        spacing: { after: 120 },
      }),
    );

    const diffParagraphs = this.buildDiffParagraphs(review.htmlDiff ?? '');
    if (diffParagraphs.length) {
      children.push(...diffParagraphs);
    } else {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'No diff content available.',
              italics: true,
            }),
          ],
        }),
      );
    }

    const doc = new Document({
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

  private splitLines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private sanitizeFilenamePart(part: string): string {
    return part.replace(/[^a-z0-9-_]+/gi, '_');
  }

  private buildDiffParagraphs(htmlDiff: string): Paragraph[] {
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
      const runs = this.buildDiffRuns(paragraphContent);
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

  private buildDiffRuns(paragraph: string): TextRun[] {
    const runs: TextRun[] = [];
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
            runs.push(this.createTextRun(part, mode));
          }
          if (idx < parts.length - 1) {
            runs.push(new TextRun({ break: 1 }));
          }
        });
      } else {
        runs.push(this.createTextRun(text, mode));
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

  private createTextRun(text: string, mode: DiffMode): TextRun {
    if (mode === 'insert') {
      return new TextRun({
        text,
        color: '006100',
        bold: true,
      });
    }

    if (mode === 'delete') {
      return new TextRun({
        text,
        color: 'C00000',
        strike: true,
      });
    }

    return new TextRun({ text });
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
