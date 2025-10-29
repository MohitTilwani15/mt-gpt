import pg from 'pg';
import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const { Pool } = pg;

// ============================================================================
// Configuration
// ============================================================================

const config = {
  docNameColumn: 'doc_name',
  defaults: {
    maxFiles: 500,
    maxResults: 5,
    model: 'gpt-5-nano',
    reloadInterval: 10 * 60 * 1000, // 10 minutes
  },
  limits: {
    minFileNameLength: 3,
    maxDbLimit: 2000,
    maxQuestionLength: 1200,
    maxSnippetLength: 200,
  },
};

// ============================================================================
// Utilities
// ============================================================================

const escapeRegExp = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeFilename = (name) => {
  if (!name?.trim()) return null;
  
  const normalized = name.trim().replace(/\\/g, '/').toLowerCase();
  const baseName = normalized.split('/').pop();
  const baseNameNoExt = baseName.replace(/\.[^.]*$/, '');
  
  return { original: name, normalized, baseName, baseNameNoExt };
};

const formatQuerySnippet = (text) => {
  if (!text?.trim()) return '';
  const condensed = text.replace(/\s+/g, ' ').trim();
  const { maxSnippetLength } = config.limits;
  return condensed.length <= maxSnippetLength 
    ? condensed 
    : `${condensed.slice(0, maxSnippetLength)}…`;
};

// ============================================================================
// Matching Logic
// ============================================================================

const matchesQuestion = (file, question) => {
  const q = question.toLowerCase();
  
  if (q.includes(file.normalized)) return true;
  if (file.baseName.includes('.') && q.includes(file.baseName)) return true;
  
  if (file.baseNameNoExt.length >= config.limits.minFileNameLength) {
    const pattern = `\\b${escapeRegExp(file.baseNameNoExt)}\\b`;
    if (new RegExp(pattern, 'i').test(question)) return true;
  }
  
  return false;
};

const findMatches = (question, fileRecords) => {
  const seen = new Set();
  return fileRecords.filter(file => {
    if (matchesQuestion(file, question) && !seen.has(file.normalized)) {
      seen.add(file.normalized);
      return true;
    }
    return false;
  });
};

const deduplicateFiles = (...fileLists) => {
  const seen = new Set();
  return fileLists
    .flat()
    .filter(file => file && !seen.has(file.normalized) && !seen.add(file.normalized));
};

// ============================================================================
// AI Selection
// ============================================================================

const buildAIPrompt = (question, fileNames, maxResults) => {
  const trimmed = question.length > config.limits.maxQuestionLength
    ? `${question.slice(0, config.limits.maxQuestionLength)}…`
    : question;

  return `You are a file selection assistant. Your task is to determine which files, if any, are needed to answer the user's question.

USER QUESTION:
${trimmed}

AVAILABLE FILES:
${fileNames.map(name => `- ${name}`).join('\n')}

SELECTION CRITERIA:
1. Only select files when the user explicitly requests file content
2. Do NOT select files for general questions that don't require file access
3. Select the most relevant files based on:
   - File name matching question keywords
   - File type relevance (e.g., .pdf for documents, .csv for data)
   - Context clues in the question
4. Maximum files to select: ${maxResults}
5. When multiple files match, prioritize exact name matches over partial matches

OUTPUT FORMAT:
Return ONLY a valid JSON array. No explanation, no markdown, no extra text.
- If files are needed: ["file1.pdf", "file2.csv"]
- If no files are needed: []
`
};

const selectFilesWithAI = async ({ question, fileRecords, aiModel, maxResults, logger }) => {
  try {
    const schema = z.object({
      files: z.array(z.string().min(1).max(500)).max(maxResults).default([]),
    });

    const fileNames = fileRecords.map(f => f.original);
    const prompt = buildAIPrompt(question, fileNames, maxResults);

    logger.info('Prompt Start for model', aiModel);
    logger.info(prompt);
    logger.info('Prompt End');

    const { object } = await generateObject({
      model: openai(aiModel),
      schema,
      prompt,
      cache: false,
    });

    const fileMap = new Map(fileRecords.map(f => [f.original, f]));
    const seen = new Set();
    
    return (object?.files || [])
      .map(name => fileMap.get(name))
      .filter(file => file && !seen.has(file.normalized) && !seen.add(file.normalized));
  } catch (error) {
    logger?.warn?.('AI selection failed', { error: error.message });
    return [];
  }
};

// ============================================================================
// Database Operations
// ============================================================================

