const path = require("path");

try {
  require("dotenv").config({ path: path.resolve(__dirname, ".env") });
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") {
    throw error;
  }
}

const { App, ExpressReceiver } = require("@slack/bolt");
const axios = require("axios");

const SLACK_SOCKET_MODE =
  (process.env.SLACK_SOCKET_MODE || "").toLowerCase() === "true";
const SLACK_EVENTS_PATH = process.env.SLACK_EVENTS_PATH || "/slack/action-endpoint";
const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;

if (!process.env.SLACK_BOT_TOKEN) {
  throw new Error("SLACK_BOT_TOKEN is required");
}

if (!SLACK_SOCKET_MODE && !SLACK_SIGNING_SECRET) {
  throw new Error("SLACK_SIGNING_SECRET is required when socket mode is disabled");
}

const receiver = SLACK_SOCKET_MODE
  ? undefined
  : new ExpressReceiver({
      signingSecret: SLACK_SIGNING_SECRET,
      endpoints: { events: SLACK_EVENTS_PATH },
    });

if (receiver) {
  receiver.router.get("/", (_req, res) => {
    res.status(200).send("Slack bot is running");
  });
}

const LIGHT_RAG_BASE_URL = (process.env.LIGHT_RAG_URL || "http://127.0.0.1:9621").replace(
  /\/$/,
  ""
);
const LIGHT_RAG_TIMEOUT_MS = Number(process.env.LIGHT_RAG_TIMEOUT_MS) || 30000;
const LIGHT_RAG_API_KEY = process.env.LIGHT_RAG_API_KEY || "";
const LIGHT_RAG_SETTINGS = {
  mode: process.env.LIGHT_RAG_MODE || "hybrid",
  only_need_context: false,
  only_need_prompt: false,
  response_type: process.env.LIGHT_RAG_RESPONSE_TYPE || "Multiple Paragraphs",
  top_k: Number(process.env.LIGHT_RAG_TOP_K) || 40,
  chunk_top_k: Number(process.env.LIGHT_RAG_CHUNK_TOP_K) || 10,
  max_entity_tokens: Number(process.env.LIGHT_RAG_MAX_ENTITY_TOKENS) || 6000,
  max_relation_tokens: Number(process.env.LIGHT_RAG_MAX_RELATION_TOKENS) || 8000,
  max_total_tokens: Number(process.env.LIGHT_RAG_MAX_TOTAL_TOKENS) || 30000,
  user_prompt: process.env.LIGHT_RAG_USER_PROMPT || "",
  enable_rerank:
    process.env.LIGHT_RAG_ENABLE_RERANK === undefined
      ? true
      : process.env.LIGHT_RAG_ENABLE_RERANK.toLowerCase() === "true",
  include_references:
    process.env.LIGHT_RAG_INCLUDE_REFERENCES === undefined
      ? true
      : process.env.LIGHT_RAG_INCLUDE_REFERENCES.toLowerCase() === "true",
  stream: false,
};

const appOptions = {
  token: process.env.SLACK_BOT_TOKEN,
};

if (SLACK_SOCKET_MODE) {
  if (!process.env.SLACK_APP_TOKEN) {
    throw new Error("SLACK_APP_TOKEN is required when socket mode is enabled");
  }

  appOptions.socketMode = true;
  appOptions.appToken = process.env.SLACK_APP_TOKEN;
} else if (receiver) {
  appOptions.receiver = receiver;
}

const app = new App(appOptions);

function cleanQuestion(text) {
  if (!text) {
    return "";
  }

  return text.replace(/\s+/g, " ").trim();
}

function removeBotMention(text, botUserId) {
  if (!text || !botUserId) {
    return text;
  }

  const mentionPattern = new RegExp(`<@${botUserId}>`, "g");
  return text.replace(mentionPattern, "");
}

function chunkText(text, maxLength) {
  if (!text) {
    return [];
  }

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf("\n", maxLength);

    if (splitIndex === -1 || splitIndex < maxLength * 0.6) {
      splitIndex = maxLength;
    }

    const chunk = remaining.slice(0, splitIndex);
    chunks.push(chunk);
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}

function buildMarkdownBlocks(text) {
  if (!text) {
    return [];
  }

  if (text.length <= 3000) {
    return [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text,
        },
      },
    ];
  }

  const chunks = chunkText(text, 3000);

  return chunks.map((chunk) => ({
    type: "section",
    text: {
      type: "mrkdwn",
      text: chunk,
    },
  }));
}

