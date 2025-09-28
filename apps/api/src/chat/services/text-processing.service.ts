import { Injectable } from '@nestjs/common';
import { UIMessage } from 'ai';

@Injectable()
export class TextProcessingService {
  extractTextFromParts(parts: UIMessage['parts'] | undefined): string {
    if (!parts) return '';
    
    return parts
      .filter((p: any) => p?.type === 'text' && typeof (p as any).text === 'string')
      .map((p: any) => (p as any).text)
      .join(' ')
      .slice(0, 4000); // Reasonable limit to prevent memory issues
  }

  sanitizeText(text: string): string {
    if (typeof text !== 'string') {
      return '';
    }
    
    return text
      .trim()
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .slice(0, 10000); // Reasonable limit
  }

  isValidTextContent(text: string): boolean {
    return Boolean(text && text.trim().length > 0);
  }

  truncateText(text: string, maxLength: number = 100): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    
    return text.slice(0, maxLength - 3) + '...';
  }

  formatKnowledgeSnippets(knowledgeRecords: Array<{ text?: string | null; fileName?: string }>): string | null {
    const snippets = knowledgeRecords
      .filter((record) => record.text && record.text.trim())
      .slice(0, 5)
      .map((record) => {
        const truncated = record.text!.trim().slice(0, 1600);
        return `- ${record.fileName || 'Unknown'}: ${truncated}`;
      });

    return snippets.length > 0 
      ? `Long-term assistant knowledge:\\n${snippets.join('\\n')}`
      : null;
  }

  generateConversationSummary(userText: string, aiText: string): { 
    summary: string; 
    keyTopics: string[]; 
  } {
    // Simple keyword extraction (in production, you might use more sophisticated NLP)
    const combinedText = `${userText} ${aiText}`.toLowerCase();
    const words = combinedText.split(/\\s+/);
    
    // Extract potential key topics (words longer than 4 characters, excluding common words)
    const stopWords = new Set(['that', 'this', 'with', 'have', 'will', 'from', 'they', 'been', 'said', 'each', 'which', 'their', 'time', 'what', 'about', 'would', 'there', 'could', 'other', 'more', 'after', 'first', 'well', 'year', 'work', 'such', 'make', 'even', 'here', 'good', 'much', 'need', 'may']);
    
    const keyTopics = words
      .filter(word => word.length > 4 && !stopWords.has(word) && /^[a-zA-Z]+$/.test(word))
      .reduce((acc, word) => {
        acc[word] = (acc[word] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    const topTopics = Object.entries(keyTopics)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([word]) => word);

    const summary = this.truncateText(`${userText} -> ${aiText}`, 200);
    
    return {
      summary,
      keyTopics: topTopics,
    };
  }
}
