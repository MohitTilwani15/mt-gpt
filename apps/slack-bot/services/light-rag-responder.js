import axios from 'axios';
import { TextDecoder } from 'util';
import { RelevantFileService } from './relevant-file-service.js';

// ============================================================================
// Configuration
// ============================================================================

const config = {
  baseUrl: (process.env.LIGHT_RAG_URL || 'http://127.0.0.1:9621').replace(/\/$/, ''),
  timeout: Number(process.env.LIGHT_RAG_TIMEOUT_MS) || 30000,
  apiKey: process.env.LIGHT_RAG_API_KEY || '',
  historyLimit: 4,
  maxChunkLength: 3000,
  settings: {
    mode: process.env.LIGHT_RAG_MODE || 'hybrid',
    only_need_context: false,
    only_need_prompt: false,
    response_type: process.env.LIGHT_RAG_RESPONSE_TYPE || 'Multiple Paragraphs',
    top_k: Number(process.env.LIGHT_RAG_TOP_K) || 40,
    chunk_top_k: Number(process.env.LIGHT_RAG_CHUNK_TOP_K) || 10,
    max_entity_tokens: Number(process.env.LIGHT_RAG_MAX_ENTITY_TOKENS) || 6000,
    max_relation_tokens: Number(process.env.LIGHT_RAG_MAX_RELATION_TOKENS) || 8000,
    max_total_tokens: Number(process.env.LIGHT_RAG_MAX_TOTAL_TOKENS) || 30000,
    user_prompt: process.env.LIGHT_RAG_USER_PROMPT || '',
    enable_rerank: process.env.LIGHT_RAG_ENABLE_RERANK !== 'false',
    include_references: process.env.LIGHT_RAG_INCLUDE_REFERENCES !== 'false',
    stream: true,
  },
  loadingMessages: [
    'Teaching the hamsters to type faster…',
    'Untangling the internet cables…',
    'Consulting the office goldfish…',
    'Polishing up the response just for you…',
    'Issuing a subpoena to the spellchecker…',
    'Asking ChatGPT’s cousin for advice…',
    'Convincing the AI to stop overthinking…',
    'Considering settlement with common sense…',
  ],
};

const relevantFileService = new RelevantFileService({
  databaseUrl: process.env.DATABASE_URL,
  aiModel: process.env.SLACK_BOT_AI_MODEL,
  maxFiles: Number(process.env.SLACK_BOT_FILE_CANDIDATE_LIMIT) || 500,
  maxResults: Number(process.env.SLACK_BOT_FILE_RESULT_LIMIT) || 5,
  openAiApiKey: process.env.OPENAI_API_KEY,
});

// ============================================================================
// Text Processing Utilities
// ============================================================================

const cleanText = (text) => text?.replace(/\s+/g, ' ').trim() || '';

export const removeBotMention = (text, botUserId) => {
  if (!text || !botUserId) return text;
  return text.replace(new RegExp(`<@${botUserId}>`, 'g'), '').trim();
};

const chunkText = (text, maxLength = config.maxChunkLength) => {
  if (!text || text.length <= maxLength) return [text].filter(Boolean);

  const chunks = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength * 0.6) {
      splitIndex = maxLength;
    }
    chunks.push(remaining.slice(0, splitIndex));
    remaining = remaining.slice(splitIndex).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
};

// ============================================================================
// Slack Message Formatting
// ============================================================================

const buildMarkdownBlocks = (text) => {
  if (!text) return [];
  
  return chunkText(text).map(chunk => ({
    type: 'section',
    text: { type: 'mrkdwn', text: chunk },
  }));
};

// ============================================================================
// LightRAG API
// ============================================================================

const parseLightRagStream = async ({ stream, logger }) => {
  const decoder = new TextDecoder();
  let buffer = '';
  const responseParts = [];
  let references;

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    try {
      const event = JSON.parse(trimmed);
      if (Array.isArray(event.references)) {
        references = event.references;
      }
      if (typeof event.response === 'string') {
        responseParts.push(event.response);
      }
    } catch (error) {
      logger?.debug?.('Failed to parse LightRAG stream line', {
        line: trimmed,
        error: error.message,
      });
    }
  };

  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let newlineIndex = buffer.indexOf('\n');

    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
      buffer = buffer.slice(newlineIndex + 1);
      processLine(line);
      newlineIndex = buffer.indexOf('\n');
    }
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  const combined = responseParts.join('');
  const cleaned = combined.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

  return {
    response: cleaned || combined.trim(),
    references,
  };
};

const queryLightRag = async ({ question, conversationHistory, filePathFilters, logger }) => {
  const payload = {
    ...config.settings,
    query: question,
    ...(conversationHistory?.length && { conversation_history: conversationHistory }),
    ...(filePathFilters?.length && { file_path_filters: filePathFilters }),
  };

  try {
    const response = await axios.post(`${config.baseUrl}/query/stream`, payload, {
      timeout: config.timeout,
      responseType: 'stream',
      ...(config.apiKey && { headers: { 'X-API-Key': config.apiKey } }),
    });
    return await parseLightRagStream({ stream: response.data, logger });
  } catch (error) {
    logger?.info?.('LightRAG request payload', error.response?.config?.data);
    logger?.info?.('LightRAG response data', error.response?.data);
    logger?.error?.('LightRAG request failed', {
      error: error.message,
      status: error.response?.status,
    });
    throw new Error('LightRAG request failed');
  }
};

// ============================================================================
// Conversation History
// ============================================================================

