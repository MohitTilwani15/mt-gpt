/**
 * Registers the feedback block action handler.
 *
 * @param {import('@slack/bolt').App} app
 */
export const registerFeedbackAction = (app) => {
  app.action('feedback', async ({ ack, body, client, logger }) => {
    try {
      await ack();

      if (body.type !== 'block_actions' || body.actions[0].type !== 'feedback_buttons') {
        return;
      }

      const messageTs = body.message.ts;
      const channelId = body.channel.id;
      const userId = body.user.id;
      const value = body.actions[0].value;

      const text =
        value === 'good-feedback'
          ? "Thanks for the feedback! I'm glad that helped."
          : "Thanks for letting me know. I'll try to do better next time.";

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        thread_ts: messageTs,
        text,
      });
    } catch (error) {
      logger.error(`:warning: Feedback action failed ${error}`);
    }
  });
};
