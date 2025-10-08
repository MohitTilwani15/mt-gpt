import { Paragraph } from 'docx';

import { DocxRedlineService } from './docx-redline.service';

describe('DocxRedlineService', () => {
  let service: DocxRedlineService;

  beforeEach(() => {
    service = new DocxRedlineService();
  });

  const normalize = (html: string) => (service as any).normalizeDiffHtml(html) as string;
  const buildDiffParagraphs = (html: string) => (service as any).buildDiffParagraphs(html) as Paragraph[];

  it('normalizes nested diff markup using DOM traversal', () => {
    const html = '<p>Hello <ins><strong>new</strong></ins> world</p><p><del>Old</del> text</p>';

    const normalized = normalize(html);

    expect(normalized).toBe('Hello [INS]new[/INS] world\n\n[DEL]Old[/DEL] text');
  });

  it('converts list items into bullet paragraphs with diff styling intact', () => {
    const html = '<ul><li>Added <ins>clause</ins></li><li><del>Removed</del> term</li></ul>';

    const paragraphs = buildDiffParagraphs(html);

    expect(paragraphs).toHaveLength(2);
    for (const paragraph of paragraphs) {
      const numbering = (paragraph as any).properties.root.find((node: any) => node.rootKey === 'w:numPr');
      expect(numbering).toBeDefined();
    }

    const runs = (paragraphs[0] as any).root.filter((node: any) => node.rootKey === 'w:r');
    expect(runs.length).toBeGreaterThan(0);
  });

  it('falls back to legacy normalization when html parsing yields no content', () => {
    const html = '<div><unknown></unknown></div>';

    const normalized = normalize(html);

    expect(normalized).toBe('');
  });
});
