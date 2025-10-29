import { feedbackBlock } from '../views/feedback_block.js';
import { removeBotMention, respondWithLightRag } from '../../services/light-rag-responder.js';

/**
 * Registers the handler for app mentions in channels.
 *
 * @param {import('@slack/bolt').App} app
 */
export const registerAppMention = (app) => {
  app.event('app_mention', async ({ event, client, logger, context }) => {
    if (event.bot_id || event.subtype === 'bot_message') {
      return;
    }

    const threadTs = event.thread_ts || event.ts;
    const cleanedQuestion = removeBotMention(event.text, context.botUserId);

    await respondWithLightRag({
      channel: event.channel,
      threadTs,
      messageTs: event.ts,
      question: cleanedQuestion,
      client,
      logger,
      userId: event.user,
      teamId: event.team,
      botUserId: context.botUserId,
      extraBlocks: [feedbackBlock],
    });
  });
};
