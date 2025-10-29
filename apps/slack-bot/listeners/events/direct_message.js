import { feedbackBlock } from '../views/feedback_block.js';
import { respondWithLightRag } from '../../services/light-rag-responder.js';

/**
 * Registers the direct message handler for the bot.
 *
 * @param {import('@slack/bolt').App} app
 */
export const registerDirectMessage = (app) => {
  app.message(async ({ message, client, logger, context, event }) => {
    if (
      message.subtype ||
      message.bot_id ||
      message.user === context.botUserId ||
      message.channel_type !== 'im'
    ) {
      return;
    }

    const threadTs = event.thread_ts || message.thread_ts || message.ts;

    await respondWithLightRag({
      channel: message.channel,
      threadTs,
      messageTs: message.ts,
      question: message.text,
      client,
      logger,
      userId: message.user,
      teamId: context.teamId || context.team_id,
      botUserId: context.botUserId,
      extraBlocks: [feedbackBlock],
    });
  });
};
