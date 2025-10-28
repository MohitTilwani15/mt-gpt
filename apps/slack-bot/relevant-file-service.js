const { Pool } = require("pg");
const { generateObject } = require("ai");
const { openai } = require("@ai-sdk/openai");
const { z } = require("zod");

const DOC_NAME_COLUMN = "doc_name";
const DEFAULT_MAX_FILES = 500;
const DEFAULT_MAX_RESULTS = 5;
const DEFAULT_MODEL = "gpt-5-nano";

function normalizeForComparison(value) {
  if (!value || typeof value !== "string") {
    return "";
  }
  return value.trim().replace(/\\/g, "/").toLowerCase();
}

function removeFileExtension(value) {
  if (!value) {
    return "";
  }
  const lastDot = value.lastIndexOf(".");
  if (lastDot <= 0) {
    return value;
  }
  return value.slice(0, lastDot);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildVariantSet(normalizedValue) {
  const variants = new Set();
  if (!normalizedValue) {
    return variants;
  }

  variants.add(normalizedValue);

  const pathSegments = normalizedValue.split("/");
  const baseName = pathSegments[pathSegments.length - 1] || "";
  if (baseName) {
    variants.add(baseName);
    const withoutExtension = removeFileExtension(baseName);
    if (withoutExtension && withoutExtension.length >= 3) {
      variants.add(withoutExtension);
    }
  }

  return variants;
}

function formatQuerySnippet(text) {
  if (!text || typeof text !== "string") {
    return "";
  }
  const condensed = text.replace(/\s+/g, " ").trim();
  if (!condensed) {
    return "";
  }
  return condensed.length <= 200 ? condensed : `${condensed.slice(0, 200)}…`;
}

function buildRecord(name) {
  const normalized = normalizeForComparison(name);
  if (!normalized) {
    return null;
  }

  const baseName = normalized.split("/").pop() || "";
  const baseNameNoExt = removeFileExtension(baseName);

  const regexBase = baseName && baseName.length >= 3 ? new RegExp(`\\b${escapeRegExp(baseName)}\\b`, "i") : null;
  const regexBaseNoExt =
    baseNameNoExt && baseNameNoExt.length >= 3
      ? new RegExp(`\\b${escapeRegExp(baseNameNoExt)}\\b`, "i")
      : null;

  const variants = buildVariantSet(normalized);

  return {
    original: name,
    normalized,
    baseName,
    baseNameNoExt,
    regexBase,
    regexBaseNoExt,
    variants,
  };
}

function recordMatchesQuestion(record, question, normalizedQuestion) {
  if (!record || !normalizedQuestion) {
    return false;
  }

  if (record.normalized && normalizedQuestion.includes(record.normalized)) {
    return true;
  }

  if (record.baseName) {
    if (record.baseName.includes(".") && normalizedQuestion.includes(record.baseName)) {
      return true;
    }
    if (record.regexBase && record.regexBase.test(question)) {
      return true;
    }
  }

  if (record.regexBaseNoExt && record.regexBaseNoExt.test(question)) {
    return true;
  }

  return false;
}

class RelevantFileService {
  constructor(options = {}) {
    this.databaseUrl = options.databaseUrl;
    this.aiModel = options.aiModel || DEFAULT_MODEL;
    this.maxFiles = options.maxFiles || DEFAULT_MAX_FILES;
    this.maxResults = options.maxResults || DEFAULT_MAX_RESULTS;
    this.openAiApiKey = options.openAiApiKey || process.env.OPENAI_API_KEY;

    this.pool = null;
    this.fileRecords = null;
    this.fileRecordsPromise = null;
    this.disabled = false;
    this.lastLoadedAt = 0;
    this.reloadIntervalMs = options.reloadIntervalMs || 10 * 60 * 1000;
  }

  async getRelevantFiles({ question, logger }) {
    if (!question || !question.trim()) {
      return {
        relevantFiles: [],
        metadata: { usedAI: false, fileListAvailable: false },
      };
    }

    const normalizedQuestion = normalizeForComparison(question);
    const now = Date.now();

    try {
      const fileRecords = await this.ensureFileRecords({ logger, now });
      if (!fileRecords.length) {
        if (logger && typeof logger.info === "function") {
          logger.info("No filenames available for relevance selection", {
            querySnippet: formatQuerySnippet(question),
            totalFilesConsidered: 0,
          });
        }
        return {
          relevantFiles: [],
          metadata: { usedAI: false, fileListAvailable: false },
        };
      }

      const explicitMatches = this.detectExplicitMatches({
        question,
        normalizedQuestion,
        fileRecords,
      });

      const relevantRecords = await this.identifyRelevantRecords({
        question,
        fileRecords,
        explicitMatches,
        logger,
      });
      const combinedRecords = this.mergeRelevantRecords(relevantRecords, explicitMatches);

      if (logger && typeof logger.info === "function") {
        logger.info("Relevant file selection summary", {
          querySnippet: formatQuerySnippet(question),
          totalFilesConsidered: fileRecords.length,
          explicitMatchCount: explicitMatches.length,
          aiSelectedCount: relevantRecords.length,
          combinedCount: combinedRecords.length,
        });
      }

      return {
        relevantFiles: combinedRecords.map((record) => record.original),
        metadata: {
          usedAI: Boolean(this.openAiApiKey),
          fileListAvailable: true,
        },
      };
    } catch (error) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("Failed to determine relevant files", { error: error.message });
      }
      if (logger && typeof logger.info === "function") {
        logger.info("Relevant file selection failed", {
          querySnippet: formatQuerySnippet(question),
        });
      }
      return {
        relevantFiles: [],
        metadata: { usedAI: Boolean(this.openAiApiKey), fileListAvailable: false },
      };
    }
  }

  async ensureFileRecords({ logger, now }) {
    if (this.disabled) {
      return [];
    }

    if (
      this.fileRecords &&
      this.lastLoadedAt &&
      now - this.lastLoadedAt < this.reloadIntervalMs
    ) {
      return this.fileRecords;
    }

    if (!this.fileRecordsPromise) {
      this.fileRecordsPromise = this.loadFileRecords(logger)
        .then((records) => {
          this.fileRecords = records;
          this.lastLoadedAt = Date.now();
          this.fileRecordsPromise = null;
          return records;
        })
        .catch((error) => {
          this.fileRecordsPromise = null;
          if (logger && typeof logger.warn === "function") {
            logger.warn("Failed to load filenames from database", { error: error.message });
          }
          this.disabled = true;
          return [];
        });
    }

    return this.fileRecordsPromise;
  }

  async loadFileRecords(logger) {
    if (!this.databaseUrl) {
      if (logger && typeof logger.info === "function") {
        logger.info("DATABASE_URL not configured; skipping filename retrieval.");
      }
      return [];
    }

    if (!this.pool) {
      this.pool = new Pool({
        connectionString: this.databaseUrl,
      });
    }

    const client = await this.pool.connect();
    try {
      const limit = Math.max(1, Math.min(this.maxFiles, 2000));
      const queryText = `
        SELECT DISTINCT ${DOC_NAME_COLUMN} AS name
        FROM lightrag_doc_full
        WHERE ${DOC_NAME_COLUMN} IS NOT NULL AND ${DOC_NAME_COLUMN} <> ''
        LIMIT $1
      `;
      const result = await client.query(queryText, [limit]);
      const records = [];

      for (const row of result.rows) {
        if (!row?.name || typeof row.name !== "string") {
          continue;
        }
        const record = buildRecord(row.name);
        if (record) {
          records.push(record);
        }
      }

      return records;
    } finally {
      client.release();
    }
  }

  detectExplicitMatches({ question, normalizedQuestion, fileRecords }) {
    if (!question || !normalizedQuestion) {
      return [];
    }

    const matches = [];
    const seen = new Set();

    for (const record of fileRecords) {
      if (!record) {
        continue;
      }
      if (recordMatchesQuestion(record, question, normalizedQuestion)) {
        if (!seen.has(record.normalized)) {
          seen.add(record.normalized);
          matches.push(record);
        }
      }
    }

    return matches;
  }

  async identifyRelevantRecords({ question, fileRecords, explicitMatches, logger }) {
    if (!this.openAiApiKey) {
      return explicitMatches;
    }

    try {
      const schema = z.object({
        files: z.array(z.string().min(1).max(500)).max(this.maxResults).default([]),
      });

      const fileNames = fileRecords.map((record) => record.original);
      const trimmedQuestion = question.length > 1200 ? `${question.slice(0, 1200)}…` : question;
const prompt = `You are a reasoning assistant that decides whether the user's question requires using any of the provided files.

User question:
${trimmedQuestion}

Available files:
- ${fileNames.join("\n- ")}

Instructions:
- Only select and return file names if the user explicitly refers to or implies using a file (e.g. "open", "use", "show", "read", "from file", "in document", "check X file", etc.).
- If the user is not asking to use or reference any file, return an empty list [].
- When selecting files, choose at most ${this.maxResults} file names from the list above that best match what the user requested.
- Always return only a JSON array of file names (e.g., ["contract.pdf"]) or an empty list [] — no explanations or extra text.
`;

      const { object } = await generateObject({
        model: openai(this.aiModel),
        schema,
        prompt,
      });

      const recordMap = new Map(fileRecords.map((record) => [record.original, record]));
      const selectedRecords = [];
      const seen = new Set();

      for (const fileName of object?.files || []) {
        if (typeof fileName !== "string") {
          continue;
        }
        const record = recordMap.get(fileName);
        if (record && !seen.has(record.normalized)) {
          seen.add(record.normalized);
          selectedRecords.push(record);
        }
      }

      if (!selectedRecords.length) {
        return explicitMatches;
      }

      return selectedRecords;
    } catch (error) {
      if (logger && typeof logger.warn === "function") {
        logger.warn("AI relevance selection failed", { error: error.message });
      }
      return explicitMatches;
    }
  }

  mergeRelevantRecords(primaryRecords, explicitMatches) {
    const orderedRecords = [];
    const seen = new Set();

    const pushRecord = (record) => {
      if (record && !seen.has(record.normalized)) {
        seen.add(record.normalized);
        orderedRecords.push(record);
      }
    };

    for (const record of primaryRecords || []) {
      pushRecord(record);
    }

    for (const record of explicitMatches || []) {
      pushRecord(record);
    }

    return orderedRecords;
  }
}

module.exports = {
  RelevantFileService,
};