const buildConversationHistory = async ({
  client,
  channel,
  threadTs,
  currentMessageTs,
  botUserId,
  logger,
}) => {
  if (!threadTs) return [];

  try {
    const { messages } = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 100,
    });

    if (!messages?.length) return [];

    const currentTs = Number(currentMessageTs || threadTs);
    const history = messages
      .filter(msg => {
        if (!msg?.ts || Number(msg.ts) >= currentTs) return false;
        if (msg.subtype && msg.subtype !== 'bot_message') return false;
        return true;
      })
      .map(msg => {
        const text = cleanText(
          botUserId ? removeBotMention(msg.text, botUserId) : msg.text
        );
        if (!text) return null;
        
        const isBot = msg.user === botUserId || msg.bot_id || msg.subtype === 'bot_message';
        return { role: isBot ? 'assistant' : 'user', content: text };
      })
      .filter(Boolean);

    return history.slice(-config.historyLimit);
  } catch (error) {
    logger?.warn?.('Failed to build conversation history', { error: error.message });
    return [];
  }
};

// ============================================================================
// Slack Assistant Thread Management
// ============================================================================

const setThreadTitle = async ({ client, channel, threadTs, title, logger }) => {
  if (!title) return;
  
  try {
    await client.assistant.threads.setTitle({
      channel_id: channel,
      thread_ts: threadTs,
      title: title.slice(0, 250),
    });
  } catch (error) {
    logger?.debug?.('Unable to set thread title', { error: error.message });
  }
};

const setThreadStatus = async ({ client, channel, threadTs, status, logger }) => {
  try {
    await client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts: threadTs,
      ...status,
    });
  } catch (error) {
    logger?.debug?.('Unable to set thread status', { error: error.message });
  }
};

// ============================================================================
// Message Sending
// ============================================================================

const sendStreamedMessage = async ({ client, channel, threadTs, userId, teamId, text, extraBlocks, logger }) => {
  const chunks = chunkText(text);
  const streamerOptions = {
    channel,
    thread_ts: threadTs,
    recipient_user_id: userId,
    ...(teamId && { recipient_team_id: teamId }),
  };

  try {
    const streamer = client.chatStream(streamerOptions);
    
    for (const chunk of chunks) {
      if (chunk) await streamer.append({ markdown_text: chunk });
    }
    
    await streamer.stop(extraBlocks?.length ? { blocks: extraBlocks } : undefined);
    return true;
  } catch (error) {
    logger?.warn?.('Streaming failed, using fallback', { error: error.message });
    return false;
  }
};

const sendFallbackMessage = async ({ client, channel, threadTs, text, extraBlocks }) => {
  const blocks = [
    ...buildMarkdownBlocks(text),
    ...(extraBlocks || []),
  ];

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text,
    mrkdwn: true,
    blocks,
    reply_broadcast: false,
    unfurl_links: false,
    unfurl_media: false,
  });
};

const sendMessage = async (params) => {
  const streamed = await sendStreamedMessage(params);
  if (!streamed) {
    await sendFallbackMessage(params);
  }
};

// ============================================================================
// Main Entry Point
// ============================================================================

export const respondWithLightRag = async ({
  channel,
  threadTs,
  messageTs,
  question,
  client,
  logger,
  userId,
  teamId,
  botUserId,
  extraBlocks = [],
}) => {
  const cleanedQuestion = cleanText(question);
  const targetThreadTs = threadTs || messageTs;

  if (!cleanedQuestion) {
    await client.chat.postMessage({
      channel,
      thread_ts: targetThreadTs,
      text: "I didn't catch a question there. Could you try asking again?",
    });
    return;
  }

  await setThreadTitle({
    client,
    channel,
    threadTs: targetThreadTs,
    title: cleanedQuestion,
    logger,
  });

  await setThreadStatus({
    client,
    channel,
    threadTs: targetThreadTs,
    status: {
      status: 'thinking...',
      loading_messages: config.loadingMessages,
    },
    logger,
  });

  try {
    const [conversationHistory, relevanceInfo] = await Promise.all([
      buildConversationHistory({
        client,
        channel,
        threadTs: targetThreadTs,
        currentMessageTs: messageTs,
        botUserId,
        logger,
      }),
      relevantFileService.getRelevantFiles({ question: cleanedQuestion, logger }),
    ]);

    const filePathFilters = relevanceInfo?.metadata?.fileListAvailable
      ? relevanceInfo.relevantFiles.filter(f => f?.trim())
      : undefined;

    if (filePathFilters?.length) {
      logger?.info?.('Using relevant files', { relevantFiles: filePathFilters });
    }

    logger?.info?.('Querying LightRAG', {
      channel,
      thread_ts: targetThreadTs,
      userId,
      filterCount: filePathFilters?.length || 0,
    });

    const response = await queryLightRag({
      question: cleanedQuestion,
      conversationHistory,
      filePathFilters,
      logger,
    });

    const finalAnswer =
      response?.response?.trim() || "I couldn't find a confident answer to that just yet.";

    await sendMessage({
      client,
      channel,
      threadTs: targetThreadTs,
      userId,
      teamId,
      text: finalAnswer,
      extraBlocks,
      logger,
    });

    await setThreadStatus({
      client,
      channel,
      threadTs: targetThreadTs,
      status: { status: 'done', loading_messages: [] },
      logger,
    });
  } catch (error) {
    logger?.error?.('Failed to respond with LightRAG', { error: error.message });
    
    const errorText = 'Sorry, I ran into a problem reaching LightRAG. Please try again shortly.';
    await client.chat.postMessage({
      channel,
      thread_ts: targetThreadTs,
      text: errorText,
      mrkdwn: true,
      blocks: buildMarkdownBlocks(errorText),
    });

    await setThreadStatus({
      client,
      channel,
      threadTs: targetThreadTs,
      status: { status: 'failed', loading_messages: [] },
      logger,
    });
  }
};