const loadFilesFromDb = async ({ pool, maxFiles, logger }) => {
  const client = await pool.connect();
  try {
    const limit = Math.max(1, Math.min(maxFiles, config.limits.maxDbLimit));
    const result = await client.query(
      `SELECT DISTINCT ${config.docNameColumn} AS name
       FROM lightrag_doc_full
       WHERE ${config.docNameColumn} IS NOT NULL AND ${config.docNameColumn} <> ''
       LIMIT $1`,
      [limit]
    );

    return result.rows
      .map(row => normalizeFilename(row?.name))
      .filter(Boolean);
  } finally {
    client.release();
  }
};

// ============================================================================
// Service Class
// ============================================================================

export class RelevantFileService {
  constructor(options = {}) {
    this.databaseUrl = options.databaseUrl;
    this.aiModel = options.aiModel || config.defaults.model;
    this.maxFiles = options.maxFiles || config.defaults.maxFiles;
    this.maxResults = options.maxResults || config.defaults.maxResults;
    this.openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;
    this.reloadIntervalMs = options.reloadIntervalMs || config.defaults.reloadInterval;

    this.pool = null;
    this.cache = {
      records: null,
      loadedAt: 0,
      loadPromise: null,
    };
    this.disabled = false;
  }

  async getRelevantFiles({ question, logger }) {
    if (!question?.trim()) {
      return this.emptyResponse();
    }

    try {
      const fileRecords = await this.ensureFileRecords(logger);
      
      if (!fileRecords.length) {
        logger?.info?.('No filenames available', {
          querySnippet: formatQuerySnippet(question),
          totalFilesConsidered: 0,
        });
        return this.emptyResponse();
      }

      const explicitMatches = findMatches(question, fileRecords);
      const aiSelected = await this.selectWithAI(question, fileRecords, explicitMatches, logger);
      const combined = deduplicateFiles(aiSelected, explicitMatches);

      this.logSelectionSummary(logger, question, fileRecords.length, explicitMatches.length, aiSelected.length, combined.length);

      return {
        relevantFiles: combined.map(f => f.original),
        metadata: {
          usedAI: Boolean(this.openAiApiKey),
          fileListAvailable: true,
        },
      };
    } catch (error) {
      logger?.warn?.('Failed to determine relevant files', { error: error.message });
      logger?.info?.('Relevant file selection failed', {
        querySnippet: formatQuerySnippet(question),
      });
      return {
        relevantFiles: [],
        metadata: {
          usedAI: Boolean(this.openAiApiKey),
          fileListAvailable: false,
        },
      };
    }
  }

  async ensureFileRecords(logger) {
    if (this.disabled) return [];

    const isCacheValid = this.cache.records && 
                        this.cache.loadedAt && 
                        (Date.now() - this.cache.loadedAt < this.reloadIntervalMs);
    
    if (isCacheValid) return this.cache.records;

    if (!this.cache.loadPromise) {
      this.cache.loadPromise = this.loadFileRecords(logger)
        .then(records => {
          this.cache.records = records;
          this.cache.loadedAt = Date.now();
          return records;
        })
        .catch(error => {
          logger?.warn?.('Failed to load filenames from database', { error: error.message });
          this.disabled = true;
          return [];
        })
        .finally(() => {
          this.cache.loadPromise = null;
        });
    }

    return this.cache.loadPromise;
  }

  async loadFileRecords(logger) {
    if (!this.databaseUrl) {
      logger?.info?.('DATABASE_URL not configured; skipping filename retrieval.');
      return [];
    }

    if (!this.pool) {
      this.pool = new Pool({ connectionString: this.databaseUrl });
    }

    return loadFilesFromDb({
      pool: this.pool,
      maxFiles: this.maxFiles,
      logger,
    });
  }

  async selectWithAI(question, fileRecords, fallbackMatches, logger) {
    if (!this.openAiApiKey) return fallbackMatches;

    const selected = await selectFilesWithAI({
      question,
      fileRecords,
      aiModel: this.aiModel,
      maxResults: this.maxResults,
      logger,
    });

    return selected.length ? selected : fallbackMatches;
  }

  emptyResponse() {
    return {
      relevantFiles: [],
      metadata: { usedAI: false, fileListAvailable: false },
    };
  }

  logSelectionSummary(logger, question, total, explicit, ai, combined) {
    logger?.info?.('Relevant file selection summary', {
      querySnippet: formatQuerySnippet(question),
      totalFilesConsidered: total,
      explicitMatchCount: explicit,
      aiSelectedCount: ai,
      combinedCount: combined,
    });
  }
}