function stripEmbeddedReferences(text) {
  if (!text) {
    return "";
  }

  const referencesPattern =
    /^(?:#{1,6}\s*)?(?:\*\*|__)?references(?:\s*(?:\*\*|__))?\s*:?\s*$/i;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const referenceIndex = lines.findIndex((line) => referencesPattern.test(line.trim()));

  if (referenceIndex === -1) {
    return text;
  }

  return lines.slice(0, referenceIndex).join("\n").trim();
}

function sanitizeMarkdownForSlack(text) {
  if (!text) {
    return "";
  }

  let sanitized = text.trim();

  sanitized = sanitized.replace(/\r\n?/g, "\n");

  sanitized = sanitized.replace(/^#{1,6}\s+(.+)$/gm, (_, heading) => `*${heading.trim()}*`);

  sanitized = sanitized.replace(/^\s*[-*]\s+/gm, "• ");

  sanitized = sanitized.replace(/\n{3,}/g, "\n\n");

  return sanitized.trim();
}

function formatLightRagResponse(data) {
  const baseResponse =
    (typeof data?.response === "string" && data.response.trim()) ||
    "I couldn't find a confident answer to that just yet.";
  const references = Array.isArray(data?.references) ? data.references : [];

  const responseWithoutEmbeddedReferences = stripEmbeddedReferences(baseResponse);
  const sanitizedResponse = sanitizeMarkdownForSlack(responseWithoutEmbeddedReferences);

  if (!references.length) {
    return sanitizedResponse;
  }

  const referenceLines = references.map((ref, index) => {
    const identifier = ref.reference_id ? `[${ref.reference_id}] ` : "";
    const source = ref.file_path || ref.title || "Unknown source";
    return `${index + 1}. ${identifier}${source}`;
  });

  const referencesSection = `*References*\n${referenceLines.join("\n")}`;

  return [sanitizedResponse, referencesSection].filter(Boolean).join("\n\n");
}

async function queryLightRag(question, logger) {
  const payload = {
    ...LIGHT_RAG_SETTINGS,
    query: question,
  };

  try {
    const { data } = await axios.post(`${LIGHT_RAG_BASE_URL}/query`, payload, {
      timeout: LIGHT_RAG_TIMEOUT_MS,
      headers: LIGHT_RAG_API_KEY
        ? {
            "X-API-Key": LIGHT_RAG_API_KEY,
          }
        : undefined,
    });

    return data;
  } catch (error) {
    logger.info("Request payload to LightRAG", JSON.stringify(error.response?.config?.data));
    logger.info("LightRAG response data", JSON.stringify(error.response?.data));
    logger.error("LightRAG request failed", {
      error: error.message,
      status: error.response?.status,
    });
    throw new Error("LightRAG request failed");
  }
}

async function respondWithLightRag({ channel, thread_ts, question, client, logger, userId }) {
  const targetThreadTs = thread_ts;
  const cleanedQuestion = cleanQuestion(question);

  if (!cleanedQuestion) {
    await client.chat.postMessage({
      channel,
      thread_ts: targetThreadTs,
      text: "I didn't catch a question there. Could you try asking again?",
    });
    return;
  }

  try {
    const response = await queryLightRag(cleanedQuestion, logger);
    const formattedAnswer = formatLightRagResponse(response);
    const blocks = buildMarkdownBlocks(formattedAnswer);

    await client.chat.postMessage({
      channel,
      thread_ts: targetThreadTs,
      text: formattedAnswer,
      mrkdwn: true,
      blocks: blocks,
      unfurl_links: false,
      unfurl_media: false,
    });
  } catch (error) {
    logger.error("Failed to respond with LightRAG answer", { error: error.message });
    await client.chat.postMessage({
      channel,
      thread_ts: targetThreadTs,
      text: "Sorry, I ran into a problem reaching LightRAG. Please try again shortly.",
      mrkdwn: true,
      blocks: buildMarkdownBlocks("Sorry, I ran into a problem reaching LightRAG. Please try again shortly."),
    });
  }
}

app.message(async ({ message, client, logger, context }) => {
  if (message.subtype || message.bot_id || message.user === context.botUserId) {
    return;
  }

  if (message.channel_type !== "im") {
    return;
  }

  const threadTs = message.thread_ts || message.ts;

  await respondWithLightRag({
    channel: message.channel,
    thread_ts: threadTs,
    question: message.text,
    client,
    logger,
    userId: message.user,
  });
});

app.event("app_mention", async ({ event, client, logger, context }) => {
  if (event.bot_id || event.subtype === "bot_message") {
    return;
  }

  const withoutMention = removeBotMention(event.text, context.botUserId);

  await respondWithLightRag({
    channel: event.channel,
    thread_ts: event.thread_ts || event.ts,
    question: withoutMention,
    client,
    logger,
    userId: event.user,
  });
});

(async () => {
  const port = Number(process.env.PORT) || 3000;
  await app.start(port);

  app.logger.info(
    `⚡️ Bolt app is running! Listening on port ${port}${
      SLACK_SOCKET_MODE ? " (socket mode enabled)" : ` with endpoint ${SLACK_EVENTS_PATH}`
    }`
  );
})();
